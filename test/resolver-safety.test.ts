import { describe, expect, test } from "bun:test";
import { Container, ResolutionError, token } from "../src/index";

describe("resolver safety", () => {
  test("preserves active paths for dynamic missing and async providers", () => {
    const MISSING = token<object>("MISSING");
    const ASYNC = token<object>("ASYNC");
    const MISSING_ROOT = token<object>("MISSING_ROOT");
    const ASYNC_ROOT = token<object>("ASYNC_ROOT");
    const container = new Container();
    container.register(ASYNC, { useFactoryAsync: async () => ({}) });
    container.register(MISSING_ROOT, {
      useFactory: () => container.resolve(MISSING),
    });
    container.register(ASYNC_ROOT, {
      useFactory: () => container.resolve(ASYNC),
    });

    expect(() => container.resolve(MISSING_ROOT)).toThrow(
      expect.objectContaining({
        code: "NOT_FOUND",
        path: [MISSING_ROOT, MISSING],
      }),
    );
    expect(() => container.resolve(ASYNC_ROOT)).toThrow(
      expect.objectContaining({
        code: "ASYNC_IN_SYNC",
        path: [ASYNC_ROOT, ASYNC],
      }),
    );
  });

  test("preflights delayed concurrent singleton cycles without hanging", async () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const GATE_A = token<number>("GATE_A");
    const GATE_B = token<number>("GATE_B");
    let gateCalls = 0;
    const container = new Container();
    container.register(GATE_A, {
      useFactoryAsync: async () => {
        gateCalls += 1;
        await Bun.sleep(30);
        return 1;
      },
    });
    container.register(GATE_B, {
      useFactoryAsync: async () => {
        gateCalls += 1;
        await Bun.sleep(10);
        return 1;
      },
    });
    container.register(A, {
      inject: [GATE_A, B],
      scope: "singleton",
      useFactoryAsync: async (_gate, b) => ({ b }),
    });
    container.register(B, {
      inject: [GATE_B, A],
      scope: "singleton",
      useFactoryAsync: async (_gate, a) => ({ a }),
    });

    const outcome = await Promise.race([
      Promise.allSettled([container.resolveAsync(A), container.resolveAsync(B)]),
      Bun.sleep(150).then(() => "timeout" as const),
    ]);

    expect(outcome).not.toBe("timeout");
    expect(gateCalls).toBe(0);
    for (const result of outcome as PromiseSettledResult<object>[]) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: "CIRCULAR",
      });
    }
  });

  test("preflight prevents partial singleton side effects", () => {
    const CREATED = token<object>("CREATED");
    const MISSING = token<object>("MISSING");
    const ROOT = token<object>("ROOT");
    let creations = 0;
    const container = new Container();
    container.register(CREATED, {
      scope: "singleton",
      useFactory: () => {
        creations += 1;
        return {};
      },
    });
    container.register(ROOT, {
      inject: [CREATED, MISSING],
      useFactory: (created, _missing) => created,
    });

    expect(() => container.resolve(ROOT)).toThrow(ResolutionError);
    expect(creations).toBe(0);

    container.register(MISSING, { useValue: {} });
    expect(container.resolve(ROOT)).toBeDefined();
    expect(creations).toBe(1);
  });

  test("keeps the full root path and the minimal cycle separately", () => {
    const ROOT = token<object>("ROOT");
    const A = token<object>("A");
    const B = token<object>("B");
    const container = new Container();
    container.register(ROOT, { inject: [A], useFactory: (a) => a });
    container.register(A, { inject: [B], useFactory: (b) => b });
    container.register(B, { inject: [A], useFactory: (a) => a });

    try {
      container.resolve(ROOT);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect(error).toMatchObject({
        code: "CIRCULAR",
        path: [ROOT, A, B, A],
        cycle: [A, B, A],
      });
    }
  });

  test("detects alias cycles during preflight", () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const container = new Container();
    container.register(A, { useExisting: B });
    container.register(B, { useExisting: A });

    expect(() => container.resolve(A)).toThrow(
      expect.objectContaining({
        code: "CIRCULAR",
        path: [A, B, A],
        cycle: [A, B, A],
      }),
    );
  });

  test("detects sync and async factory reentry", async () => {
    const SYNC = token<object>("SYNC");
    const syncContainer = new Container();
    syncContainer.register(SYNC, {
      useFactory: () => syncContainer.resolve(SYNC),
    });

    expect(() => syncContainer.resolve(SYNC)).toThrow(
      expect.objectContaining({ code: "CIRCULAR", path: [SYNC, SYNC] }),
    );

    const ASYNC = token<object>("ASYNC");
    const asyncContainer = new Container();
    asyncContainer.register(ASYNC, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await Bun.sleep(1);
        return asyncContainer.resolveAsync(ASYNC);
      },
    });

    const outcome = await Promise.race([
      asyncContainer.resolveAsync(ASYNC).catch((error) => error),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);
    expect(outcome).toBeInstanceOf(ResolutionError);
    expect(outcome).toMatchObject({ code: "CIRCULAR", path: [ASYNC, ASYNC] });
  });

  test("isolates provider lookup across container families", () => {
    const SHARED = token<object>("SHARED");
    const A = token<object>("A");
    const B = token<object>("B");
    const CALLBACK = token<() => object>("CALLBACK");
    const firstValue = {};
    const secondValue = {};
    let bCalls = 0;
    const first = new Container();
    const second = new Container();
    first.register(SHARED, { useValue: firstValue });
    second.register(SHARED, { useValue: secondValue });
    first.register(A, { useFactory: () => second.resolve(B) });
    second.register(B, {
      useFactory: () => {
        bCalls += 1;
        return first.resolve(A);
      },
    });
    first.register(CALLBACK, {
      useFactory: () => () => second.resolve(SHARED),
    });

    expect(first.resolve(SHARED)).toBe(firstValue);
    expect(second.resolve(SHARED)).toBe(secondValue);
    expect(() => first.resolve(A)).toThrow(
      expect.objectContaining({
        code: "CAPTIVE_DEPENDENCY",
        path: [A, B],
      }),
    );
    expect(bCalls).toBe(0);
    expect(first.resolve(CALLBACK)()).toBe(secondValue);
  });

  test("rejects nested async lookup across container families", async () => {
    const A = token<object>("A");
    const B = token<object>("B");
    let bCalls = 0;
    const first = new Container();
    const second = new Container();
    first.register(A, {
      scope: "singleton",
      useFactoryAsync: () => second.resolveAsync(B),
    });
    second.register(B, {
      scope: "singleton",
      useFactoryAsync: () => {
        bCalls += 1;
        return first.resolveAsync(A);
      },
    });

    const outcome = await Promise.race([
      first.resolveAsync(A).catch((error) => error),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).not.toBe("timeout");
    expect(outcome).toMatchObject({
      code: "CAPTIVE_DEPENDENCY",
      path: [A, B],
    });
    expect(bCalls).toBe(0);
  });

  test("isolates concurrent async roots across container families", async () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const first = new Container();
    const second = new Container();
    const ready = Promise.withResolvers<void>();
    let waiting = 0;
    const rendezvous = async (): Promise<void> => {
      waiting += 1;
      if (waiting === 2) ready.resolve();
      await ready.promise;
    };
    first.register(A, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await rendezvous();
        return second.resolveAsync(B);
      },
    });
    second.register(B, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await rendezvous();
        return first.resolveAsync(A);
      },
    });

    const outcome = await Promise.race([
      Promise.allSettled([first.resolveAsync(A), second.resolveAsync(B)]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).not.toBe("timeout");
    for (const result of outcome as PromiseSettledResult<object>[]) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: "CAPTIVE_DEPENDENCY",
      });
    }
  });

  test("rejects absent cross-family queries before lookup", async () => {
    const MISSING = token<object>("MISSING");
    const HAS = token<boolean>("HAS");
    const OPTIONAL = token<object | undefined>("OPTIONAL");
    const ALL = token<readonly object[]>("ALL");
    const OPTIONAL_ASYNC = token<object | undefined>("OPTIONAL_ASYNC");
    const ALL_ASYNC = token<readonly object[]>("ALL_ASYNC");
    const VALIDATE = token<boolean>("VALIDATE");
    const INSPECT = token<boolean>("INSPECT");
    const first = new Container();
    const second = new Container();
    first.register(HAS, { useFactory: () => second.has(MISSING) });
    first.register(OPTIONAL, {
      useFactory: () => second.resolveOptional(MISSING),
    });
    first.register(ALL, {
      useFactory: () => second.resolveAll(MISSING),
    });
    first.register(OPTIONAL_ASYNC, {
      useFactoryAsync: () => second.resolveOptionalAsync(MISSING),
    });
    first.register(ALL_ASYNC, {
      useFactoryAsync: () => second.resolveAllAsync(MISSING),
    });
    first.register(VALIDATE, {
      useFactory: () => {
        second.validate(MISSING);
        return true;
      },
    });
    first.register(INSPECT, {
      useFactory: () => second.inspect(MISSING).providers.length > 0,
    });

    expect(() => first.resolve(HAS)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
    expect(() => first.resolve(OPTIONAL)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
    expect(() => first.resolve(ALL)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
    await expect(first.resolveAsync(OPTIONAL_ASYNC)).rejects.toMatchObject({
      code: "CAPTIVE_DEPENDENCY",
    });
    await expect(first.resolveAsync(ALL_ASYNC)).rejects.toMatchObject({
      code: "CAPTIVE_DEPENDENCY",
    });
    expect(() => first.resolve(VALIDATE)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
    expect(() => first.resolve(INSPECT)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("restores an active outer context hidden by an inactive microtask", async () => {
    const A = token<object>("A");
    const B = token<{ readonly pending: Promise<object> }>("B");
    const container = new Container();
    container.register(B, {
      useFactory: () => ({
        pending: Promise.resolve().then(() => container.resolveAsync(A)),
      }),
    });
    container.register(A, {
      scope: "singleton",
      useFactoryAsync: async () => container.resolve(B).pending,
    });

    const outcome = await Promise.race([
      container.resolveAsync(A).catch((error) => error),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).not.toBe("timeout");
    expect(outcome).toMatchObject({
      code: "CIRCULAR",
      path: [A, B, A],
      cycle: [A, B, A],
    });
  });

  test("does not treat an inactive deferred frame as a cycle", async () => {
    interface Value {
      readonly id: number;
      readonly pending: Promise<Value | undefined>;
    }
    const A = token<{
      readonly first: Value;
      readonly second: Value | undefined;
    }>("A");
    const B = token<Value>("B");
    let calls = 0;
    const container = new Container();
    container.register(B, {
      useFactory: () => {
        const id = ++calls;
        return {
          id,
          pending:
            id === 1
              ? Promise.resolve().then(() => container.resolve(B))
              : Promise.resolve(undefined),
        };
      },
    });
    container.register(A, {
      useFactoryAsync: async () => {
        const first = container.resolve(B);
        return { first, second: await first.pending };
      },
    });

    const result = await container.resolveAsync(A);
    expect(result.first.id).toBe(1);
    expect(result.second?.id).toBe(2);
    expect(calls).toBe(2);
  });

  test("detects dynamic cycles across concurrent resolution roots", async () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const container = new Container();
    container.register(A, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await Bun.sleep(10);
        return container.resolveAsync(B);
      },
    });
    container.register(B, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await Bun.sleep(5);
        return container.resolveAsync(A);
      },
    });

    const outcome = await Promise.race([
      Promise.allSettled([container.resolveAsync(A), container.resolveAsync(B)]),
      Bun.sleep(150).then(() => "timeout" as const),
    ]);

    expect(outcome).not.toBe("timeout");
    for (const result of outcome as PromiseSettledResult<object>[]) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: "CIRCULAR",
      });
    }
  });

  test("detects a cycle that crosses a newly created async dependency", async () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const C = token<object>("C");
    const container = new Container();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    container.register(A, {
      scope: "singleton",
      useFactoryAsync: async () => container.resolveAsync(C),
    });
    container.register(B, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await gate;
        return container.resolveAsync(A);
      },
    });
    container.register(C, {
      scope: "singleton",
      useFactoryAsync: async () => container.resolveAsync(B),
    });

    const a = container.resolveAsync(A);
    const b = container.resolveAsync(B);
    await Promise.resolve();
    await Promise.resolve();
    release();
    const outcome = await Promise.race([
      Promise.allSettled([a, b]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).not.toBe("timeout");
    for (const result of outcome as PromiseSettledResult<object>[]) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: "CIRCULAR",
      });
    }
  });

  test("tracks declared async dependencies in the construction wait graph", async () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const C = token<object>("C");
    const container = new Container();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    container.register(A, {
      scope: "singleton",
      useFactoryAsync: async () => container.resolveAsync(C),
    });
    container.register(B, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await gate;
        return container.resolveAsync(A);
      },
    });
    container.register(C, {
      inject: [B],
      scope: "singleton",
      useFactoryAsync: async (_b) => ({}),
    });

    const c = container.resolveAsync(C);
    const b = container.resolveAsync(B);
    await Promise.resolve();
    release();
    const outcome = await Promise.race([
      Promise.allSettled([c, b]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).not.toBe("timeout");
    for (const result of outcome as PromiseSettledResult<object>[]) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: "CIRCULAR",
      });
    }
  });

  test("preflights dynamic back-edges before singleton side effects", () => {
    for (const warmValidationCache of [false, true]) {
      const A = token<object>(`A:${warmValidationCache}`);
      const B = token<object>(`B:${warmValidationCache}`);
      const SIDE_EFFECT = token<object>(`SIDE_EFFECT:${warmValidationCache}`);
      let creations = 0;
      const container = new Container();
      container.register(SIDE_EFFECT, {
        scope: "singleton",
        useFactory: () => {
          creations += 1;
          return {};
        },
      });
      container.register(B, {
        inject: [SIDE_EFFECT, A],
        useFactory: (sideEffect, _a) => sideEffect,
      });
      container.register(A, { useFactory: () => container.resolve(B) });
      if (warmValidationCache) container.validate(B);

      expect(() => container.resolve(A)).toThrow(
        expect.objectContaining({
          code: "CIRCULAR",
          path: [A, B, A],
          cycle: [A, B, A],
        }),
      );
      expect(creations).toBe(0);
    }
  });

  test("preflights cached async back-edges before singleton side effects", async () => {
    const A = token<object>("ASYNC_A");
    const B = token<object>("ASYNC_B");
    const SIDE_EFFECT = token<object>("ASYNC_SIDE_EFFECT");
    let creations = 0;
    const container = new Container();
    container.register(SIDE_EFFECT, {
      scope: "singleton",
      useFactory: () => {
        creations += 1;
        return {};
      },
    });
    container.register(B, {
      inject: [SIDE_EFFECT, A],
      useFactory: (sideEffect, _a) => sideEffect,
    });
    container.register(A, {
      useFactoryAsync: () => container.resolveAsync(B),
    });
    container.validate(B, { async: true });

    await expect(container.resolveAsync(A)).rejects.toMatchObject({
      code: "CIRCULAR",
      path: [A, B, A],
      cycle: [A, B, A],
    });
    expect(creations).toBe(0);
  });

  test("preflights cached dynamic all back-edges before side effects", async () => {
    for (const chained of [false, true]) {
      const SYNC_A = token<object>(`SYNC_ALL_A:${chained}`);
      const SYNC_B = token<object>(`SYNC_ALL_B:${chained}`);
      const SYNC_SIDE = token<object>(`SYNC_ALL_SIDE:${chained}`);
      let syncCreations = 0;
      const sync = new Container();
      sync.register(SYNC_SIDE, {
        scope: "singleton",
        useFactory: () => {
          syncCreations += 1;
          return {};
        },
      });
      sync.registerMulti(SYNC_B, {
        inject: [SYNC_SIDE, SYNC_A],
        useFactory: (sideEffect, _a) => sideEffect,
      });
      sync.register(SYNC_A, {
        useFactory: () => sync.resolveAll(SYNC_B, { chained })[0]!,
      });
      sync.validate(SYNC_B, { all: true, chained });

      expect(() => sync.resolve(SYNC_A)).toThrow(
        expect.objectContaining({ code: "CIRCULAR" }),
      );
      expect(syncCreations).toBe(0);

      const ASYNC_A = token<object>(`ASYNC_ALL_A:${chained}`);
      const ASYNC_B = token<object>(`ASYNC_ALL_B:${chained}`);
      const ASYNC_SIDE = token<object>(`ASYNC_ALL_SIDE:${chained}`);
      let asyncCreations = 0;
      const async = new Container();
      async.register(ASYNC_SIDE, {
        scope: "singleton",
        useFactory: () => {
          asyncCreations += 1;
          return {};
        },
      });
      async.registerMulti(ASYNC_B, {
        inject: [ASYNC_SIDE, ASYNC_A],
        useFactory: (sideEffect, _a) => sideEffect,
      });
      async.register(ASYNC_A, {
        useFactoryAsync: async () =>
          (await async.resolveAllAsync(ASYNC_B, { chained }))[0]!,
      });
      async.validate(ASYNC_B, { async: true, all: true, chained });

      await expect(async.resolveAsync(ASYNC_A)).rejects.toMatchObject({
        code: "CIRCULAR",
      });
      expect(asyncCreations).toBe(0);
    }
  });

  test("contains rejected Promises returned by synchronous providers", async () => {
    const FACTORY = token<number>("FACTORY");
    const CLASS = token<object>("CLASS");
    const cause = new Error("rejected");
    let unhandledRejections = 0;
    const onUnhandledRejection = () => {
      unhandledRejections += 1;
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const container = new Container();
      container.register(FACTORY, {
        useFactory: () => Promise.reject(cause) as unknown as number,
      });
      const PromiseConstructor = function () {
        return Promise.reject(cause);
      } as unknown as new () => object;
      container.register(CLASS, { inject: [], useClass: PromiseConstructor });

      expect(() => container.resolve(FACTORY)).toThrow(
        expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
      );
      expect(() => container.resolve(CLASS)).toThrow(
        expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
      );
      await expect(container.resolveAsync(FACTORY)).rejects.toMatchObject({
        code: "PROVIDER_FAILED",
      });
      await expect(container.resolveAsync(CLASS)).rejects.toMatchObject({
        code: "PROVIDER_FAILED",
      });
      await Bun.sleep(1);
      expect(unhandledRejections).toBe(0);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  test("wraps thenable inspection failures at provider boundaries", async () => {
    const VALUE = token<object>("VALUE");
    const cause = new Error("then getter exploded");
    const result = {
      get then(): never {
        throw cause;
      },
    };
    const sync = new Container();
    sync.register(VALUE, { useFactory: () => result as object });
    expect(() => sync.resolve(VALUE)).toThrow(
      expect.objectContaining({ code: "PROVIDER_FAILED", cause }),
    );

    const async = new Container();
    async.register(VALUE, { useFactory: () => result as object });
    await expect(async.resolveAsync(VALUE)).rejects.toEqual(
      expect.objectContaining({ code: "PROVIDER_FAILED", cause }),
    );

    expect(() =>
      new Container().register(VALUE, { useValue: result as object }),
    ).toThrow(expect.objectContaining({ code: "INVALID_PROVIDER", cause }));
  });
});
