import { describe, expect, test } from "bun:test";
import {
  Container,
  Injectable,
  ResolutionError,
  lazy,
  token,
} from "../src/index";

describe("container scopes", () => {
  test("falls back to parent providers and keeps overrides local", () => {
    const CONFIG = token<{ readonly name: string }>("CONFIG");
    const parentConfig = { name: "parent" };
    const localConfig = { name: "local" };
    const nestedConfig = { name: "nested" };
    const parent = new Container();
    parent.register(CONFIG, { useValue: parentConfig });

    const local = parent.createScope();
    const sibling = parent.createScope();
    local.register(CONFIG, { useValue: localConfig });

    expect(local.resolve(CONFIG)).toBe(localConfig);
    expect(sibling.resolve(CONFIG)).toBe(parentConfig);
    expect(parent.resolve(CONFIG)).toBe(parentConfig);

    const nested = local.createScope();
    expect(nested.resolve(CONFIG)).toBe(localConfig);
    nested.register(CONFIG, { useValue: nestedConfig });
    expect(nested.resolve(CONFIG)).toBe(nestedConfig);
    expect(local.resolve(CONFIG)).toBe(localConfig);
  });

  test("parent singletons keep their identity and owner dependencies", () => {
    const CONFIG = token<{ readonly name: string }>("CONFIG");
    const SERVICE = token<{ readonly config: { readonly name: string } }>(
      "SERVICE",
    );
    const parentConfig = { name: "parent" };
    const parent = new Container();
    parent.register(CONFIG, { useValue: parentConfig });
    parent.register(SERVICE, {
      inject: [CONFIG],
      scope: "singleton",
      useFactory: (config) => ({ config }),
    });

    const first = parent.createScope();
    const second = parent.createScope();
    first.register(CONFIG, { useValue: { name: "first" } });
    second.register(CONFIG, { useValue: { name: "second" } });

    const fromFirst = first.resolve(SERVICE);
    expect(fromFirst.config).toBe(parentConfig);
    expect(second.resolve(SERVICE)).toBe(fromFirst);
    expect(parent.resolve(SERVICE)).toBe(fromFirst);
  });

  test("parent scoped providers use the active scope and its overrides", () => {
    const CONFIG = token<{ readonly name: string }>("CONFIG");
    const parentConfig = { name: "parent" };

    @Injectable({ scope: "scoped" })
    class ScopedService {
      static inject = [CONFIG] as const;
      constructor(readonly config: { readonly name: string }) {}
    }

    const parent = new Container();
    parent.register(CONFIG, { useValue: parentConfig });
    parent.register(ScopedService);

    const first = parent.createScope();
    const second = parent.createScope();
    first.register(CONFIG, { useValue: { name: "first" } });
    second.register(CONFIG, { useValue: { name: "second" } });
    const nested = first.createScope();

    const firstService = first.resolve(ScopedService);
    const secondService = second.resolve(ScopedService);
    const nestedService = nested.resolve(ScopedService);
    const parentService = parent.resolve(ScopedService);

    expect(first.resolve(ScopedService)).toBe(firstService);
    expect(second.resolve(ScopedService)).toBe(secondService);
    expect(nested.resolve(ScopedService)).toBe(nestedService);
    expect(parent.resolve(ScopedService)).toBe(parentService);
    expect(new Set([firstService, secondService, nestedService, parentService]).size).toBe(
      4,
    );
    expect(firstService.config.name).toBe("first");
    expect(secondService.config.name).toBe("second");
    expect(nestedService.config.name).toBe("first");
    expect(parentService.config).toBe(parentConfig);
  });

  test("transient providers create a value for every resolution", () => {
    const VALUE = token<object>("VALUE");
    const parent = new Container();
    parent.register(VALUE, {
      scope: "transient",
      useFactory: () => ({}),
    });
    const scope = parent.createScope();

    expect(scope.resolve(VALUE)).not.toBe(scope.resolve(VALUE));
    expect(scope.createScope().resolve(VALUE)).not.toBe(scope.resolve(VALUE));
  });

  test("does not coalesce concurrent async transient providers", async () => {
    const SERVICE = token<object>("SERVICE");
    let calls = 0;
    const started = Promise.withResolvers<void>();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const container = new Container();
    container.register(SERVICE, {
      useFactoryAsync: async () => {
        calls += 1;
        if (calls === 2) started.resolve();
        await gate;
        return {};
      },
    });

    const first = container.resolveAsync(SERVICE);
    const second = container.resolveAsync(SERVICE);
    await started.promise;
    expect(calls).toBe(2);
    release();
    expect(await first).not.toBe(await second);
  });

  test("resolution providers share one top-level graph only", () => {
    @Injectable({ scope: "resolution" })
    class PerResolution {}

    const ROOT = token<readonly [PerResolution, PerResolution]>("ROOT");
    const container = new Container();
    container.register(PerResolution);
    container.register(ROOT, {
      inject: [PerResolution, PerResolution],
      useFactory: (first, second) => [first, second] as const,
    });

    const first = container.resolve(ROOT);
    const second = container.resolve(ROOT);
    expect(first[0]).toBe(first[1]);
    expect(second[0]).toBe(second[1]);
    expect(first[0]).not.toBe(second[0]);
  });

  test("deduplicates concurrent async scoped providers per scope", async () => {
    const VALUE = token<object>("VALUE");
    let creations = 0;
    const parent = new Container();
    parent.register(VALUE, {
      scope: "scoped",
      useFactoryAsync: async () => {
        creations += 1;
        await Bun.sleep(5);
        return {};
      },
    });
    const first = parent.createScope();
    const sibling = parent.createScope();
    const nested = first.createScope();

    const [firstValue, duplicate] = await Promise.all([
      first.resolveAsync(VALUE),
      first.resolveAsync(VALUE),
    ]);
    expect(duplicate).toBe(firstValue);
    expect(creations).toBe(1);

    const [siblingValue, nestedValue] = await Promise.all([
      sibling.resolveAsync(VALUE),
      nested.resolveAsync(VALUE),
    ]);
    expect(siblingValue).not.toBe(firstValue);
    expect(nestedValue).not.toBe(firstValue);
    expect(nestedValue).not.toBe(siblingValue);
    expect(creations).toBe(3);
  });

  test("deduplicates async resolution providers within concurrent graphs only", async () => {
    const VALUE = token<object>("VALUE");
    const ROOT = token<readonly [object, object]>("ROOT");
    let creations = 0;
    const container = new Container();
    container.register(VALUE, {
      scope: "resolution",
      useFactoryAsync: async () => {
        creations += 1;
        await Bun.sleep(5);
        return {};
      },
    });
    container.register(ROOT, {
      useFactoryAsync: async () =>
        Promise.all([
          container.resolveAsync(VALUE),
          container.resolveAsync(VALUE),
        ]),
    });

    const [firstGraph, secondGraph] = await Promise.all([
      container.resolveAsync(ROOT),
      container.resolveAsync(ROOT),
    ]);
    expect(firstGraph[0]).toBe(firstGraph[1]);
    expect(secondGraph[0]).toBe(secondGraph[1]);
    expect(firstGraph[0]).not.toBe(secondGraph[0]);
    expect(creations).toBe(2);
  });

  test("rejects singleton graphs that capture scoped or resolution providers", () => {
    for (const captiveScope of ["scoped", "resolution"] as const) {
      const CAPTIVE = token<object>(`CAPTIVE:${captiveScope}`);
      const BRIDGE = token<object>(`BRIDGE:${captiveScope}`);
      const SINGLETON = token<object>(`SINGLETON:${captiveScope}`);
      const container = new Container();
      container.register(CAPTIVE, {
        scope: captiveScope,
        useFactory: () => ({}),
      });
      container.register(BRIDGE, {
        inject: [CAPTIVE],
        useFactory: (value) => value,
      });
      container.register(SINGLETON, {
        inject: [BRIDGE],
        scope: "singleton",
        useFactory: (value) => value,
      });

      expect(() => container.resolve(SINGLETON)).toThrow(
        expect.objectContaining({
          code: "CAPTIVE_DEPENDENCY",
          path: [SINGLETON, BRIDGE, CAPTIVE],
        }),
      );
    }
  });

  test("rejects lookup across an independent container boundary", () => {
    const SCOPED = token<object>("SCOPED");
    const BRIDGE = token<object>("BRIDGE");
    const SINGLETON = token<object>("SINGLETON");
    const application = new Container();
    const independent = new Container();
    application.register(SCOPED, {
      scope: "scoped",
      useFactory: () => ({}),
    });
    independent.register(BRIDGE, {
      useFactory: () => application.resolve(SCOPED),
    });
    application.register(SINGLETON, {
      scope: "singleton",
      useFactory: () => independent.resolve(BRIDGE),
    });

    expect(() => application.resolve(SINGLETON)).toThrow(
      expect.objectContaining({
        code: "CAPTIVE_DEPENDENCY",
        path: [SINGLETON, BRIDGE],
      }),
    );
  });

  test("preserves lifetime constraints through an inactive nested context", async () => {
    const SCOPED = token<object>("SCOPED");
    const BRIDGE = token<{ readonly pending: Promise<object> }>("BRIDGE");
    const SINGLETON = token<object>("SINGLETON");
    const container = new Container();
    container.register(SCOPED, {
      scope: "scoped",
      useFactory: () => ({}),
    });
    container.register(BRIDGE, {
      useFactory: () => ({
        pending: Promise.resolve().then(() => container.resolveAsync(SCOPED)),
      }),
    });
    container.register(SINGLETON, {
      scope: "singleton",
      useFactoryAsync: async () => container.resolve(BRIDGE).pending,
    });

    await expect(container.resolveAsync(SINGLETON)).rejects.toMatchObject({
      code: "CAPTIVE_DEPENDENCY",
      path: [SINGLETON, SCOPED],
    });
  });

  test("preserves a stronger captor from an inactive nested context", async () => {
    const SCOPED = token<object>("SCOPED");
    const BRIDGE = token<{ value?: object; readonly pending: Promise<void> }>(
      "BRIDGE",
    );
    const ROOT = token<object>("ROOT");
    const container = new Container();
    container.register(SCOPED, {
      scope: "scoped",
      useFactory: () => ({}),
    });
    container.register(BRIDGE, {
      scope: "singleton",
      useFactory: () => {
        const bridge: { value?: object; readonly pending: Promise<void> } = {
          pending: Promise.resolve().then(async () => {
            bridge.value = await container.resolveAsync(SCOPED);
          }),
        };
        return bridge;
      },
    });
    container.register(ROOT, {
      useFactoryAsync: async () => {
        const bridge = container.resolve(BRIDGE);
        await bridge.pending;
        return bridge.value!;
      },
    });

    await expect(container.resolveAsync(ROOT)).rejects.toMatchObject({
      code: "CAPTIVE_DEPENDENCY",
      path: [ROOT, SCOPED],
    });
  });

  test("preserves an ancestor captor across an inactive child context", async () => {
    const TARGET = token<object>("TARGET");
    const BRIDGE = token<{ value?: object; readonly pending: Promise<void> }>(
      "BRIDGE",
    );
    const ROOT = token<object>("ROOT");
    const parent = new Container();
    const child = parent.createScope();
    let targetCalls = 0;
    let bridgeInstance:
      | { value?: object; readonly pending: Promise<void> }
      | undefined;
    child.register(TARGET, {
      scope: "singleton",
      useFactory: () => {
        targetCalls += 1;
        return {};
      },
    });
    parent.register(BRIDGE, {
      scope: "singleton",
      useFactory: () => {
        const bridge: { value?: object; readonly pending: Promise<void> } = {
          pending: Promise.resolve().then(async () => {
            bridge.value = await child.resolveAsync(TARGET);
          }),
        };
        bridgeInstance = bridge;
        return bridge;
      },
    });
    child.register(ROOT, {
      scope: "singleton",
      useFactoryAsync: async () => {
        const bridge = parent.resolve(BRIDGE);
        await bridge.pending;
        return bridge.value!;
      },
    });

    await expect(child.resolveAsync(ROOT)).rejects.toMatchObject({
      code: "CAPTIVE_DEPENDENCY",
      path: [ROOT, TARGET],
    });
    expect(targetCalls).toBe(0);
    if (!bridgeInstance) throw new Error("Bridge was not constructed.");
    expect(parent.resolve(BRIDGE)).toBe(bridgeInstance);
    expect(bridgeInstance.value).toBeUndefined();
  });

  test("validates a shared provider separately under stricter captors", () => {
    const SCOPED = token<object>("SCOPED");
    const SINGLETON = token<{ readonly value: object }>("SINGLETON");
    const ROOT = token<object>("ROOT");
    const container = new Container();
    container.register(SCOPED, { scope: "scoped", useFactory: () => ({}) });
    container.register(SINGLETON, {
      inject: [SCOPED],
      scope: "singleton",
      useFactory: (value) => ({ value }),
    });
    container.register(ROOT, {
      inject: [SCOPED, SINGLETON],
      useFactory: (value, singleton) => ({ value, singleton }),
    });

    expect(() => container.resolve(ROOT)).toThrow(
      expect.objectContaining({
        code: "CAPTIVE_DEPENDENCY",
        path: [ROOT, SINGLETON, SCOPED],
      }),
    );
  });

  test("propagates lifetime constraints through dynamic provider resolution", () => {
    const SCOPED = token<object>("SCOPED");
    const BRIDGE = token<object>("BRIDGE");
    const SINGLETON = token<object>("SINGLETON");
    const container = new Container();
    container.register(SCOPED, { scope: "scoped", useFactory: () => ({}) });
    container.register(BRIDGE, {
      useFactory: () => container.resolve(SCOPED),
    });
    container.register(SINGLETON, {
      inject: [BRIDGE],
      scope: "singleton",
      useFactory: (bridge) => bridge,
    });

    expect(() => container.resolve(SINGLETON)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("prevents parent singletons from dynamically capturing child singletons", async () => {
    const PARENT = token<object>("PARENT");
    const ASYNC_PARENT = token<object>("ASYNC_PARENT");
    const CHILD = token<object>("CHILD");
    const ROOT = token<object>("ROOT");
    const ASYNC_ROOT = token<object>("ASYNC_ROOT");
    const parent = new Container();
    let child!: Container;
    parent.register(PARENT, {
      scope: "singleton",
      useFactory: () => child.resolve(CHILD),
    });
    parent.register(ASYNC_PARENT, {
      scope: "singleton",
      useFactoryAsync: () => child.resolveAsync(CHILD),
    });
    child = parent.createScope();
    child.register(CHILD, { scope: "singleton", useFactory: () => ({}) });
    child.register(ROOT, {
      inject: [PARENT],
      scope: "singleton",
      useFactory: (value) => value,
    });
    child.register(ASYNC_ROOT, {
      inject: [ASYNC_PARENT],
      scope: "singleton",
      useFactory: (value) => value,
    });

    expect(() => child.resolve(ROOT)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
    await expect(child.resolveAsync(ASYNC_ROOT)).rejects.toEqual(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("prevents long-lived parents from capturing child-owned transients", () => {
    const TRANSIENT = token<object>("TRANSIENT");
    const PARENT = token<object>("PARENT");
    const parent = new Container();
    let child!: Container;
    parent.register(PARENT, {
      scope: "singleton",
      useFactory: () => child.resolve(TRANSIENT),
    });
    child = parent.createScope();
    child.register(TRANSIENT, { useFactory: () => ({}) });

    expect(() => parent.resolve(PARENT)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("prevents long-lived providers from depending on descendant lookups", () => {
    const VALUE = token<number>("VALUE");
    const RESOLVER = token<number>("RESOLVER");
    const QUERY = token<boolean>("QUERY");
    const parent = new Container();
    parent.register(VALUE, { useValue: 1 });
    let child!: Container;
    parent.register(RESOLVER, {
      scope: "singleton",
      useFactory: () => child.resolve(VALUE),
    });
    parent.register(QUERY, {
      scope: "singleton",
      useFactory: () => child.has(VALUE),
    });
    child = parent.createScope();

    expect(() => parent.resolve(RESOLVER)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
    expect(() => parent.resolve(QUERY)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("rejects lazy captive dependencies before singleton construction", () => {
    const SCOPED = token<object>("SCOPED");
    const SINGLETON = token<object>("SINGLETON");
    let calls = 0;
    const container = new Container();
    container.register(SCOPED, { scope: "scoped", useFactory: () => ({}) });
    container.register(SINGLETON, {
      inject: [lazy(SCOPED)],
      scope: "singleton",
      useFactory: (scoped) => {
        calls += 1;
        return scoped.resolve();
      },
    });

    expect(() => container.resolve(SINGLETON)).toThrow(
      expect.objectContaining({
        code: "CAPTIVE_DEPENDENCY",
        path: [SINGLETON, SCOPED],
      }),
    );
    expect(calls).toBe(0);
  });

  test("retains a lazy singleton's lifetime constraint across late registration", () => {
    const SCOPED = token<object>("SCOPED");
    const ROOT = token<{ resolve(): object }>("ROOT");
    const container = new Container();
    container.register(ROOT, {
      inject: [lazy(SCOPED)],
      scope: "singleton",
      useFactory: (scoped) => scoped,
    });

    const retained = container.resolve(ROOT);
    container.register(SCOPED, { scope: "scoped", useFactory: () => ({}) });

    expect(() => retained.resolve()).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("enforces both captured and active lifetime domains for lazy resolution", () => {
    const TARGET = token<object>("TARGET");
    const HOLDER = token<{ resolve(): object }>("HOLDER");
    const ROOT = token<object>("ROOT");
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    first.register(TARGET, { scope: "singleton", useFactory: () => ({}) });
    first.register(HOLDER, {
      inject: [lazy(TARGET)],
      scope: "singleton",
      useFactory: (target) => target,
    });
    const retained = first.resolve(HOLDER);
    second.register(ROOT, {
      scope: "scoped",
      useFactory: () => retained.resolve(),
    });

    expect(() => second.resolve(ROOT)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
  });

  test("captive dependency failures are ResolutionErrors", () => {
    const SCOPED = token<object>("SCOPED");
    const SINGLETON = token<object>("SINGLETON");
    const container = new Container();
    container.register(SCOPED, { scope: "scoped", useFactory: () => ({}) });
    container.register(SINGLETON, {
      inject: [SCOPED],
      scope: "singleton",
      useFactory: (scoped) => scoped,
    });

    try {
      container.resolve(SINGLETON);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).code).toBe("CAPTIVE_DEPENDENCY");
    }
  });
});
