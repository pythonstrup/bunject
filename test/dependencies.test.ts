import { describe, expect, test } from "bun:test";
import {
  Container,
  ResolutionError,
  Injectable,
  all,
  forwardRef,
  lazy,
  optional,
  resolver,
  token,
  type Lazy,
  type Resolver,
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

  test("evaluates forward class references once during registration", () => {
    let evaluations = 0;

    @Injectable({
      inject: [
        forwardRef(() => {
          evaluations += 1;
          return Later;
        }),
      ],
    })
    class Earlier {
      constructor(readonly later: Later) {}
    }

    @Injectable()
    class Later {}

    expect(evaluations).toBe(0);
    const container = new Container();
    container.register(Earlier);
    expect(evaluations).toBe(1);
    container.register(Later);

    expect(container.resolve(Earlier).later).toBeInstanceOf(Later);
    expect(container.inspect(Earlier).providers[0]?.dependencies).toEqual([
      { token: Later, kind: "required" },
    ]);
  });

  test("composes forward references with optional, all, lazy, and resolver", () => {
    @Injectable()
    class OptionalTarget {}

    @Injectable()
    class Hook {}

    @Injectable({
      inject: [
        forwardRef(() => optional(OptionalTarget)),
        forwardRef(() => all(Hook)),
        forwardRef(() => resolver()),
      ],
    })
    class Descriptors {
      constructor(
        readonly optionalTarget: OptionalTarget | undefined,
        readonly hooks: readonly Hook[],
        readonly activeResolver: Resolver,
      ) {}
    }

    class A {
      static readonly inject = [forwardRef(() => lazy(B))] as const;
      constructor(readonly b: Lazy<B>) {}
    }

    class B {
      static readonly inject = [A] as const;
      constructor(readonly a: A) {}
    }

    const container = new Container();
    container.registerMulti(Hook, { useValue: new Hook() });
    container.registerMulti(Hook, { useValue: new Hook() });
    container.register(Descriptors);
    container.register(A, { scope: "singleton", useClass: A });
    container.register(B);

    const descriptors = container.resolve(Descriptors);
    expect(descriptors.optionalTarget).toBeUndefined();
    expect(descriptors.hooks).toHaveLength(2);
    expect(descriptors.activeResolver.resolve(A)).toBeInstanceOf(A);
    const a = container.resolve(A);
    expect(a.b.resolve().a).toBe(a);
  });

  test("keeps forwarded eager cycles visible to automatic detection", () => {
    class A {
      static readonly inject = [forwardRef(() => B)] as const;
      constructor(readonly b: B) {}
    }

    class B {
      static readonly inject = [A] as const;
      constructor(readonly a: A) {}
    }

    const container = new Container();
    container.register(A);
    container.register(B);

    expect(() => container.resolve(A)).toThrow(
      expect.objectContaining({
        code: "CIRCULAR",
        path: [A, B, A],
        cycle: [A, B, A],
      }),
    );
  });

  test("reports invalid forward references at registration", () => {
    const ROOT = token<object>("ROOT");
    const cause = new Error("not initialized");
    const container = new Container();

    expect(() => (forwardRef as any)(undefined)).toThrow(
      expect.objectContaining({ code: "INVALID_TOKEN" }),
    );

    try {
      container.register(ROOT, {
        inject: [
          forwardRef(() => {
            throw cause;
          }),
        ],
        useFactory: (_dependency: any) => ({}),
      });
      throw new Error("Expected registration to fail");
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_TOKEN",
        token: ROOT,
        cause,
      });
    }

    expect(() =>
      container.register(ROOT, {
        inject: [forwardRef(() => undefined as never)],
        useFactory: (_dependency: any) => ({}),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_TOKEN", token: ROOT }));

    expect(() =>
      container.register(ROOT, {
        inject: [forwardRef(() => forwardRef(() => ROOT) as any)],
        useFactory: (_dependency: any) => ({}),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_TOKEN", token: ROOT }));

    class BrokenClass {
      static readonly inject = [
        forwardRef((): ReturnType<typeof resolver> => {
          throw cause;
        }),
      ] as const;

      constructor(_activeResolver: Resolver) {}
    }

    expect(() => container.register(ROOT, { useClass: BrokenClass })).toThrow(
      expect.objectContaining({
        code: "INVALID_TOKEN",
        token: ROOT,
        cause,
      }),
    );
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
    expect(Object.isFrozen(forwardRef(() => VALUE))).toBeTrue();
  });

  test("snapshots mutable descriptor copies during registration", () => {
    const VALUE = token<number>("VALUE");
    const ROOT = token<readonly number[]>("ROOT");
    const INHERITED_ROOT = token<readonly number[]>("INHERITED_ROOT");
    const parent = new Container();
    parent.register(VALUE, { useValue: 1 });
    const child = parent.createScope();
    child.register(VALUE, { useValue: 2 });
    const dependency = { ...all(VALUE) };
    child.register(ROOT, {
      inject: [dependency],
      useFactory: (values) => values,
    });
    const inheritedDependency: typeof dependency = Object.create(
      all(VALUE, { chained: true }),
    );
    child.register(INHERITED_ROOT, {
      inject: [inheritedDependency],
      useFactory: (values) => values,
    });

    dependency.chained = true;
    expect(child.resolve(ROOT)).toEqual([2]);
    expect(child.resolve(INHERITED_ROOT)).toEqual([2, 1]);
    expect(child.inspect(ROOT).providers[0]?.dependencies[0]).toEqual({
      token: VALUE,
      kind: "all",
      chained: false,
    });
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
