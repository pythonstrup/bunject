import { describe, expect, test } from "bun:test";
import {
  Container,
  RegistrationError,
  ResolutionError,
  all,
  lazy,
  optional,
  token,
} from "../src/index";

describe("container mutation", () => {
  test("preserves unrelated singleton identity when registrations change", () => {
    const SINGLETON = token<object>("SINGLETON");
    const OTHER = token<number>("OTHER");
    const container = new Container();
    container.register(SINGLETON, {
      scope: "singleton",
      useFactory: () => ({}),
    });

    const instance = container.resolve(SINGLETON);
    container.register(OTHER, { useValue: 1 });

    expect(container.resolve(SINGLETON)).toBe(instance);
  });

  test("preserves cached lazy holders while their target changes", () => {
    const TARGET = token<number>("TARGET");
    const HOLDER = token<{ resolve(): number }>("HOLDER");
    const container = new Container();
    container.register(TARGET, { useValue: 1 });
    container.register(HOLDER, {
      inject: [lazy(TARGET)],
      scope: "singleton",
      useFactory: (target) => target,
    });

    const holder = container.resolve(HOLDER);
    container.rebind(TARGET, { useValue: 2 });

    expect(container.resolve(HOLDER)).toBe(holder);
    expect(holder.resolve()).toBe(2);
  });

  test("rebind is atomic when the replacement provider is invalid", () => {
    const VALUE = token<object>("VALUE");
    const container = new Container();
    container.register(VALUE, {
      scope: "singleton",
      useFactory: () => ({ version: 1 }),
    });
    const original = container.resolve(VALUE);

    expect(() =>
      (container as any).rebind(VALUE, {
        useFactory: () => ({ version: 2 }),
        useValue: { version: 2 },
      }),
    ).toThrow(
      expect.objectContaining({
        code: "INVALID_PROVIDER",
        token: VALUE,
      }),
    );
    expect(container.resolve(VALUE)).toBe(original);
  });

  test("keeps rebind and unregister local and restores parent fallback", () => {
    const VALUE = token<{ readonly source: string }>("VALUE");
    const parent = new Container();
    parent.register(VALUE, {
      scope: "scoped",
      useFactory: () => ({ source: "parent" }),
    });
    const child = parent.createScope();
    const sibling = parent.createScope();

    expect(() =>
      child.rebind(VALUE, {
        scope: "scoped",
        useFactory: () => ({ source: "invalid inherited rebind" }),
      }),
    ).toThrow(
      expect.objectContaining({
        code: "NOT_REGISTERED",
        token: VALUE,
      }),
    );

    child.register(VALUE, {
      scope: "scoped",
      useFactory: () => ({ source: "child:1" }),
    });
    const nested = child.createScope();
    const parentValue = parent.resolve(VALUE);
    const siblingValue = sibling.resolve(VALUE);
    const childValue = child.resolve(VALUE);
    const nestedValue = nested.resolve(VALUE);

    child.rebind(VALUE, {
      scope: "scoped",
      useFactory: () => ({ source: "child:2" }),
    });

    expect(parent.resolve(VALUE)).toBe(parentValue);
    expect(sibling.resolve(VALUE)).toBe(siblingValue);
    expect(child.resolve(VALUE)).not.toBe(childValue);
    expect(child.resolve(VALUE).source).toBe("child:2");
    expect(nested.resolve(VALUE)).not.toBe(nestedValue);
    expect(nested.resolve(VALUE).source).toBe("child:2");

    expect(child.unregister(VALUE)).toBe(true);
    expect(child.resolve(VALUE).source).toBe("parent");
    expect(nested.resolve(VALUE).source).toBe("parent");
    expect(child.unregister(VALUE)).toBe(false);
    expect(parent.resolve(VALUE)).toBe(parentValue);
    expect(sibling.resolve(VALUE)).toBe(siblingValue);
  });

  test("invalidates cached dependents transitively after rebind", () => {
    const DEPENDENCY = token<{ readonly version: number }>("DEPENDENCY");
    const ROOT = token<{ readonly dependency: { readonly version: number } }>(
      "ROOT",
    );
    const container = new Container();
    container.register(DEPENDENCY, {
      scope: "singleton",
      useFactory: () => ({ version: 1 }),
    });
    container.register(ROOT, {
      inject: [DEPENDENCY],
      scope: "singleton",
      useFactory: (dependency) => ({ dependency }),
    });

    const first = container.resolve(ROOT);
    expect(first.dependency.version).toBe(1);

    container.rebind(DEPENDENCY, { useValue: { version: 2 } });

    const second = container.resolve(ROOT);
    expect(second).not.toBe(first);
    expect(second.dependency).not.toBe(first.dependency);
    expect(second.dependency.version).toBe(2);
  });

  test("invalidates cached dependents through aliases", () => {
    const TARGET = token<{ readonly value: number }>("TARGET");
    const ALIAS = token<{ readonly value: number }>("ALIAS");
    const HOLDER = token<{ readonly target: { readonly value: number } }>(
      "HOLDER",
    );
    const container = new Container();
    container.register(TARGET, { useValue: { value: 1 } });
    container.register(ALIAS, { useExisting: TARGET });
    container.register(HOLDER, {
      inject: [ALIAS],
      scope: "singleton",
      useFactory: (target) => ({ target }),
    });

    const first = container.resolve(HOLDER);
    container.rebind(TARGET, { useValue: { value: 2 } });
    const second = container.resolve(HOLDER);

    expect(second).not.toBe(first);
    expect(second.target.value).toBe(2);
  });

  test("invalidates cached dependents discovered through dynamic resolution", () => {
    const VALUE = token<number>("VALUE");
    const ROOT = token<{ readonly value: number }>("ROOT");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.register(ROOT, {
      scope: "singleton",
      useFactory: () => ({ value: container.resolve(VALUE) }),
    });

    const first = container.resolve(ROOT);
    container.rebind(VALUE, { useValue: 2 });
    const second = container.resolve(ROOT);

    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
    expect(second).not.toBe(first);
  });

  test("tracks dynamic has queries that influence cached construction", () => {
    const OPTIONAL = token<number>("OPTIONAL");
    const ROOT = token<number | undefined>("ROOT");
    const container = new Container();
    container.register(ROOT, {
      scope: "singleton",
      useFactory: () =>
        container.has(OPTIONAL) ? container.resolve(OPTIONAL) : undefined,
    });

    expect(container.resolve(ROOT)).toBeUndefined();
    container.register(OPTIONAL, { useValue: 42 });
    expect(container.resolve(ROOT)).toBe(42);
  });

  test("tracks own and inherited has queries by availability", () => {
    const VALUE = token<number>("VALUE");
    const OWN_ROOT = token<{ readonly available: boolean }>("OWN_ROOT");
    const INHERITED_ROOT = token<{ readonly available: boolean }>(
      "INHERITED_ROOT",
    );
    const parent = new Container();
    const child = parent.createScope();
    child.register(OWN_ROOT, {
      scope: "singleton",
      useFactory: () => ({ available: child.has(VALUE, { own: true }) }),
    });
    child.register(INHERITED_ROOT, {
      scope: "singleton",
      useFactory: () => ({ available: child.has(VALUE) }),
    });

    const missingOwn = child.resolve(OWN_ROOT);
    const missingInherited = child.resolve(INHERITED_ROOT);
    parent.register(VALUE, { useValue: 1 });

    expect(child.resolve(OWN_ROOT)).toBe(missingOwn);
    expect(missingOwn.available).toBe(false);
    const inherited = child.resolve(INHERITED_ROOT);
    expect(inherited).not.toBe(missingInherited);
    expect(inherited.available).toBe(true);

    parent.rebind(VALUE, { useValue: 2 });
    expect(child.resolve(OWN_ROOT)).toBe(missingOwn);
    expect(child.resolve(INHERITED_ROOT)).toBe(inherited);

    child.register(VALUE, { useValue: 3 });
    const localOwn = child.resolve(OWN_ROOT);
    expect(localOwn).not.toBe(missingOwn);
    expect(localOwn.available).toBe(true);
    expect(child.resolve(INHERITED_ROOT)).toBe(inherited);

    child.rebind(VALUE, { useValue: 4 });
    expect(child.resolve(OWN_ROOT)).toBe(localOwn);
    expect(child.resolve(INHERITED_ROOT)).toBe(inherited);

    child.unregister(VALUE);
    const fallbackOwn = child.resolve(OWN_ROOT);
    expect(fallbackOwn).not.toBe(localOwn);
    expect(fallbackOwn.available).toBe(false);
    expect(child.resolve(INHERITED_ROOT)).toBe(inherited);

    parent.unregister(VALUE);
    expect(child.resolve(OWN_ROOT)).toBe(fallbackOwn);
    const missingAgain = child.resolve(INHERITED_ROOT);
    expect(missingAgain).not.toBe(inherited);
    expect(missingAgain.available).toBe(false);
  });

  test("does not follow provider graphs for dynamic has queries", () => {
    const DEPENDENCY = token<number>("DEPENDENCY");
    const INNER = token<number>("INNER");
    const ITEM = token<number>("ITEM");
    const ROOT = token<object>("ROOT");
    const MULTI_ROOT = token<object>("MULTI_ROOT");
    const container = new Container();
    container.register(INNER, { useValue: 1 });
    container.register(DEPENDENCY, {
      inject: [INNER],
      useFactory: (value) => value,
    });
    container.registerMulti(ITEM, { useValue: 1 });
    container.register(ROOT, {
      scope: "singleton",
      useFactory: () => ({ available: container.has(DEPENDENCY) }),
    });
    container.register(MULTI_ROOT, {
      scope: "singleton",
      useFactory: () => ({ available: container.has(ITEM) }),
    });

    const root = container.resolve(ROOT);
    const multiRoot = container.resolve(MULTI_ROOT);
    container.rebind(INNER, { useValue: 2 });
    expect(container.resolve(ROOT)).toBe(root);

    container.rebind(DEPENDENCY, { useValue: 3 });
    expect(container.resolve(ROOT)).toBe(root);

    container.registerMulti(ITEM, { useValue: 2 });
    expect(container.resolve(MULTI_ROOT)).toBe(multiRoot);
  });

  test("tracks dynamic validation and inspection queries", () => {
    const VALUE = token<number>("VALUE");
    const VALIDATED = token<{ readonly available: boolean }>("VALIDATED");
    const INSPECTED = token<{ readonly available: boolean }>("INSPECTED");
    const container = new Container();
    container.register(VALIDATED, {
      scope: "singleton",
      useFactory: () => {
        try {
          container.validate(VALUE);
          return { available: true };
        } catch (error) {
          if (error instanceof ResolutionError && error.code === "NOT_FOUND") {
            return { available: false };
          }
          throw error;
        }
      },
    });
    container.register(INSPECTED, {
      scope: "singleton",
      useFactory: () => ({
        available: container.inspect(VALUE).missing.length === 0,
      }),
    });

    const validatedBefore = container.resolve(VALIDATED);
    const inspectedBefore = container.resolve(INSPECTED);
    expect(validatedBefore.available).toBe(false);
    expect(inspectedBefore.available).toBe(false);

    container.register(VALUE, { useValue: 1 });

    expect(container.resolve(VALIDATED)).not.toBe(validatedBefore);
    expect(container.resolve(VALIDATED).available).toBe(true);
    expect(container.resolve(INSPECTED)).not.toBe(inspectedBefore);
    expect(container.resolve(INSPECTED).available).toBe(true);
  });

  test("keeps runtime dependency edges isolated per scoped activation", () => {
    const VALUE = token<number>("VALUE");
    const ROOT = token<{ value?: number }>("ROOT");
    const parent = new Container();
    parent.register(VALUE, { useValue: 1 });
    parent.register(ROOT, {
      scope: "scoped",
      useFactory: () => ({}),
      onActivation: (instance, context) => {
        instance.value = context.container.resolve(VALUE);
      },
    });
    const inherited = parent.createScope();
    const shadowed = parent.createScope();
    shadowed.register(VALUE, { useValue: 10 });

    const inheritedBefore = inherited.resolve(ROOT);
    const shadowedBefore = shadowed.resolve(ROOT);
    parent.rebind(VALUE, { useValue: 2 });

    expect(inherited.resolve(ROOT)).not.toBe(inheritedBefore);
    expect(inherited.resolve(ROOT).value).toBe(2);
    expect(shadowed.resolve(ROOT)).toBe(shadowedBefore);
    expect(shadowedBefore.value).toBe(10);
  });

  test("does not copy one branch's runtime edges into sibling caches", () => {
    const VALUE = token<number>("VALUE");
    const LEFT = token<object>("LEFT");
    const RIGHT = token<object>("RIGHT");
    const ROOT = token<readonly [object, object]>("ROOT");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.register(LEFT, {
      scope: "singleton",
      useFactory: () => ({ value: container.resolve(VALUE) }),
    });
    container.register(RIGHT, { scope: "singleton", useFactory: () => ({}) });
    container.register(ROOT, {
      inject: [LEFT, RIGHT],
      scope: "singleton",
      useFactory: (left, right) => [left, right] as const,
    });

    const before = container.resolve(ROOT);
    container.rebind(VALUE, { useValue: 2 });
    const after = container.resolve(ROOT);

    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  test("propagates runtime edges through uncached transient providers", () => {
    const VALUE = token<number>("VALUE");
    const TRANSIENT = token<number>("TRANSIENT");
    const ROOT = token<number>("ROOT");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.register(TRANSIENT, {
      useFactory: () => container.resolve(VALUE),
    });
    container.register(ROOT, {
      inject: [TRANSIENT],
      scope: "singleton",
      useFactory: (value) => value,
    });

    expect(container.resolve(ROOT)).toBe(1);
    container.rebind(VALUE, { useValue: 2 });
    expect(container.resolve(ROOT)).toBe(2);
  });

  test("propagates late runtime edges through a completed transient", async () => {
    const VALUE = token<number>("VALUE");
    const LATE = token<number>("LATE");
    const BRIDGE = token<void>("BRIDGE");
    const ROOT = token<{ readonly id: number }>("ROOT");
    const container = new Container();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pending!: Promise<number>;
    let builds = 0;
    container.register(VALUE, { useValue: 1 });
    container.register(LATE, {
      scope: "transient",
      useFactoryAsync: async () => {
        await gate;
        return container.resolve(VALUE);
      },
    });
    container.register(BRIDGE, {
      scope: "transient",
      useFactory: () => {
        pending = container.resolveAsync(LATE);
      },
    });
    container.register(ROOT, {
      inject: [BRIDGE],
      scope: "singleton",
      useFactory: (_bridge) => ({ id: ++builds }),
    });

    const first = container.resolve(ROOT);
    release();
    expect(await pending).toBe(1);
    container.rebind(VALUE, { useValue: 2 });

    expect(container.resolve(ROOT)).not.toBe(first);
  });

  test("propagates attempted runtime edges when nested resolution is caught", () => {
    const LATE = token<number>("LATE");
    const TRANSIENT = token<number>("TRANSIENT");
    const ROOT = token<number>("ROOT");
    const container = new Container();
    container.register(TRANSIENT, {
      useFactory: () => container.resolve(LATE),
    });
    container.register(ROOT, {
      scope: "singleton",
      useFactory: () => {
        try {
          return container.resolve(TRANSIENT);
        } catch {
          return 0;
        }
      },
    });

    expect(container.resolve(ROOT)).toBe(0);
    container.register(LATE, { useValue: 42 });
    expect(container.resolve(ROOT)).toBe(42);
  });

  test("propagates attempted async cycle edges when rejection is caught", async () => {
    const A = token<{ readonly value: number }>("A");
    const B = token<{ readonly value: number }>("B");
    const container = new Container();
    let builds = 0;
    container.register(A, {
      scope: "singleton",
      useFactoryAsync: () => container.resolveAsync(B),
    });
    container.register(B, {
      scope: "singleton",
      useFactoryAsync: async () => {
        builds += 1;
        try {
          return await container.resolveAsync(A);
        } catch {
          return { value: 0 };
        }
      },
    });

    expect((await container.resolveAsync(A)).value).toBe(0);
    expect(builds).toBe(1);
    container.rebind(A, { useValue: { value: 42 } });

    expect((await container.resolveAsync(B)).value).toBe(42);
    expect(builds).toBe(2);
  });

  test("shares pending runtime edges with callers that catch rejection", async () => {
    const LATE = token<number>("LATE");
    const ASYNC = token<number>("ASYNC");
    const ROOT = token<number>("ROOT");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const container = new Container();
    container.register(ASYNC, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await gate;
        return container.resolveAsync(LATE);
      },
    });
    container.register(ROOT, {
      scope: "singleton",
      useFactoryAsync: async () => {
        try {
          return await container.resolveAsync(ASYNC);
        } catch {
          return 0;
        }
      },
    });

    const pending = container.resolveAsync(ASYNC);
    await Promise.resolve();
    const fallback = container.resolveAsync(ROOT);
    release();
    await expect(pending).rejects.toEqual(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(await fallback).toBe(0);

    container.register(LATE, { useValue: 42 });
    expect(await container.resolveAsync(ROOT)).toBe(42);
  });

  test("keeps collecting async edges after a parent cache completes", async () => {
    const VALUE = token<number>("VALUE");
    const ASYNC = token<number>("ASYNC");
    const ROOT = token<{ readonly value: number }>("ROOT");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.register(ASYNC, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await gate;
        return container.resolve(VALUE);
      },
    });
    container.register(ROOT, {
      scope: "singleton",
      useFactoryAsync: async () => ({
        value: await Promise.race([
          container.resolveAsync(ASYNC),
          Promise.resolve(0),
        ]),
      }),
    });

    const first = await container.resolveAsync(ROOT);
    expect(first.value).toBe(0);
    release();
    await container.resolveAsync(ASYNC);
    container.rebind(VALUE, { useValue: 2 });

    expect(await container.resolveAsync(ROOT)).not.toBe(first);
  });

  test("invalidates a cached optional dependency when registrations change", () => {
    const OPTIONAL = token<number>("OPTIONAL");
    const ROOT = token<{ readonly value: number | undefined }>("ROOT");
    const container = new Container();
    container.register(ROOT, {
      inject: [optional(OPTIONAL)],
      scope: "singleton",
      useFactory: (value) => ({ value }),
    });

    const missing = container.resolve(ROOT);
    expect(missing.value).toBeUndefined();

    container.register(OPTIONAL, { useValue: 42 });
    const present = container.resolve(ROOT);
    expect(present).not.toBe(missing);
    expect(present.value).toBe(42);

    expect(container.unregister(OPTIONAL)).toBe(true);
    const missingAgain = container.resolve(ROOT);
    expect(missingAgain).not.toBe(present);
    expect(missingAgain.value).toBeUndefined();
  });

  test("invalidates a cached all dependency when a multi set changes", () => {
    const ITEM = token<number>("ITEM");
    const ROOT = token<{ readonly values: readonly number[] }>("ROOT");
    const container = new Container();
    container.register(ROOT, {
      inject: [all(ITEM)],
      scope: "singleton",
      useFactory: (values) => ({ values }),
    });

    const empty = container.resolve(ROOT);
    expect(empty.values).toEqual([]);

    container.registerMulti(ITEM, { useValue: 1 });
    const one = container.resolve(ROOT);
    expect(one).not.toBe(empty);
    expect(one.values).toEqual([1]);

    container.registerMulti(ITEM, { useValue: 2 });
    const two = container.resolve(ROOT);
    expect(two).not.toBe(one);
    expect(two.values).toEqual([1, 2]);

    expect(container.unregister(ITEM)).toBe(true);
    const emptyAgain = container.resolve(ROOT);
    expect(emptyAgain).not.toBe(two);
    expect(emptyAgain.values).toEqual([]);
  });

  test("invalidates only static chained-all dependents for shadowed parent mutations", () => {
    const ITEM = token<number>("ITEM");
    const NEAREST = token<{ readonly values: readonly number[] }>("NEAREST");
    const CHAINED = token<{ readonly values: readonly number[] }>("CHAINED");
    const parent = new Container();
    parent.registerMulti(ITEM, { useValue: 1 });
    const child = parent.createScope();
    child.registerMulti(ITEM, { useValue: 2 });
    child.register(NEAREST, {
      inject: [all(ITEM)],
      scope: "singleton",
      useFactory: (values) => ({ values }),
    });
    child.register(CHAINED, {
      inject: [all(ITEM, { chained: true })],
      scope: "singleton",
      useFactory: (values) => ({ values }),
    });

    const nearest = child.resolve(NEAREST);
    const chained = child.resolve(CHAINED);
    expect(nearest.values).toEqual([2]);
    expect(chained.values).toEqual([2, 1]);

    parent.registerMulti(ITEM, { useValue: 3 });

    expect(child.resolve(NEAREST)).toBe(nearest);
    const updated = child.resolve(CHAINED);
    expect(updated).not.toBe(chained);
    expect(updated.values).toEqual([2, 1, 3]);
  });

  test("tracks dynamic chained-all lookups separately from nearest lookups", () => {
    const ITEM = token<number>("ITEM");
    const NEAREST = token<{ readonly values: readonly number[] }>("NEAREST");
    const CHAINED = token<{ readonly values: readonly number[] }>("CHAINED");
    const parent = new Container();
    parent.registerMulti(ITEM, { useValue: 1 });
    const child = parent.createScope();
    child.registerMulti(ITEM, { useValue: 2 });
    child.register(NEAREST, {
      scope: "singleton",
      useFactory: () => ({ values: child.resolveAll(ITEM) }),
    });
    child.register(CHAINED, {
      scope: "singleton",
      useFactory: () => ({
        values: child.resolveAll(ITEM, { chained: true }),
      }),
    });

    const nearest = child.resolve(NEAREST);
    const chained = child.resolve(CHAINED);
    parent.registerMulti(ITEM, { useValue: 3 });

    expect(child.resolve(NEAREST)).toBe(nearest);
    const updated = child.resolve(CHAINED);
    expect(updated).not.toBe(chained);
    expect(updated.values).toEqual([2, 1, 3]);
  });

  test("preserves unchanged ancestor scoped bindings after removing a local set", () => {
    const ITEM = token<object>("ITEM");
    let creations = 0;
    const parent = new Container();
    parent.registerMulti(ITEM, {
      scope: "scoped",
      useFactory: () => ({ generation: ++creations }),
    });
    const child = parent.createScope();
    child.registerMulti(ITEM, { useValue: {} });

    const ancestor = child.resolveAll(ITEM, { chained: true })[1];
    child.unregister(ITEM);

    expect(child.resolveAll(ITEM, { chained: true })[0]).toBe(ancestor);
    expect(creations).toBe(1);
  });

  test("retires old resource generations until final disposal", () => {
    const RESOURCE = token<Disposable & { readonly generation: number }>(
      "RESOURCE",
    );
    const order: number[] = [];
    let generation = 1;
    const provider = () => ({
      generation,
      [Symbol.dispose]() {
        order.push(this.generation);
      },
    });
    const container = new Container();
    container.register(RESOURCE, {
      scope: "singleton",
      useFactory: provider,
    });

    const first = container.resolve(RESOURCE);
    generation = 2;
    container.rebind(RESOURCE, {
      scope: "singleton",
      useFactory: provider,
    });

    expect(order).toEqual([]);
    expect(first.generation).toBe(1);
    const second = container.resolve(RESOURCE);
    expect(second).not.toBe(first);
    expect(second.generation).toBe(2);
    expect(order).toEqual([]);

    container.dispose();
    expect(order).toEqual([2, 1]);
  });

  test("locks the active lookup branch while isolated branches stay mutable", async () => {
    const PENDING = token<object>("PENDING");
    const SIBLING_VALUE = token<number>("SIBLING_VALUE");
    const NESTED_VALUE = token<number>("NESTED_VALUE");
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const parent = new Container();
    parent.register(PENDING, {
      scope: "scoped",
      useFactoryAsync: async () => {
        markStarted();
        await gate;
        throw new Error("expected failure");
      },
    });
    const child = parent.createScope();
    const sibling = parent.createScope();
    const nested = child.createScope();
    sibling.register(SIBLING_VALUE, { useValue: 1 });
    nested.register(NESTED_VALUE, { useValue: 1 });

    const pending = child.resolveAsync(PENDING);
    await started;

    expect(() => parent.rebind(PENDING, { useValue: {} })).toThrow(
      expect.objectContaining({ code: "CONTAINER_BUSY" }),
    );
    expect(sibling.unregister(SIBLING_VALUE)).toBe(true);
    expect(nested.rebind(NESTED_VALUE, { useValue: 2 })).toBe(nested);
    expect(nested.resolve(NESTED_VALUE)).toBe(2);

    release();
    await expect(pending).rejects.toMatchObject({ code: "PROVIDER_FAILED" });

    expect(parent.rebind(PENDING, { useValue: {} })).toBe(parent);
    expect(nested.resolve(NESTED_VALUE)).toBe(2);
  });

  test("rejects mutation after disposal with stable registration errors", () => {
    const VALUE = token<number>("VALUE");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.dispose();

    for (const mutation of [
      () => container.rebind(VALUE, { useValue: 2 }),
      () => container.unregister(VALUE),
    ]) {
      try {
        mutation();
        throw new Error("Expected mutation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(RegistrationError);
        expect((error as RegistrationError).code).toBe("CONTAINER_DISPOSED");
      }
    }
  });
});
