import { describe, expect, test } from "bun:test";
import {
  Container,
  resolver,
  token,
  type Resolver,
} from "../src/index";

describe("resolver dependency", () => {
  test("is frozen, inspectable, and deferred from graph validation", () => {
    const MISSING = token<object>("MISSING");
    const ROOT = token<Resolver>("ROOT");
    const descriptor = resolver();
    const container = new Container();
    container.register(ROOT, {
      inject: [descriptor],
      useFactory: (activeResolver) => activeResolver,
    });

    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(() => container.validate(ROOT)).not.toThrow();
    const dependency = container.inspect(ROOT).providers[0]?.dependencies[0];
    expect(dependency).toEqual({ kind: "resolver" });
    expect(dependency && "token" in dependency).toBe(false);

    const activeResolver = container.resolve(ROOT);
    expect(Object.isFrozen(activeResolver)).toBe(true);
    expect(() => activeResolver.resolve(MISSING)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND", path: [MISSING] }),
    );
  });

  test("binds to the activation scope while singletons remain owner-affine", () => {
    const VALUE = token<string>("VALUE");
    const SCOPED_FACTORY = token<() => string>("SCOPED_FACTORY");
    const SINGLETON_FACTORY = token<() => string>("SINGLETON_FACTORY");
    const parent = new Container();
    parent.register(VALUE, { useValue: "parent" });
    parent.register(SCOPED_FACTORY, {
      inject: [resolver()],
      scope: "scoped",
      useFactory: (activeResolver) => () => activeResolver.resolve(VALUE),
    });
    parent.register(SINGLETON_FACTORY, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => () => activeResolver.resolve(VALUE),
    });
    const child = parent.createScope();
    child.register(VALUE, { useValue: "child" });

    expect(child.resolve(SCOPED_FACTORY)()).toBe("child");
    expect(child.resolve(SINGLETON_FACTORY)()).toBe("parent");
  });

  test("chains all bindings from the resolver activation owner", () => {
    const VALUE = token<string>("VALUE");
    const SCOPED_RESOLVER = token<Resolver>("SCOPED_RESOLVER");
    const SINGLETON_RESOLVER = token<Resolver>("SINGLETON_RESOLVER");
    const parent = new Container();
    parent.register(VALUE, { useValue: "parent" });
    parent.register(SCOPED_RESOLVER, {
      inject: [resolver()],
      scope: "scoped",
      useFactory: (activeResolver) => activeResolver,
    });
    parent.register(SINGLETON_RESOLVER, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => activeResolver,
    });
    const child = parent.createScope();
    child.register(VALUE, { useValue: "child" });

    const scoped = child.resolve(SCOPED_RESOLVER);
    expect(scoped.resolveAll(VALUE, { chained: true })).toEqual([
      "child",
      "parent",
    ]);
    expect(
      child.resolve(SINGLETON_RESOLVER).resolveAll(VALUE, { chained: true }),
    ).toEqual(["parent"]);
  });

  test("queries visible registrations and tracks immediate availability", () => {
    const INHERITED = token<number>("INHERITED");
    const OPTIONAL = token<number>("OPTIONAL");
    const SNAPSHOT = token<{ readonly available: boolean }>("SNAPSHOT");
    const DEFERRED = token<() => boolean>("DEFERRED");
    const ACTIVE_RESOLVER = token<Resolver>("ACTIVE_RESOLVER");
    const parent = new Container();
    parent.register(INHERITED, { useValue: 1 });
    parent.register(SNAPSHOT, {
      inject: [resolver()],
      scope: "scoped",
      useFactory: (activeResolver) => ({
        available: activeResolver.has(OPTIONAL),
      }),
    });
    parent.register(DEFERRED, {
      inject: [resolver()],
      scope: "scoped",
      useFactory: (activeResolver) => () => activeResolver.has(OPTIONAL),
    });
    parent.register(ACTIVE_RESOLVER, {
      inject: [resolver()],
      scope: "scoped",
      useFactory: (activeResolver) => activeResolver,
    });
    const child = parent.createScope();

    const firstSnapshot = child.resolve(SNAPSHOT);
    const deferred = child.resolve(DEFERRED);
    expect(firstSnapshot.available).toBe(false);
    expect(deferred()).toBe(false);
    expect(child.resolve(DEFERRED)).toBe(deferred);
    expect(child.resolve(SNAPSHOT)).toBe(firstSnapshot);

    child.register(OPTIONAL, { useValue: 2 });

    expect(child.resolve(SNAPSHOT)).not.toBe(firstSnapshot);
    expect(child.resolve(SNAPSHOT).available).toBe(true);
    expect(child.resolve(DEFERRED)).toBe(deferred);
    expect(deferred()).toBe(true);
    const activeResolver = child.resolve(ACTIVE_RESOLVER);
    expect(activeResolver.has(INHERITED)).toBe(true);
    expect(activeResolver.has(INHERITED, { own: true })).toBe(false);
    expect(activeResolver.has(OPTIONAL, { own: true })).toBe(true);
  });

  test("resolves optional dynamic targets and tracks absence", async () => {
    const OPTIONAL = token<number>("OPTIONAL");
    const SNAPSHOT = token<{ readonly value: number | undefined }>("SNAPSHOT");
    const ASYNC_SNAPSHOT = token<{ readonly value: number | undefined }>(
      "ASYNC_SNAPSHOT",
    );
    const DEFERRED = token<() => number | undefined>("DEFERRED");
    const DEFERRED_ASYNC = token<() => Promise<number | undefined>>(
      "DEFERRED_ASYNC",
    );
    const container = new Container();
    container.register(SNAPSHOT, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => ({
        value: activeResolver.resolveOptional(OPTIONAL),
      }),
    });
    container.register(ASYNC_SNAPSHOT, {
      inject: [resolver()],
      scope: "singleton",
      useFactoryAsync: async (activeResolver) => ({
        value: await activeResolver.resolveOptionalAsync(OPTIONAL),
      }),
    });
    container.register(DEFERRED, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => () =>
        activeResolver.resolveOptional(OPTIONAL),
    });
    container.register(DEFERRED_ASYNC, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => () =>
        activeResolver.resolveOptionalAsync(OPTIONAL),
    });

    const missing = container.resolve(SNAPSHOT);
    const missingAsync = await container.resolveAsync(ASYNC_SNAPSHOT);
    const deferred = container.resolve(DEFERRED);
    const deferredAsync = container.resolve(DEFERRED_ASYNC);
    expect(missing.value).toBeUndefined();
    expect(missingAsync.value).toBeUndefined();
    expect(deferred()).toBeUndefined();
    await expect(deferredAsync()).resolves.toBeUndefined();

    container.register(OPTIONAL, { useValue: 42 });

    const present = container.resolve(SNAPSHOT);
    const presentAsync = await container.resolveAsync(ASYNC_SNAPSHOT);
    expect(present).not.toBe(missing);
    expect(presentAsync).not.toBe(missingAsync);
    expect(present.value).toBe(42);
    expect(presentAsync.value).toBe(42);
    expect(container.resolve(DEFERRED)).toBe(deferred);
    expect(container.resolve(DEFERRED_ASYNC)).toBe(deferredAsync);
    expect(deferred()).toBe(42);
    await expect(deferredAsync()).resolves.toBe(42);
  });

  test("preserves immediate paths, cycles, and the sync/async boundary", async () => {
    const MISSING = token<object>("MISSING");
    const MISSING_ROOT = token<object>("MISSING_ROOT");
    const SELF = token<object>("SELF");
    const ASYNC = token<object>("ASYNC");
    const SYNC_ROOT = token<object>("SYNC_ROOT");
    const ASYNC_ROOT = token<object>("ASYNC_ROOT");
    const container = new Container();
    container.register(MISSING_ROOT, {
      inject: [resolver()],
      useFactory: (activeResolver) => activeResolver.resolve(MISSING),
    });
    container.register(SELF, {
      inject: [resolver()],
      useFactory: (activeResolver) => activeResolver.resolve(SELF),
    });
    container.register(ASYNC, { useFactoryAsync: async () => ({}) });
    container.register(SYNC_ROOT, {
      inject: [resolver()],
      useFactory: (activeResolver) => activeResolver.resolve(ASYNC),
    });
    container.register(ASYNC_ROOT, {
      inject: [resolver()],
      useFactoryAsync: (activeResolver) => activeResolver.resolveAsync(ASYNC),
    });

    expect(() => container.resolve(MISSING_ROOT)).toThrow(
      expect.objectContaining({
        code: "NOT_FOUND",
        path: [MISSING_ROOT, MISSING],
      }),
    );
    expect(() => container.resolve(SELF)).toThrow(
      expect.objectContaining({ code: "CIRCULAR", path: [SELF, SELF] }),
    );
    expect(() => container.resolve(SYNC_ROOT)).toThrow(
      expect.objectContaining({
        code: "ASYNC_IN_SYNC",
        path: [SYNC_ROOT, ASYNC],
      }),
    );
    await expect(container.resolveAsync(ASYNC_ROOT)).resolves.toBeDefined();
  });

  test("supports all bindings without weakening captured lifetimes", async () => {
    const VALUES = token<number>("VALUES");
    const HOLDER = token<Resolver>("HOLDER");
    let syncCalls = 0;
    const container = new Container();
    container.registerMulti(VALUES, {
      useFactory: () => {
        syncCalls += 1;
        return 1;
      },
    });
    container.registerMulti(VALUES, { useFactoryAsync: async () => 2 });
    container.register(HOLDER, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => activeResolver,
    });

    const holder = container.resolve(HOLDER);
    expect(() => holder.resolveAll(VALUES)).toThrow(
      expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
    );
    expect(syncCalls).toBe(0);
    await expect(holder.resolveAllAsync(VALUES)).resolves.toEqual([1, 2]);

    const SCOPED_VALUES = token<object>("SCOPED_VALUES");
    container.registerMulti(SCOPED_VALUES, {
      scope: "scoped",
      useFactory: () => ({}),
    });
    expect(() => holder.resolveAll(SCOPED_VALUES)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("tracks immediate calls but keeps deferred factories on the latest graph", () => {
    const VALUE = token<number>("VALUE");
    const EAGER = token<{ readonly value: number }>("EAGER");
    const DEFERRED = token<() => number>("DEFERRED");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.register(EAGER, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => ({
        value: activeResolver.resolve(VALUE),
      }),
    });
    container.register(DEFERRED, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => () => activeResolver.resolve(VALUE),
    });

    const eager = container.resolve(EAGER);
    const deferred = container.resolve(DEFERRED);
    expect(deferred()).toBe(1);
    container.rebind(VALUE, { useValue: 2 });

    expect(container.resolve(EAGER)).not.toBe(eager);
    expect(container.resolve(EAGER).value).toBe(2);
    expect(container.resolve(DEFERRED)).toBe(deferred);
    expect(deferred()).toBe(2);
  });

  test("starts a fresh resolution session for a retained resolver", () => {
    const VALUE = token<object>("VALUE");
    const HOLDER = token<Resolver>("HOLDER");
    const container = new Container();
    container.register(VALUE, {
      scope: "resolution",
      useFactory: () => ({}),
    });
    container.register(HOLDER, {
      inject: [resolver()],
      useFactory: (activeResolver) => activeResolver,
    });

    const retained = container.resolve(HOLDER);
    expect(retained.resolve(VALUE)).not.toBe(retained.resolve(VALUE));
  });

  test("shares an active resolution session and rejects use after scope disposal", async () => {
    const VALUE = token<object>("VALUE");
    const RESOURCE = token<Disposable>("RESOURCE");
    const PAIR = token<readonly [object, object]>("PAIR");
    const HOLDER = token<Resolver>("HOLDER");
    let disposals = 0;
    const parent = new Container();
    parent.register(VALUE, { scope: "resolution", useFactory: () => ({}) });
    parent.register(RESOURCE, {
      useFactory: () => ({
        [Symbol.dispose]() {
          disposals += 1;
        },
      }),
    });
    parent.register(PAIR, {
      inject: [resolver()],
      useFactory: (activeResolver) => [
        activeResolver.resolve(VALUE),
        activeResolver.resolve(VALUE),
      ] as const,
    });
    parent.register(HOLDER, {
      inject: [resolver()],
      scope: "scoped",
      useFactory: (activeResolver) => activeResolver,
    });
    const child = parent.createScope();

    const pair = child.resolve(PAIR);
    expect(pair[0]).toBe(pair[1]);
    const holder = child.resolve(HOLDER);
    holder.resolve(RESOURCE);
    child.dispose();
    expect(disposals).toBe(1);

    expect(() => holder.resolve(VALUE)).toThrow(
      expect.objectContaining({ code: "DISPOSED" }),
    );
    expect(() => holder.resolveAll(VALUE)).toThrow(
      expect.objectContaining({ code: "DISPOSED" }),
    );
    expect(() => holder.has(VALUE)).toThrow(
      expect.objectContaining({ code: "DISPOSED" }),
    );
    expect(() => holder.resolveOptional(VALUE)).toThrow(
      expect.objectContaining({ code: "DISPOSED" }),
    );
    await expect(holder.resolveAsync(VALUE)).rejects.toMatchObject({
      code: "DISPOSED",
    });
    await expect(holder.resolveAllAsync(VALUE)).rejects.toMatchObject({
      code: "DISPOSED",
    });
    await expect(holder.resolveOptionalAsync(VALUE)).rejects.toMatchObject({
      code: "DISPOSED",
    });
  });

  test("enforces captured and active scope domains", () => {
    const TARGET = token<object>("TARGET");
    const HOLDER = token<Resolver>("HOLDER");
    const ROOT = token<object>("ROOT");
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    first.register(TARGET, { scope: "singleton", useFactory: () => ({}) });
    first.register(HOLDER, {
      inject: [resolver()],
      scope: "singleton",
      useFactory: (activeResolver) => activeResolver,
    });
    const retained = first.resolve(HOLDER);
    second.register(ROOT, {
      scope: "scoped",
      useFactory: () => retained.resolve(TARGET),
    });

    expect(() => second.resolve(ROOT)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("detects async reentry without hanging", async () => {
    const SELF = token<object>("SELF");
    const container = new Container();
    container.register(SELF, {
      inject: [resolver()],
      scope: "singleton",
      useFactoryAsync: async (activeResolver) => {
        await Promise.resolve();
        return activeResolver.resolveAsync(SELF);
      },
    });

    const outcome = await Promise.race([
      container.resolveAsync(SELF).catch((error) => error),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);
    expect(outcome).not.toBe("timeout");
    expect(outcome).toMatchObject({ code: "CIRCULAR" });
  });
});
