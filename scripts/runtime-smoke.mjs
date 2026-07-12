const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runRuntimeSmoke(bunject) {
  const expectedExports = [
    "Container",
    "Injectable",
    "RegistrationError",
    "ResolutionError",
    "all",
    "defineProvider",
    "forwardRef",
    "lazy",
    "optional",
    "resolver",
    "token",
  ];
  if (
    JSON.stringify(Object.keys(bunject).sort()) !==
    JSON.stringify(expectedExports.sort())
  ) {
    throw new Error("Runtime export surface smoke test failed");
  }
  const {
    Container,
    RegistrationError,
    ResolutionError,
    all,
    defineProvider,
    resolver,
    token,
  } = bunject;
  const settleWithin = async (promise, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label} timed out`)),
            1000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const expectResolutionError = async (promise, code, label) => {
    const outcome = await settleWithin(
      promise.then(
        () => undefined,
        (error) => error,
      ),
      label,
    );
    if (!(outcome instanceof ResolutionError) || outcome.code !== code) {
      throw new Error(`${label} did not report ${code}`);
    }
  };
  const VALUE = token("VALUE");
  const MISSING = token("MISSING");
  const RESOLUTION_VALUE = token("RESOLUTION_VALUE");
  const ASYNC_SINGLETON = token("ASYNC_SINGLETON");
  const CHAINED_VALUES = token("CHAINED_VALUES");
  const FIRST_ROOT = token("FIRST_ROOT");
  const SECOND_ROOT = token("SECOND_ROOT");
  const RESOURCE = token("RESOURCE");
  let singletonCreations = 0;
  let disposals = 0;

  const errorContainer = new Container();
  errorContainer.register(VALUE, { useValue: 1 });
  let registrationError = false;
  try {
    errorContainer.register(VALUE, { useValue: 2 });
  } catch (error) {
    registrationError = error instanceof RegistrationError;
  }
  if (!registrationError) throw new Error("Registration error identity failed");

  const CROSS_A = token("CROSS_A");
  const CROSS_B = token("CROSS_B");
  const crossFirst = new Container();
  const crossSecond = new Container();
  let crossCalls = 0;
  crossFirst.register(CROSS_A, {
    scope: "singleton",
    useFactoryAsync: () => crossSecond.resolveAsync(CROSS_B),
  });
  crossSecond.register(CROSS_B, {
    scope: "singleton",
    useFactoryAsync: () => {
      crossCalls += 1;
      return crossFirst.resolveAsync(CROSS_A);
    },
  });
  await expectResolutionError(
    crossFirst.resolveAsync(CROSS_A),
    "CAPTIVE_DEPENDENCY",
    "Cross-family nested lookup",
  );
  if (crossCalls !== 0) throw new Error("Cross-family provider was constructed");

  const POST_VALUE = token("POST_VALUE");
  const POST_LOOKUP = token("POST_LOOKUP");
  const postValue = {};
  crossSecond.register(POST_VALUE, { useValue: postValue });
  crossFirst.register(POST_LOOKUP, {
    useFactory: () => ({
      pending: Promise.resolve().then(() => crossSecond.resolve(POST_VALUE)),
    }),
  });
  if ((await crossFirst.resolve(POST_LOOKUP).pending) !== postValue) {
    throw new Error("Post-activation independent lookup was not fresh");
  }

  const INACTIVE_A = token("INACTIVE_A");
  const INACTIVE_B = token("INACTIVE_B");
  const inactive = new Container();
  inactive.register(INACTIVE_B, {
    useFactory: () => ({
      pending: Promise.resolve().then(() => inactive.resolveAsync(INACTIVE_A)),
    }),
  });
  inactive.register(INACTIVE_A, {
    scope: "singleton",
    useFactoryAsync: async () => inactive.resolve(INACTIVE_B).pending,
  });
  await expectResolutionError(
    inactive.resolveAsync(INACTIVE_A),
    "CIRCULAR",
    "Inactive nested context cycle",
  );

  const DISPOSAL_PROVIDER = token("DISPOSAL_PROVIDER");
  const DISPOSAL_RESOURCE = token("DISPOSAL_RESOURCE");
  const disposerStarted = Promise.withResolvers();
  const providerStarted = Promise.withResolvers();
  const waitingOnDisposal = Promise.withResolvers();
  const callDisposal = Promise.withResolvers();
  const callConsumer = Promise.withResolvers();
  const disposalParent = new Container();
  const disposalProducer = disposalParent.createScope();
  const disposalConsumer = disposalParent.createScope();
  const disposalSecond = new Container();
  disposalSecond.register(DISPOSAL_RESOURCE, {
    useFactory: () => ({
      async [Symbol.asyncDispose]() {
        disposerStarted.resolve();
        await callConsumer.promise;
        await disposalConsumer.disposeAsync();
      },
    }),
  });
  disposalSecond.resolve(DISPOSAL_RESOURCE);
  const secondDisposal = disposalSecond.disposeAsync();
  await disposerStarted.promise;
  disposalParent.register(DISPOSAL_PROVIDER, {
    scope: "singleton",
    useFactoryAsync: async () => {
      providerStarted.resolve();
      await callDisposal.promise;
      const waiting = disposalSecond.disposeAsync();
      waitingOnDisposal.resolve();
      await waiting;
      return {};
    },
  });
  const disposalProvider = disposalProducer.resolveAsync(DISPOSAL_PROVIDER);
  await providerStarted.promise;
  const coalescedProvider = disposalConsumer.resolveAsync(DISPOSAL_PROVIDER);
  await Promise.resolve();
  const childDisposal = disposalConsumer.disposeAsync();
  callDisposal.resolve();
  await waitingOnDisposal.promise;
  callConsumer.resolve();
  const disposalResults = await settleWithin(
    Promise.allSettled([
      disposalProvider,
      coalescedProvider,
      childDisposal,
      secondDisposal,
    ]),
    "Backfilled disposal cycle",
  );
  if (disposalResults.map(({ status }) => status).join(",") !==
    "rejected,rejected,fulfilled,rejected") {
    throw new Error("Backfilled disposal cycle was not rejected");
  }
  await disposalParent.disposeAsync();

  const container = new Container();
  container.register(VALUE, { useValue: 42 });
  container.register(RESOLUTION_VALUE, {
    scope: "resolution",
    useFactory: () => ({}),
  });
  container.register(ASYNC_SINGLETON, defineProvider()({
    inject: [],
    scope: "singleton",
    useFactoryAsync: async () => {
      await delay(2);
      singletonCreations += 1;
      return {};
    },
  }));
  container.register(CHAINED_VALUES, defineProvider()({
    inject: [all(VALUE, { chained: true })],
    useFactory: (values) => values,
  }));

  const registerRoot = (root, milliseconds) => {
    container.register(root, defineProvider()({
      inject: [resolver()],
      useFactoryAsync: async (activeResolver) => {
        const singletonPromise = activeResolver.resolveAsync(ASYNC_SINGLETON);
        const before = activeResolver.resolve(RESOLUTION_VALUE);
        await delay(milliseconds);
        const after = activeResolver.resolve(RESOLUTION_VALUE);
        const singleton = await singletonPromise;
        const chainedValues = activeResolver.resolveAll(VALUE, {
          chained: true,
        });
        const chainedValuesAsync = await activeResolver.resolveAllAsync(VALUE, {
          chained: true,
        });
        let path;
        let resolutionError = false;
        try {
          activeResolver.resolve(MISSING);
        } catch (error) {
          resolutionError = error instanceof ResolutionError;
          path = error?.path;
        }
        return {
          available: activeResolver.has(VALUE),
          before,
          chainedValues,
          chainedValuesAsync,
          after,
          path,
          resolutionError,
          singleton,
          value: activeResolver.resolve(VALUE),
        };
      },
    }));
  };
  registerRoot(FIRST_ROOT, 8);
  registerRoot(SECOND_ROOT, 1);
  container.register(RESOURCE, {
    scope: "scoped",
    useFactory: () => ({}),
    onDisposalAsync: async () => {
      disposals += 1;
    },
  });

  const scope = container.createScope();
  scope.register(VALUE, { useValue: 21 });
  const [first, second] = await Promise.all([
    scope.resolveAsync(FIRST_ROOT),
    scope.resolveAsync(SECOND_ROOT),
  ]);
  const injectedValues = scope.resolve(CHAINED_VALUES);
  scope.resolve(RESOURCE);

  if (
    !first.available ||
    !second.available ||
    !first.resolutionError ||
    !second.resolutionError ||
    first.value !== 21 ||
    second.value !== 21 ||
    first.chainedValues?.join(",") !== "21,42" ||
    first.chainedValuesAsync?.join(",") !== "21,42" ||
    injectedValues?.join(",") !== "21,42" ||
    first.before !== first.after ||
    second.before !== second.after ||
    first.before === second.before ||
    first.singleton !== second.singleton ||
    singletonCreations !== 1 ||
    first.path?.length !== 2 ||
    first.path[0] !== FIRST_ROOT ||
    first.path[1] !== MISSING ||
    second.path?.length !== 2 ||
    second.path[0] !== SECOND_ROOT ||
    second.path[1] !== MISSING
  ) {
    throw new Error("Async runtime context smoke test failed");
  }

  await scope.disposeAsync();
  if (disposals !== 1) throw new Error("Runtime disposal smoke test failed");
  await container.disposeAsync();
  await Promise.all([
    crossFirst.disposeAsync(),
    crossSecond.disposeAsync(),
    inactive.disposeAsync(),
  ]);
}
