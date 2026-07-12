import { describe, expect, test } from "bun:test";
import {
  Container,
  Injectable,
  ResolutionError,
  all,
  forwardRef,
  lazy,
  optional,
  resolver,
  token,
  type Lazy,
  type Resolver,
} from "../src/index";

describe("Container build", () => {
  test("constructs a fresh unregistered root without changing its binding", async () => {
    @Injectable({ scope: "singleton" })
    class Root {}

    const container = new Container();
    const first = container.build(Root);
    const second = container.build(Root);
    const third = await container.buildAsync(Root);

    expect(first).toBeInstanceOf(Root);
    expect(second).not.toBe(first);
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
    expect(container.has(Root)).toBe(false);
    expect(() => container.resolve(Root)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );

    const registered = new Root();
    container.register(Root, { useValue: registered });
    expect(container.build(Root)).not.toBe(registered);
    expect(await container.buildAsync(Root)).not.toBe(registered);
    expect(container.resolve(Root)).toBe(registered);
  });

  test("keeps dependency lifetimes and the active child view", async () => {
    const REQUEST = token<string>("REQUEST");

    @Injectable({ scope: "singleton" })
    class Shared {}

    @Injectable()
    class Fresh {}

    @Injectable({ scope: "resolution" })
    class PerBuild {}

    @Injectable({
      inject: [REQUEST, Shared, Fresh, PerBuild, PerBuild],
      scope: "singleton",
    })
    class Root {
      constructor(
        readonly request: string,
        readonly shared: Shared,
        readonly fresh: Fresh,
        readonly firstPerBuild: PerBuild,
        readonly secondPerBuild: PerBuild,
      ) {}
    }

    const parent = new Container();
    parent.register(REQUEST, { useValue: "parent" });
    parent.register(Shared);
    parent.register(Fresh);
    parent.register(PerBuild);
    const child = parent.createScope();
    child.register(REQUEST, { useValue: "child" });

    const first = child.build(Root);
    const second = await child.buildAsync(Root);
    expect(first).not.toBe(second);
    expect(first.request).toBe("child");
    expect(second.request).toBe("child");
    expect(first.shared).toBe(second.shared);
    expect(first.fresh).not.toBe(second.fresh);
    expect(first.firstPerBuild).toBe(first.secondPerBuild);
    expect(second.firstPerBuild).toBe(second.secondPerBuild);
    expect(first.firstPerBuild).not.toBe(second.firstPerBuild);
    expect(child.has(Root)).toBe(false);
    await parent.disposeAsync();
  });

  test("preflights missing and async dependencies before construction", async () => {
    const EARLY = token<object>("EARLY");
    const ASYNC = token<object>("ASYNC");
    const MISSING = token<object>("MISSING");
    let dependencyConstructions = 0;
    let rootConstructions = 0;

    @Injectable({ inject: [EARLY, ASYNC] })
    class AsyncRoot {
      constructor(_early: object, _async: object) {
        rootConstructions += 1;
      }
    }

    @Injectable({ inject: [EARLY, MISSING] })
    class MissingRoot {
      constructor(_early: object, _missing: object) {
        rootConstructions += 1;
      }
    }

    const container = new Container();
    container.register(EARLY, {
      useFactory: () => {
        dependencyConstructions += 1;
        return {};
      },
    });
    container.register(ASYNC, { useFactoryAsync: async () => ({}) });

    expect(() => container.build(AsyncRoot)).toThrow(
      expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
    );
    expect(() => container.build(MissingRoot)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(dependencyConstructions).toBe(0);
    expect(rootConstructions).toBe(0);

    await expect(container.buildAsync(AsyncRoot)).resolves.toBeInstanceOf(
      AsyncRoot,
    );
    expect(dependencyConstructions).toBe(1);
    expect(rootConstructions).toBe(1);
  });

  test("reports async entry errors as Promise rejections", async () => {
    class Undeclared {}

    const container = new Container();
    let operation: Promise<Undeclared> | undefined;
    expect(() => {
      operation = container.buildAsync(Undeclared);
    }).not.toThrow();
    await expect(operation!).rejects.toMatchObject({
      code: "INVALID_PROVIDER",
    });

    container.dispose();
    await expect(container.buildAsync(Undeclared)).rejects.toMatchObject({
      code: "DISPOSED",
    });
  });

  test("prevents disposal while build metadata is being evaluated", async () => {
    const VALUE = token<number>("VALUE");
    const container = new Container();
    const syncErrors: unknown[] = [];
    const asyncErrors: Promise<unknown>[] = [];
    let disposals = 0;

    @Injectable()
    class Root {
      static inject = [
        forwardRef(() => {
          try {
            container.dispose();
          } catch (error) {
            syncErrors.push(error);
          }
          asyncErrors.push(
            container.disposeAsync().then(
              () => undefined,
              (error) => error,
            ),
          );
          return optional(VALUE);
        }),
      ] as const;

      constructor(readonly value: number | undefined) {}

      [Symbol.dispose]() {
        disposals += 1;
      }
    }

    expect(container.build(Root).value).toBeUndefined();
    expect((await container.buildAsync(Root)).value).toBeUndefined();
    expect(container.disposed).toBe(false);
    expect(syncErrors).toHaveLength(2);
    expect(syncErrors.every((error) => error instanceof TypeError)).toBe(true);
    expect(
      (await Promise.all(asyncErrors)).every(
        (error) => error instanceof TypeError,
      ),
    ).toBe(true);

    await container.disposeAsync();
    expect(disposals).toBe(2);
  });

  test("reports missing and circular paths from the build root", () => {
    const MISSING = token<object>("MISSING");

    @Injectable({ inject: [MISSING] })
    class MissingRoot {
      constructor(_missing: object) {}
    }

    @Injectable()
    class SelfCycle {
      static inject = [SelfCycle] as const;
      constructor(_self: SelfCycle) {}
    }

    const container = new Container();
    expect(() => container.build(MissingRoot)).toThrow(
      expect.objectContaining({
        code: "NOT_FOUND",
        path: [MissingRoot, MISSING],
      }),
    );

    try {
      container.build(SelfCycle);
      throw new Error("Expected build to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect(error).toMatchObject({
        code: "CIRCULAR",
        cycle: [SelfCycle, SelfCycle],
        path: [SelfCycle, SelfCycle],
      });
    }
  });

  test("keeps optional absence and preflights all reentry", async () => {
    @Injectable()
    class OptionalRoot {
      static inject = [optional(OptionalRoot)] as const;
      constructor(readonly parent: OptionalRoot | undefined) {}
    }

    @Injectable()
    class AllRoot {
      static inject = [all(AllRoot)] as const;
      constructor(readonly roots: readonly AllRoot[]) {}
    }

    expect(new Container().build(OptionalRoot).parent).toBeUndefined();
    await expect(
      new Container().buildAsync(OptionalRoot),
    ).resolves.toMatchObject({ parent: undefined });
    expect(() => new Container().build(AllRoot)).toThrow(
      expect.objectContaining({ code: "CIRCULAR" }),
    );
    await expect(new Container().buildAsync(AllRoot)).rejects.toMatchObject({
      code: "CIRCULAR",
    });
  });

  test("detects immediate resolver and lazy reentry into the build root", async () => {
    const BRIDGE = token<object>("BRIDGE");

    @Injectable({ inject: [resolver()] })
    class ResolverCycle {
      constructor(activeResolver: Resolver) {
        activeResolver.resolve(ResolverCycle);
      }
    }

    @Injectable()
    class LazyCycle {
      static inject = [lazy(LazyCycle)] as const;

      constructor(deferred: Lazy<LazyCycle>) {
        deferred.resolve();
      }
    }

    @Injectable({ inject: [resolver()] })
    class IndirectCycle {
      constructor(activeResolver: Resolver) {
        activeResolver.resolve(BRIDGE);
      }
    }

    const container = new Container();
    container.register(BRIDGE, {
      inject: [IndirectCycle],
      useFactory: (_root) => ({}),
    });
    for (const service of [ResolverCycle, LazyCycle] as const) {
      expect(() => container.build(service)).toThrow(
        expect.objectContaining({
          code: "CIRCULAR",
          cycle: [service, service],
          path: [service, service],
        }),
      );
      await expect(container.buildAsync(service)).rejects.toMatchObject({
        code: "CIRCULAR",
        cycle: [service, service],
        path: [service, service],
      });
    }

    expect(() => container.build(IndirectCycle)).toThrow(
      expect.objectContaining({
        code: "CIRCULAR",
        cycle: [IndirectCycle, BRIDGE, IndirectCycle],
        path: [IndirectCycle, BRIDGE, IndirectCycle],
      }),
    );
    await expect(container.buildAsync(IndirectCycle)).rejects.toMatchObject({
      code: "CIRCULAR",
      cycle: [IndirectCycle, BRIDGE, IndirectCycle],
      path: [IndirectCycle, BRIDGE, IndirectCycle],
    });
  });

  test("owns built resources in the invoking child", async () => {
    const disposals: string[] = [];

    @Injectable()
    class Dependency {
      async [Symbol.asyncDispose]() {
        disposals.push("dependency");
      }
    }

    @Injectable({ inject: [Dependency] })
    class Root {
      constructor(readonly dependency: Dependency) {}
      async [Symbol.asyncDispose]() {
        disposals.push("root");
      }
    }

    const parent = new Container();
    parent.register(Dependency);
    const child = parent.createScope();
    expect((await child.buildAsync(Root)).dependency).toBeInstanceOf(Dependency);
    await child.disposeAsync();
    expect(disposals).toEqual(["root", "dependency"]);
    expect(parent.disposed).toBe(false);
    await parent.disposeAsync();
  });

  test("waits for an in-flight async build before disposal", async () => {
    const ASYNC = token<object>("ASYNC");
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let disposed = false;

    @Injectable({ inject: [ASYNC] })
    class Root {
      constructor(_async: object) {}
      async [Symbol.asyncDispose]() {
        disposed = true;
      }
    }

    const container = new Container();
    container.register(ASYNC, {
      useFactoryAsync: async () => {
        started.resolve();
        await release.promise;
        return {};
      },
    });
    const building = container.buildAsync(Root);
    await started.promise;
    const disposing = container.disposeAsync();
    release.resolve();
    await expect(building).resolves.toBeInstanceOf(Root);
    await disposing;
    expect(disposed).toBe(true);
  });

  test("invalidates an outer cache when a built dependency changes", () => {
    const VALUE = token<number>("VALUE");

    @Injectable({ inject: [VALUE] })
    class BuiltRoot {
      constructor(readonly value: number) {}
    }

    const OUTER = token<BuiltRoot>("OUTER");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.register(OUTER, {
      scope: "singleton",
      useFactory: () => container.build(BuiltRoot),
    });
    const first = container.resolve(OUTER);
    container.rebind(VALUE, { useValue: 2 });
    const second = container.resolve(OUTER);
    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
    expect(second).not.toBe(first);
  });

  test("retains captive-lifetime and container-family checks", () => {
    const SCOPED = token<object>("SCOPED");
    const OWNER = token<object>("OWNER");
    const FOREIGN = token<object>("FOREIGN");
    let foreignConstructions = 0;

    @Injectable({ inject: [SCOPED] })
    class CapturedRoot {
      constructor(_scoped: object) {}
    }

    @Injectable()
    class ForeignRoot {
      constructor() {
        foreignConstructions += 1;
      }
    }

    const container = new Container();
    container.register(SCOPED, {
      scope: "scoped",
      useFactory: () => ({}),
    });
    container.register(OWNER, {
      scope: "singleton",
      useFactory: () => container.build(CapturedRoot),
    });
    expect(() => container.resolve(OWNER)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );

    const foreign = new Container();
    container.register(FOREIGN, {
      useFactory: () => foreign.build(ForeignRoot),
    });
    expect(() => container.resolve(FOREIGN)).toThrow(
      expect.objectContaining({ code: "CAPTIVE_DEPENDENCY" }),
    );
    expect(foreignConstructions).toBe(0);
  });
});
