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
      useFactoryAsync: async () => ({}),
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
    sync.register(VALUE, { useFactory: () => result });
    expect(() => sync.resolve(VALUE)).toThrow(
      expect.objectContaining({ code: "PROVIDER_FAILED", cause }),
    );

    const async = new Container();
    async.register(VALUE, { useFactory: () => result });
    await expect(async.resolveAsync(VALUE)).rejects.toEqual(
      expect.objectContaining({ code: "PROVIDER_FAILED", cause }),
    );

    expect(() =>
      new Container().register(VALUE, { useValue: result }),
    ).toThrow(expect.objectContaining({ code: "INVALID_PROVIDER", cause }));
  });
});
