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
}
