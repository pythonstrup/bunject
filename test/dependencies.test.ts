import { describe, expect, test } from "bun:test";
import {
  Container,
  ResolutionError,
  Injectable,
  all,
  lazy,
  optional,
  token,
  type Lazy,
} from "../src/index";

describe("dependency descriptors", () => {
  test("injects optional dependencies only when the target exists", () => {
    const VALUE = token<number>("VALUE");
    const RESULT = token<number | undefined>("RESULT");
    const absent = new Container();
    absent.register(RESULT, {
      inject: [optional(VALUE)],
      useFactory: (value) => value,
    });
    expect(absent.resolve(RESULT)).toBeUndefined();

    const present = new Container();
    present.register(VALUE, { useValue: 42 });
    present.register(RESULT, {
      inject: [optional(VALUE)],
      useFactory: (value) => value,
    });
    expect(present.resolve(RESULT)).toBe(42);
  });

  test("optional does not swallow failures inside a registered provider", () => {
    const MISSING = token<object>("MISSING");
    const TARGET = token<object>("TARGET");
    const ROOT = token<object | undefined>("ROOT");
    const container = new Container();
    container.register(TARGET, {
      inject: [MISSING],
      useFactory: (missing) => missing,
    });
    container.register(ROOT, {
      inject: [optional(TARGET)],
      useFactory: (target) => target,
    });

    expect(() => container.resolve(ROOT)).toThrow(
      expect.objectContaining({
        code: "NOT_FOUND",
        path: [ROOT, TARGET, MISSING],
      }),
    );
  });

  test("optional keeps multi-binding ambiguity", () => {
    const TARGET = token<number>("TARGET");
    const ROOT = token<number | undefined>("ROOT");
    const container = new Container();
    container.registerMulti(TARGET, { useValue: 1 });
    container.registerMulti(TARGET, { useValue: 2 });
    container.register(ROOT, {
      inject: [optional(TARGET)],
      useFactory: (target) => target,
    });

    expect(() => container.resolve(ROOT)).toThrow(
      expect.objectContaining({
        code: "MULTIPLE_PROVIDERS",
        path: [ROOT, TARGET],
      }),
    );
  });

  test("injects all bindings in registration order and permits an empty set", () => {
    const HOOK = token<number>("HOOK");
    const RESULT = token<readonly number[]>("RESULT");
    const empty = new Container();
    empty.register(RESULT, {
      inject: [all(HOOK)],
      useFactory: (hooks) => hooks,
    });
    expect(empty.resolve(RESULT)).toEqual([]);

    const populated = new Container();
    populated.registerMulti(HOOK, { useValue: 1 });
    populated.registerMulti(HOOK, { useValue: 2 });
    populated.register(RESULT, {
      inject: [all(HOOK)],
      useFactory: (hooks) => hooks,
    });
    expect(populated.resolve(RESULT)).toEqual([1, 2]);
  });

  test("preflights every all() binding before construction", () => {
    const HOOK = token<number>("HOOK");
    const ROOT = token<readonly number[]>("ROOT");
    let calls = 0;
    const container = new Container();
    container.registerMulti(HOOK, {
      useFactory: () => {
        calls += 1;
        return 1;
      },
    });
    container.registerMulti(HOOK, { useFactoryAsync: async () => 2 });
    container.register(ROOT, {
      inject: [all(HOOK)],
      useFactory: (hooks) => hooks,
    });

    expect(() => container.resolve(ROOT)).toThrow(
      expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
    );
    expect(calls).toBe(0);
  });

  test("injects async all() bindings in order and coalesces them", async () => {
    const HOOK = token<number>("HOOK");
    const ROOT = token<readonly number[]>("ROOT");
    let calls = 0;
    const container = new Container();
    for (const value of [1, 2]) {
      container.registerMulti(HOOK, {
        scope: "singleton",
        useFactoryAsync: async () => {
          calls += 1;
          await Promise.resolve();
          return value;
        },
      });
    }
    container.register(ROOT, {
      inject: [all(HOOK)],
      scope: "singleton",
      useFactoryAsync: async (hooks) => hooks,
    });

    const [first, second] = await Promise.all([
      container.resolveAsync(ROOT),
      container.resolveAsync(ROOT),
    ]);
    expect(first).toEqual([1, 2]);
    expect(second).toBe(first);
    expect(calls).toBe(2);
  });

  test("lazy defers validation and uses the latest registry", () => {
    const TARGET = token<number>("TARGET");
    const ROOT = token<Lazy<number>>("ROOT");
    const container = new Container();
    container.register(ROOT, {
      inject: [lazy(TARGET)],
      useFactory: (target) => target,
    });

    const target = container.resolve(ROOT);
    expect(() => target.resolve()).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    container.register(TARGET, { useValue: 42 });
    expect(target.resolve()).toBe(42);
  });

  test("lazy breaks eager cycles but detects immediate reentry", () => {
    interface AValue {
      readonly b: Lazy<BValue>;
    }
    interface BValue {
      readonly a: AValue;
    }
    const A = token<AValue>("A");
    const B = token<BValue>("B");
    const container = new Container();
    container.register(A, {
      inject: [lazy(B)],
      scope: "singleton",
      useFactory: (b) => ({ b }),
    });
    container.register(B, {
      inject: [A],
      useFactory: (a) => ({ a }),
    });

    const a = container.resolve(A);
    expect(a.b.resolve().a).toBe(a);

    const IMMEDIATE = token<object>("IMMEDIATE");
    const immediate = new Container();
    immediate.register(IMMEDIATE, {
      inject: [lazy(IMMEDIATE)],
      useFactory: (self) => self.resolve(),
    });
    expect(() => immediate.resolve(IMMEDIATE)).toThrow(
      expect.objectContaining({ code: "CIRCULAR" }),
    );
  });

  test("lazy preserves the sync and async resolution boundary", async () => {
    const TARGET = token<object>("TARGET");
    const ROOT = token<Lazy<object>>("ROOT");
    const container = new Container();
    container.register(TARGET, { useFactoryAsync: async () => ({}) });
    container.register(ROOT, {
      inject: [lazy(TARGET)],
      useFactory: (target) => target,
    });

    const target = container.resolve(ROOT);
    expect(() => target.resolve()).toThrow(
      expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
    );
    await expect(target.resolveAsync()).resolves.toBeDefined();
  });

  test("supports typed decorator dependency metadata", () => {
    const VALUE = token<number>("VALUE");

    @Injectable({ inject: [optional(VALUE)], scope: "singleton" })
    class Decorated {
      constructor(readonly value: number | undefined) {}
    }

    const container = new Container();
    container.register(VALUE, { useValue: 42 });
    container.register(Decorated);
    expect(container.resolve(Decorated).value).toBe(42);
  });

  test("descriptor objects are immutable", () => {
    const VALUE = token<number>("VALUE");
    expect(Object.isFrozen(optional(VALUE))).toBeTrue();
    expect(Object.isFrozen(all(VALUE))).toBeTrue();
    expect(Object.isFrozen(lazy(VALUE))).toBeTrue();
  });

  test("descriptor failures remain ResolutionErrors", () => {
    const VALUE = token<number>("VALUE");
    const ROOT = token<number | undefined>("ROOT");
    const container = new Container();
    container.register(ROOT, {
      inject: [optional(VALUE)],
      useFactory: (value) => value,
    });
    expect(container.resolve(ROOT)).toBeUndefined();

    const BROKEN = token<object>("BROKEN");
    container.register(BROKEN, {
      inject: [VALUE],
      useFactory: (value) => ({ value }),
    });
    try {
      container.resolve(BROKEN);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
    }
  });
});
