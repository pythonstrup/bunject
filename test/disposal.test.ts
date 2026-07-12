import { describe, expect, test } from "bun:test";
import { Container, token } from "../src/index";

describe("container disposal", () => {
  test("borrows value and alias results while disposing the aliased owner once", () => {
    const BORROWED = token<Disposable>("BORROWED");
    const TARGET = token<Disposable>("TARGET");
    const ALIAS = token<Disposable>("ALIAS");
    let borrowedDisposals = 0;
    let ownedDisposals = 0;
    const borrowed = {
      [Symbol.dispose]() {
        borrowedDisposals += 1;
      },
    };
    const container = new Container();
    container.register(BORROWED, { useValue: borrowed });
    container.register(TARGET, {
      scope: "singleton",
      useFactory: () => ({
        [Symbol.dispose]() {
          ownedDisposals += 1;
        },
      }),
    });
    container.register(ALIAS, { useExisting: TARGET });

    expect(container.resolve(BORROWED)).toBe(borrowed);
    expect(container.resolve(ALIAS)).toBe(container.resolve(TARGET));
    container.dispose();

    expect(borrowedDisposals).toBe(0);
    expect(ownedDisposals).toBe(1);
  });

  test("owns every transient class and factory result", () => {
    const FACTORY = token<Disposable>("FACTORY");
    let classDisposals = 0;
    let factoryDisposals = 0;

    class ClassResource implements Disposable {
      [Symbol.dispose]() {
        classDisposals += 1;
      }
    }

    const container = new Container();
    container.register(ClassResource, { inject: [], useClass: ClassResource });
    container.register(FACTORY, {
      scope: "transient",
      useFactory: () => ({
        [Symbol.dispose]() {
          factoryDisposals += 1;
        },
      }),
    });

    container.resolve(ClassResource);
    container.resolve(ClassResource);
    container.resolve(FACTORY);
    container.resolve(FACTORY);
    container.dispose();

    expect(classDisposals).toBe(2);
    expect(factoryDisposals).toBe(2);
  });

  test("owns one disposable identity once within a container", () => {
    const FACTORY = token<Resource>("FACTORY");
    const ALIAS = token<Resource>("ALIAS");
    let disposals = 0;

    class Resource implements Disposable {
      [Symbol.dispose]() {
        disposals += 1;
      }
    }

    const container = new Container();
    container.register(Resource, {
      inject: [],
      scope: "singleton",
      useClass: Resource,
    });
    container.register(FACTORY, {
      inject: [Resource],
      scope: "singleton",
      useFactory: (resource) => resource,
    });
    container.register(ALIAS, { useExisting: FACTORY });

    expect(container.resolve(ALIAS)).toBe(container.resolve(Resource));
    container.dispose();

    expect(disposals).toBe(1);
  });

  test("owns a shared async factory result once", async () => {
    const FIRST = token<AsyncDisposable>("FIRST");
    const SECOND = token<AsyncDisposable>("SECOND");
    let disposals = 0;
    const resource = {
      async [Symbol.asyncDispose]() {
        disposals += 1;
      },
    };
    const container = new Container();
    container.register(FIRST, {
      scope: "singleton",
      useFactoryAsync: async () => resource,
    });
    container.register(SECOND, {
      scope: "singleton",
      useFactoryAsync: async () => resource,
    });

    await Promise.all([
      container.resolveAsync(FIRST),
      container.resolveAsync(SECOND),
    ]);
    await container.disposeAsync();

    expect(disposals).toBe(1);
  });

  test("deduplicates ownership per container, not across scopes", () => {
    const RESOURCE = token<Disposable>("RESOURCE");
    let disposals = 0;
    const resource = {
      [Symbol.dispose]() {
        disposals += 1;
      },
    };
    const parent = new Container();
    const child = parent.createScope();
    parent.register(RESOURCE, { useFactory: () => resource });
    child.register(RESOURCE, { useFactory: () => resource });

    parent.resolve(RESOURCE);
    child.resolve(RESOURCE);
    child.dispose();
    expect(disposals).toBe(1);

    parent.dispose();
    expect(disposals).toBe(2);
  });

  test("disposes a dependency diamond in dependent-first LIFO order", () => {
    const DEPENDENCY = token<Disposable>("DEPENDENCY");
    const LEFT = token<Disposable>("LEFT");
    const RIGHT = token<Disposable>("RIGHT");
    const ROOT = token<Disposable>("ROOT");
    const order: string[] = [];
    const container = new Container();
    container.register(DEPENDENCY, {
      scope: "singleton",
      useFactory: () => ({
        [Symbol.dispose]() {
          order.push("dependency");
        },
      }),
    });
    container.register(LEFT, {
      inject: [DEPENDENCY],
      scope: "singleton",
      useFactory: (_dependency) => ({
        [Symbol.dispose]() {
          order.push("left");
        },
      }),
    });
    container.register(RIGHT, {
      inject: [DEPENDENCY],
      scope: "singleton",
      useFactory: (_dependency) => ({
        [Symbol.dispose]() {
          order.push("right");
        },
      }),
    });
    container.register(ROOT, {
      inject: [LEFT, RIGHT],
      scope: "singleton",
      useFactory: (_left, _right) => ({
        [Symbol.dispose]() {
          order.push("root");
        },
      }),
    });

    container.resolve(ROOT);
    container.dispose();

    expect(order).toEqual(["root", "right", "left", "dependency"]);
  });

  test("disposes a cached singleton exactly once", () => {
    const RESOURCE = token<Disposable>("RESOURCE");
    let disposals = 0;
    const container = new Container();
    container.register(RESOURCE, {
      scope: "singleton",
      useFactory: () => ({
        [Symbol.dispose]() {
          disposals += 1;
        },
      }),
    });

    expect(container.resolve(RESOURCE)).toBe(container.resolve(RESOURCE));
    container.dispose();
    container.dispose();

    expect(disposals).toBe(1);
  });

  test("assigns inherited scoped resources to the resolving child", () => {
    const RESOURCE = token<Disposable>("RESOURCE");
    let disposals = 0;
    const parent = new Container();
    parent.register(RESOURCE, {
      scope: "scoped",
      useFactory: () => ({
        [Symbol.dispose]() {
          disposals += 1;
        },
      }),
    });
    const child = parent.createScope();

    child.resolve(RESOURCE);
    child.dispose();
    expect(disposals).toBe(1);
    expect(child.disposed).toBe(true);
    expect(parent.disposed).toBe(false);

    parent.resolve(RESOURCE);
    parent.dispose();
    expect(disposals).toBe(2);
  });

  test("cascades through descendants before disposing the parent", () => {
    const PARENT = token<Disposable>("PARENT");
    const CHILD = token<Disposable>("CHILD");
    const GRANDCHILD = token<Disposable>("GRANDCHILD");
    const order: string[] = [];
    const parent = new Container();
    const child = parent.createScope();
    const grandchild = child.createScope();

    for (const [container, resource, name] of [
      [parent, PARENT, "parent"],
      [child, CHILD, "child"],
      [grandchild, GRANDCHILD, "grandchild"],
    ] as const) {
      container.register(resource, {
        scope: "singleton",
        useFactory: () => ({
          [Symbol.dispose]() {
            order.push(name);
          },
        }),
      });
      container.resolve(resource);
    }

    parent.dispose();

    expect(order).toEqual(["grandchild", "child", "parent"]);
    expect(parent.disposed).toBe(true);
    expect(child.disposed).toBe(true);
    expect(grandchild.disposed).toBe(true);
  });

  test("uses sync disposal for dispose and prefers async disposal for disposeAsync", async () => {
    const RESOURCE = token<Disposable & AsyncDisposable>("RESOURCE");
    const FALLBACK = token<Disposable>("FALLBACK");
    const syncOrder: string[] = [];
    const syncContainer = new Container();
    syncContainer.register(RESOURCE, {
      useFactory: () => ({
        [Symbol.dispose]() {
          syncOrder.push("sync");
        },
        async [Symbol.asyncDispose]() {
          syncOrder.push("async");
        },
      }),
    });
    syncContainer.resolve(RESOURCE);
    syncContainer.dispose();
    expect(syncOrder).toEqual(["sync"]);

    const asyncOrder: string[] = [];
    const asyncContainer = new Container();
    asyncContainer.register(RESOURCE, {
      useFactory: () => ({
        [Symbol.dispose]() {
          asyncOrder.push("sync");
        },
        async [Symbol.asyncDispose]() {
          asyncOrder.push("async");
        },
      }),
    });
    asyncContainer.resolve(RESOURCE);
    await asyncContainer.disposeAsync();
    expect(asyncOrder).toEqual(["async"]);

    const fallbackOrder: string[] = [];
    const fallback = new Container();
    fallback.register(FALLBACK, {
      useFactory: () => ({
        [Symbol.dispose]() {
          fallbackOrder.push("sync");
        },
      }),
    });
    fallback.resolve(FALLBACK);
    await fallback.disposeAsync();
    expect(fallbackOrder).toEqual(["sync"]);
  });

  test("adapts frozen and primitive resources with typed disposal contexts", () => {
    const CLIENT = token<{ close(): void }>("CLIENT");
    const HANDLE = token<number>("HANDLE");
    const closed: string[] = [];
    const parent = new Container();
    parent.register(CLIENT, {
      scope: "scoped",
      useFactory: () =>
        Object.freeze({
          close() {
            closed.push("client");
          },
        }),
      onDisposal: (client, context) => {
        expect(Object.isFrozen(context)).toBe(true);
        expect(context.container).toBe(child);
        expect(context.token).toBe(CLIENT);
        client.close();
      },
    });
    parent.register(HANDLE, {
      useFactory: () => 42,
      onDisposal: (handle, context) => {
        expect(handle).toBe(42);
        expect(context.container).toBe(child);
        expect(context.token).toBe(HANDLE);
        closed.push("handle");
      },
    });
    const child = parent.createScope();

    child.resolve(CLIENT);
    child.resolve(HANDLE);
    child.dispose();

    expect(closed).toEqual(["handle", "client"]);
    parent.dispose();
  });

  test("treats explicit disposal callbacks as the authoritative contract", async () => {
    const RESOURCE = token<Disposable & AsyncDisposable>("RESOURCE");
    const events: string[] = [];
    const createResource = () => ({
      [Symbol.dispose]() {
        events.push("symbol-sync");
      },
      async [Symbol.asyncDispose]() {
        events.push("symbol-async");
      },
    });

    const syncContainer = new Container();
    syncContainer.register(RESOURCE, {
      useFactory: createResource,
      onDisposal: () => {
        events.push("hook-sync");
      },
      onDisposalAsync: async () => {
        events.push("hook-async");
      },
    });
    syncContainer.resolve(RESOURCE);
    syncContainer.dispose();

    const asyncContainer = new Container();
    asyncContainer.register(RESOURCE, {
      useFactory: createResource,
      onDisposal: () => {
        events.push("fallback-sync");
      },
      onDisposalAsync: async () => {
        events.push("hook-async");
      },
    });
    asyncContainer.resolve(RESOURCE);
    await asyncContainer.disposeAsync();

    const fallbackContainer = new Container();
    fallbackContainer.register(RESOURCE, {
      useFactory: createResource,
      onDisposal: () => {
        events.push("fallback-sync");
      },
    });
    fallbackContainer.resolve(RESOURCE);
    await fallbackContainer.disposeAsync();

    expect(events).toEqual(["hook-sync", "hook-async", "fallback-sync"]);
  });

  test("keeps sync disposal atomic for an async-only provider callback", async () => {
    const RESOURCE = token<object>("RESOURCE");
    let disposals = 0;
    const container = new Container();
    container.register(RESOURCE, {
      useFactory: () => ({}),
      onDisposalAsync: async () => {
        disposals += 1;
      },
    });
    container.resolve(RESOURCE);

    expect(() => container.dispose()).toThrow(TypeError);
    expect(container.disposed).toBe(false);
    expect(disposals).toBe(0);

    await container.disposeAsync();
    expect(disposals).toBe(1);
  });

  test("keeps the first ownership contract for a shared identity", () => {
    const FIRST = token<object>("FIRST");
    const SECOND = token<object>("SECOND");
    const resource = {};
    const events: string[] = [];
    const container = new Container();
    container.register(FIRST, {
      useFactory: () => resource,
      onDisposal: () => {
        events.push("first");
      },
    });
    container.register(SECOND, {
      useFactory: () => resource,
      onDisposal: () => {
        events.push("second");
      },
    });

    container.resolve(FIRST);
    container.resolve(SECOND);
    container.dispose();

    expect(events).toEqual(["first"]);
  });

  test("retains each rebound generation's disposal callback", () => {
    const RESOURCE = token<object>("RESOURCE");
    const events: string[] = [];
    const container = new Container();
    container.register(RESOURCE, {
      scope: "singleton",
      useFactory: () => ({}),
      onDisposal: () => {
        events.push("old");
      },
    });
    container.resolve(RESOURCE);
    container.rebind(RESOURCE, {
      scope: "singleton",
      useFactory: () => ({}),
      onDisposal: () => {
        events.push("new");
      },
    });
    container.resolve(RESOURCE);

    container.dispose();

    expect(events).toEqual(["new", "old"]);
  });

  test("retains disposal callbacks for failed activations", () => {
    const RESOURCE = token<{ readonly id: number }>("RESOURCE");
    const disposed: number[] = [];
    let created = 0;
    const container = new Container();
    container.register(RESOURCE, {
      scope: "singleton",
      useFactory: () => ({ id: ++created }),
      onActivation: (value) => {
        if (value.id === 1) throw new Error("activation failed");
      },
      onDisposal: (value) => {
        disposed.push(value.id);
      },
    });

    expect(() => container.resolve(RESOURCE)).toThrow(
      expect.objectContaining({ code: "PROVIDER_FAILED" }),
    );
    expect(container.resolve(RESOURCE).id).toBe(2);
    container.dispose();

    expect(disposed).toEqual([2, 1]);
  });

  test("rejects a Promise returned by a synchronous disposal callback", () => {
    const RESOURCE = token<object>("RESOURCE");
    const container = new Container();
    container.register(RESOURCE, {
      useFactory: () => ({}),
      onDisposal: (() => Promise.resolve()) as unknown as () => undefined,
    });
    container.resolve(RESOURCE);

    expect(() => container.dispose()).toThrow(
      expect.objectContaining({
        errors: [expect.objectContaining({ message: "onDisposal must be synchronous." })],
      }),
    );
    expect(container.disposed).toBe(true);
  });

  test("requires an async disposal callback to return a Promise-like value", async () => {
    const RESOURCE = token<object>("RESOURCE");
    const container = new Container();
    container.register(RESOURCE, {
      useFactory: () => ({}),
      onDisposalAsync: (() => undefined) as unknown as () => Promise<void>,
    });
    container.resolve(RESOURCE);

    await expect(container.disposeAsync()).rejects.toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: "onDisposalAsync must return a Promise-like value.",
          }),
        ],
      }),
    );
    expect(container.disposed).toBe(true);
  });

  test("rejects values returned by disposal callbacks", async () => {
    const SYNC = token<object>("SYNC");
    const ASYNC_FALLBACK = token<object>("ASYNC_FALLBACK");
    const ASYNC = token<object>("ASYNC");

    const syncContainer = new Container();
    syncContainer.register(SYNC, {
      useFactory: () => ({}),
      onDisposal: (() => 1) as unknown as () => undefined,
    });
    syncContainer.resolve(SYNC);
    expect(() => syncContainer.dispose()).toThrow(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: "onDisposal must return undefined.",
          }),
        ],
      }),
    );

    const fallbackContainer = new Container();
    fallbackContainer.register(ASYNC_FALLBACK, {
      useFactory: () => ({}),
      onDisposal: (() => 1) as unknown as () => undefined,
    });
    fallbackContainer.resolve(ASYNC_FALLBACK);
    await expect(fallbackContainer.disposeAsync()).rejects.toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: "onDisposal must return undefined.",
          }),
        ],
      }),
    );

    const asyncContainer = new Container();
    asyncContainer.register(ASYNC, {
      useFactory: () => ({}),
      onDisposalAsync: (async () => 1) as unknown as () => Promise<void>,
    });
    asyncContainer.resolve(ASYNC);
    await expect(asyncContainer.disposeAsync()).rejects.toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: "onDisposalAsync must resolve to undefined.",
          }),
        ],
      }),
    );
  });

  test("waits for a misdeclared sync callback before async disposal rejects", async () => {
    const RESOURCE = token<object>("RESOURCE");
    let finished = false;
    const container = new Container();
    container.register(RESOURCE, {
      useFactory: () => ({}),
      onDisposal: (async () => {
        await Bun.sleep(1);
        finished = true;
      }) as unknown as () => undefined,
    });
    container.resolve(RESOURCE);

    await expect(container.disposeAsync()).rejects.toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: "onDisposal must be synchronous.",
          }),
        ],
      }),
    );
    expect(finished).toBe(true);
    expect(container.disposed).toBe(true);
  });

  test("validates only the disposal method selected by the chosen mode", async () => {
    const RESOURCE = token<object>("RESOURCE");
    let asyncCalls = 0;
    const asyncContainer = new Container();
    asyncContainer.register(RESOURCE, {
      useFactory: () => ({
        [Symbol.dispose]: 1,
        async [Symbol.asyncDispose]() {
          asyncCalls += 1;
        },
      }),
    });
    expect(asyncContainer.resolve(RESOURCE)).toBeDefined();
    await asyncContainer.disposeAsync();
    expect(asyncCalls).toBe(1);

    let syncCalls = 0;
    const syncContainer = new Container();
    syncContainer.register(RESOURCE, {
      useFactory: () => ({
        [Symbol.asyncDispose]: 1,
        [Symbol.dispose]() {
          syncCalls += 1;
        },
      }),
    });
    expect(syncContainer.resolve(RESOURCE)).toBeDefined();
    syncContainer.dispose();
    expect(syncCalls).toBe(1);
  });

  test("coalesces concurrent async disposal and remains idempotent", async () => {
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let disposals = 0;
    const container = new Container();
    container.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposals += 1;
          await gate;
        },
      }),
    });
    container.resolve(RESOURCE);

    const first = container.disposeAsync();
    const second = container.disposeAsync();
    await Promise.resolve();
    expect(disposals).toBe(1);
    release();
    await Promise.all([first, second]);
    await container.disposeAsync();

    expect(disposals).toBe(1);
    expect(container.disposed).toBe(true);
  });

  test("does not deadlock when a disposer reenters disposeAsync", async () => {
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    let disposals = 0;
    const container = new Container();
    container.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposals += 1;
          await container.disposeAsync();
        },
      }),
    });
    container.resolve(RESOURCE);

    const outcome = await Promise.race([
      container.disposeAsync().then(() => "disposed" as const),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).toBe("disposed");
    expect(disposals).toBe(1);
    expect(container.disposed).toBe(true);
  });

  test("rejects cross-container disposal from a disposer without deadlocking", async () => {
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const parent = new Container();
    const child = parent.createScope();
    child.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await parent.disposeAsync();
        },
      }),
    });
    child.resolve(RESOURCE);

    const outcome = await Promise.race([
      child.disposeAsync().then(
        () => "disposed" as const,
        (error: unknown) => {
          expect(error).toBeInstanceOf(AggregateError);
          return "rejected" as const;
        },
      ),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).toBe("rejected");
    expect(child.disposed).toBe(true);
    expect(parent.disposed).toBe(false);
    await parent.disposeAsync();
    expect(parent.disposed).toBe(true);
  });

  test("composes an independently owned container as an async resource", async () => {
    const INNER = token<Container>("INNER");
    const outer = new Container();
    outer.register(INNER, { useFactory: () => new Container() });
    const inner = outer.resolve(INNER);

    await outer.disposeAsync();

    expect(outer.disposed).toBe(true);
    expect(inner.disposed).toBe(true);
  });

  test("allows an owned sibling scope to compose through async disposal", async () => {
    const SIBLING = token<Container>("SIBLING");
    const parent = new Container();
    const owner = parent.createScope();
    const sibling = parent.createScope();
    owner.register(SIBLING, { useFactory: () => sibling });
    owner.resolve(SIBLING);

    await owner.disposeAsync();

    expect(owner.disposed).toBe(true);
    expect(sibling.disposed).toBe(true);
    expect(parent.disposed).toBe(false);
    await parent.disposeAsync();
  });

  test("honors sibling completion when disposal is requested from a disposer", async () => {
    const FIRST = token<object>("FIRST");
    const SECOND = token<object>("SECOND");

    let syncFirstDone = false;
    let syncObserved = false;
    const syncParent = new Container();
    const syncFirst = syncParent.createScope();
    const syncSecond = syncParent.createScope();
    syncFirst.register(FIRST, {
      useFactory: () => ({
        [Symbol.dispose]() {
          syncFirstDone = true;
        },
      }),
    });
    syncSecond.register(SECOND, {
      useFactory: () => ({
        [Symbol.dispose]() {
          syncFirst.dispose();
          syncObserved = syncFirstDone;
        },
      }),
    });
    syncFirst.resolve(FIRST);
    syncSecond.resolve(SECOND);
    syncParent.dispose();
    expect(syncObserved).toBe(true);

    let asyncFirstDone = false;
    let asyncObserved = false;
    const asyncParent = new Container();
    const asyncFirst = asyncParent.createScope();
    const asyncSecond = asyncParent.createScope();
    asyncFirst.register(FIRST, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          asyncFirstDone = true;
        },
      }),
    });
    asyncSecond.register(SECOND, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await asyncFirst.disposeAsync();
          asyncObserved = asyncFirstDone;
        },
      }),
    });
    asyncFirst.resolve(FIRST);
    asyncSecond.resolve(SECOND);
    await asyncParent.disposeAsync();
    expect(asyncObserved).toBe(true);
  });

  test("allows an acyclic sibling wait across concurrent disposal tasks", async () => {
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    const starter = parent.createScope();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstDone = false;
    let observed = false;
    first.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await gate;
          firstDone = true;
        },
      }),
    });
    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await first.disposeAsync();
          observed = firstDone;
        },
      }),
    });
    starter.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          const firstDisposal = first.disposeAsync();
          const secondDisposal = second.disposeAsync();
          release();
          await Promise.all([firstDisposal, secondDisposal]);
        },
      }),
    });
    first.resolve(RESOURCE);
    second.resolve(RESOURCE);
    starter.resolve(RESOURCE);

    await expect(parent.disposeAsync()).resolves.toBeUndefined();
    expect(observed).toBe(true);
  });

  test("rejects a real cycle across concurrent sibling disposal tasks", async () => {
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    const starter = parent.createScope();
    let waiting = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rendezvous = async (): Promise<void> => {
      waiting += 1;
      if (waiting === 2) release();
      await gate;
    };
    first.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await rendezvous();
          await second.disposeAsync();
        },
      }),
    });
    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await rendezvous();
          await first.disposeAsync();
        },
      }),
    });
    starter.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await Promise.all([first.disposeAsync(), second.disposeAsync()]);
        },
      }),
    });
    first.resolve(RESOURCE);
    second.resolve(RESOURCE);
    starter.resolve(RESOURCE);

    const outcome = await Promise.race([
      parent.disposeAsync().then(
        () => "disposed" as const,
        (error: unknown) => {
          expect(error).toBeInstanceOf(AggregateError);
          return "rejected" as const;
        },
      ),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).toBe("rejected");
    expect(parent.disposed).toBe(true);
  });

  test("joins an independently owned container already being disposed", async () => {
    const WAIT = token<AsyncDisposable>("WAIT");
    const INNER = token<Container>("INNER");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = new Container();
    inner.register(WAIT, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await gate;
        },
      }),
    });
    inner.resolve(WAIT);
    const outer = new Container();
    outer.register(INNER, { useFactory: () => inner });
    outer.resolve(INNER);

    const innerDisposal = inner.disposeAsync();
    const outerDisposal = outer.disposeAsync();
    release();
    await Promise.all([innerDisposal, outerDisposal]);

    expect(inner.disposed).toBe(true);
    expect(outer.disposed).toBe(true);
  });

  test("detects mixed resolution and disposal wait cycles", async () => {
    const PROVIDER = token<object>("PROVIDER");
    const RESOURCE = token<object>("RESOURCE");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = new Container();
    const second = new Container();
    first.register(PROVIDER, {
      useFactoryAsync: async () => {
        await gate;
        await second.disposeAsync();
        return {};
      },
    });
    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await first.disposeAsync();
        },
      }),
    });
    second.resolve(RESOURCE);

    const provider = first.resolveAsync(PROVIDER);
    await Promise.resolve();
    const firstDisposal = first.disposeAsync();
    const secondDisposal = second.disposeAsync();
    release();
    const outcome = await Promise.race([
      Promise.allSettled([provider, firstDisposal, secondDisposal]).then(
        () => "settled" as const,
      ),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    expect(outcome).toBe("settled");
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
  });

  test("detects mixed disposal cycles through an inactive nested context", async () => {
    const PROVIDER = token<object>("PROVIDER");
    const BRIDGE = token<{ readonly pending: Promise<void> }>("BRIDGE");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const startBridge = Promise.withResolvers<void>();
    const startDisposer = Promise.withResolvers<void>();
    const bridgeCreated = Promise.withResolvers<void>();
    const waitingOnSecond = Promise.withResolvers<void>();
    const first = new Container();
    const second = new Container();

    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await startDisposer.promise;
          await first.disposeAsync();
        },
      }),
    });
    second.resolve(RESOURCE);
    const secondDisposal = second.disposeAsync();

    first.register(BRIDGE, {
      useFactory: () => {
        bridgeCreated.resolve();
        return {
          pending: startBridge.promise.then(() => {
            const waiting = second.disposeAsync();
            waitingOnSecond.resolve();
            return waiting;
          }),
        };
      },
    });
    first.register(PROVIDER, {
      useFactoryAsync: async () => {
        await first.resolve(BRIDGE).pending;
        return {};
      },
    });

    const provider = first.resolveAsync(PROVIDER);
    await bridgeCreated.promise;
    const firstDisposal = first.disposeAsync();
    startBridge.resolve();
    await waitingOnSecond.promise;
    startDisposer.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([provider, firstDisposal, secondDisposal]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
  });

  test("detects mixed disposal cycles through an active ancestor provider", async () => {
    const OUTER = token<object>("OUTER");
    const ANCESTOR = token<object>("ANCESTOR");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const startOuter = Promise.withResolvers<void>();
    const outerStarted = Promise.withResolvers<void>();
    const waitingOnSecond = Promise.withResolvers<void>();
    const startDisposer = Promise.withResolvers<void>();
    const parent = new Container();
    const child = parent.createScope();
    const second = new Container();

    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await startDisposer.promise;
          await child.disposeAsync();
        },
      }),
    });
    second.resolve(RESOURCE);
    const secondDisposal = second.disposeAsync();

    parent.register(ANCESTOR, {
      useFactoryAsync: async () => {
        const waiting = second.disposeAsync();
        waitingOnSecond.resolve();
        await waiting;
        return {};
      },
    });
    child.register(OUTER, {
      useFactoryAsync: async () => {
        outerStarted.resolve();
        await startOuter.promise;
        await parent.resolveAsync(ANCESTOR);
        return {};
      },
    });

    const provider = child.resolveAsync(OUTER);
    await outerStarted.promise;
    const childDisposal = child.disposeAsync();
    startOuter.resolve();
    await waitingOnSecond.promise;
    startDisposer.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([provider, childDisposal, secondDisposal]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(child.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    await parent.disposeAsync();
  });

  test("backfills provider disposal waits when its owner starts disposing later", async () => {
    const PROVIDER = token<object>("PROVIDER");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const disposerStarted = Promise.withResolvers<void>();
    const waitingOnSecond = Promise.withResolvers<void>();
    const startDisposer = Promise.withResolvers<void>();
    const first = new Container();
    const second = new Container();

    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposerStarted.resolve();
          await startDisposer.promise;
          await first.disposeAsync();
        },
      }),
    });
    second.resolve(RESOURCE);
    const secondDisposal = second.disposeAsync();
    await disposerStarted.promise;

    first.register(PROVIDER, {
      useFactoryAsync: async () => {
        const waiting = second.disposeAsync();
        waitingOnSecond.resolve();
        await waiting;
        return {};
      },
    });
    const provider = first.resolveAsync(PROVIDER);
    await waitingOnSecond.promise;
    const firstDisposal = first.disposeAsync();
    startDisposer.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([provider, firstDisposal, secondDisposal]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
  });

  test("treats provider disposal calls as causal when their promise is ignored", async () => {
    const PROVIDER = token<object>("PROVIDER");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const disposerStarted = Promise.withResolvers<void>();
    const providerCalled = Promise.withResolvers<void>();
    const callFirst = Promise.withResolvers<void>();
    const finishProvider = Promise.withResolvers<void>();
    const first = new Container();
    const second = new Container();

    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposerStarted.resolve();
          await callFirst.promise;
          await first.disposeAsync();
        },
      }),
    });
    second.resolve(RESOURCE);
    const secondDisposal = second.disposeAsync();
    await disposerStarted.promise;

    first.register(PROVIDER, {
      useFactoryAsync: async () => {
        void second.disposeAsync();
        providerCalled.resolve();
        await finishProvider.promise;
        return {};
      },
    });
    const provider = first.resolveAsync(PROVIDER);
    await providerCalled.promise;
    const firstDisposal = first.disposeAsync();
    callFirst.resolve();
    await Promise.resolve();
    finishProvider.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([provider, firstDisposal, secondDisposal]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
    ]);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
  });

  test("removes provider disposal edges after in-flight work drains", async () => {
    const PROVIDER = token<object>("PROVIDER");
    const FIRST_RESOURCE = token<AsyncDisposable>("FIRST_RESOURCE");
    const SECOND_RESOURCE = token<AsyncDisposable>("SECOND_RESOURCE");
    const secondDisposerStarted = Promise.withResolvers<void>();
    const providerCalled = Promise.withResolvers<void>();
    const finishProvider = Promise.withResolvers<void>();
    const firstDisposerStarted = Promise.withResolvers<void>();
    const callFirst = Promise.withResolvers<void>();
    const secondWaitingOnFirst = Promise.withResolvers<void>();
    const finishFirstDisposer = Promise.withResolvers<void>();
    const first = new Container();
    const second = new Container();

    second.register(SECOND_RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          secondDisposerStarted.resolve();
          await callFirst.promise;
          const waiting = first.disposeAsync();
          secondWaitingOnFirst.resolve();
          await waiting;
        },
      }),
    });
    second.resolve(SECOND_RESOURCE);
    const secondDisposal = second.disposeAsync();
    await secondDisposerStarted.promise;

    first.register(FIRST_RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          firstDisposerStarted.resolve();
          await finishFirstDisposer.promise;
        },
      }),
    });
    first.register(PROVIDER, {
      useFactoryAsync: async () => {
        void second.disposeAsync();
        providerCalled.resolve();
        await finishProvider.promise;
        return {};
      },
    });
    first.resolve(FIRST_RESOURCE);
    const provider = first.resolveAsync(PROVIDER);
    await providerCalled.promise;
    const firstDisposal = first.disposeAsync();
    finishProvider.resolve();
    await firstDisposerStarted.promise;
    callFirst.resolve();
    await secondWaitingOnFirst.promise;
    finishFirstDisposer.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([provider, firstDisposal, secondDisposal]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ]);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
  });

  test("backfills waits to the child whose in-flight resolution owns a parent provider", async () => {
    const PROVIDER = token<object>("PROVIDER");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const disposerStarted = Promise.withResolvers<void>();
    const waitingOnSecond = Promise.withResolvers<void>();
    const startDisposer = Promise.withResolvers<void>();
    const parent = new Container();
    const child = parent.createScope();
    const second = new Container();

    second.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposerStarted.resolve();
          await startDisposer.promise;
          await child.disposeAsync();
        },
      }),
    });
    second.resolve(RESOURCE);
    const secondDisposal = second.disposeAsync();
    await disposerStarted.promise;

    parent.register(PROVIDER, {
      useFactoryAsync: async () => {
        const waiting = second.disposeAsync();
        waitingOnSecond.resolve();
        await waiting;
        return {};
      },
    });
    const provider = child.resolveAsync(PROVIDER);
    await waitingOnSecond.promise;
    const childDisposal = child.disposeAsync();
    startDisposer.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([provider, childDisposal, secondDisposal]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(parent.disposed).toBe(false);
    expect(child.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    await parent.disposeAsync();
  });

  test("backfills waits through a coalesced construction from another session", async () => {
    const SINGLETON = token<object>("SINGLETON");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const disposerStarted = Promise.withResolvers<void>();
    const waitingOnSecond = Promise.withResolvers<void>();
    const startDisposer = Promise.withResolvers<void>();
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    const disposalTarget = new Container();

    disposalTarget.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposerStarted.resolve();
          await startDisposer.promise;
          await second.disposeAsync();
        },
      }),
    });
    disposalTarget.resolve(RESOURCE);
    const targetDisposal = disposalTarget.disposeAsync();
    await disposerStarted.promise;

    parent.register(SINGLETON, {
      scope: "singleton",
      useFactoryAsync: async () => {
        const waiting = disposalTarget.disposeAsync();
        waitingOnSecond.resolve();
        await waiting;
        return {};
      },
    });
    const producer = first.resolveAsync(SINGLETON);
    await waitingOnSecond.promise;
    const coalesced = second.resolveAsync(SINGLETON);
    const secondDisposal = second.disposeAsync();
    startDisposer.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([
        producer,
        coalesced,
        secondDisposal,
        targetDisposal,
      ]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(true);
    expect(disposalTarget.disposed).toBe(true);
    await parent.disposeAsync();
  });

  test("propagates later disposal waits to a coalesced session already disposing", async () => {
    const SINGLETON = token<object>("SINGLETON");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const disposerStarted = Promise.withResolvers<void>();
    const providerStarted = Promise.withResolvers<void>();
    const providerWaiting = Promise.withResolvers<void>();
    const callTarget = Promise.withResolvers<void>();
    const callChild = Promise.withResolvers<void>();
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    const disposalTarget = new Container();

    disposalTarget.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposerStarted.resolve();
          await callChild.promise;
          await second.disposeAsync();
        },
      }),
    });
    disposalTarget.resolve(RESOURCE);
    const targetDisposal = disposalTarget.disposeAsync();
    await disposerStarted.promise;

    parent.register(SINGLETON, {
      scope: "singleton",
      useFactoryAsync: async () => {
        providerStarted.resolve();
        await callTarget.promise;
        const waiting = disposalTarget.disposeAsync();
        providerWaiting.resolve();
        await waiting;
        return {};
      },
    });
    const producer = first.resolveAsync(SINGLETON);
    await providerStarted.promise;
    const coalesced = second.resolveAsync(SINGLETON);
    await Promise.resolve();
    const secondDisposal = second.disposeAsync();
    callTarget.resolve();
    await providerWaiting.promise;
    callChild.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([
        producer,
        coalesced,
        secondDisposal,
        targetDisposal,
      ]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(true);
    expect(disposalTarget.disposed).toBe(true);
    await parent.disposeAsync();
  });

  test("propagates existing waits when a disposing session coalesces later", async () => {
    const ROOT = token<object>("ROOT");
    const SINGLETON = token<object>("SINGLETON");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const disposerStarted = Promise.withResolvers<void>();
    const providerWaiting = Promise.withResolvers<void>();
    const rootStarted = Promise.withResolvers<void>();
    const joinSingleton = Promise.withResolvers<void>();
    const joinedSingleton = Promise.withResolvers<void>();
    const callChild = Promise.withResolvers<void>();
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    const disposalTarget = new Container();

    disposalTarget.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposerStarted.resolve();
          await callChild.promise;
          await second.disposeAsync();
        },
      }),
    });
    disposalTarget.resolve(RESOURCE);
    const targetDisposal = disposalTarget.disposeAsync();
    await disposerStarted.promise;

    parent.register(SINGLETON, {
      scope: "singleton",
      useFactoryAsync: async () => {
        const waiting = disposalTarget.disposeAsync();
        providerWaiting.resolve();
        await waiting;
        return {};
      },
    });
    second.register(ROOT, {
      useFactoryAsync: async () => {
        rootStarted.resolve();
        await joinSingleton.promise;
        const waiting = second.resolveAsync(SINGLETON);
        joinedSingleton.resolve();
        await waiting;
        return {};
      },
    });
    const producer = first.resolveAsync(SINGLETON);
    await providerWaiting.promise;
    const coalesced = second.resolveAsync(ROOT);
    await rootStarted.promise;
    const secondDisposal = second.disposeAsync();
    joinSingleton.resolve();
    await joinedSingleton.promise;
    callChild.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([
        producer,
        coalesced,
        secondDisposal,
        targetDisposal,
      ]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(true);
    expect(disposalTarget.disposed).toBe(true);
    await parent.disposeAsync();
  });

  test("rejects a cycle introduced while a disposing session coalesces", async () => {
    const ROOT = token<object>("ROOT");
    const SINGLETON = token<object>("SINGLETON");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const disposerStarted = Promise.withResolvers<void>();
    const providerWaiting = Promise.withResolvers<void>();
    const rootStarted = Promise.withResolvers<void>();
    const targetWaiting = Promise.withResolvers<void>();
    const joinSingleton = Promise.withResolvers<void>();
    const joinedSingleton = Promise.withResolvers<void>();
    const callChild = Promise.withResolvers<void>();
    const parent = new Container();
    const first = parent.createScope();
    const second = parent.createScope();
    const disposalTarget = new Container();

    disposalTarget.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          disposerStarted.resolve();
          await callChild.promise;
          const waiting = second.disposeAsync();
          targetWaiting.resolve();
          await waiting;
        },
      }),
    });
    disposalTarget.resolve(RESOURCE);
    const targetDisposal = disposalTarget.disposeAsync();
    await disposerStarted.promise;

    parent.register(SINGLETON, {
      scope: "singleton",
      useFactoryAsync: async () => {
        const waiting = disposalTarget.disposeAsync();
        providerWaiting.resolve();
        await waiting;
        return {};
      },
    });
    second.register(ROOT, {
      useFactoryAsync: async () => {
        rootStarted.resolve();
        await joinSingleton.promise;
        const waiting = second.resolveAsync(SINGLETON);
        joinedSingleton.resolve();
        await waiting;
        return {};
      },
    });
    const producer = first.resolveAsync(SINGLETON);
    await providerWaiting.promise;
    const coalesced = second.resolveAsync(ROOT);
    await rootStarted.promise;
    const secondDisposal = second.disposeAsync();
    callChild.resolve();
    await targetWaiting.promise;
    joinSingleton.resolve();
    await joinedSingleton.promise;

    const outcome = await Promise.race([
      Promise.allSettled([
        producer,
        coalesced,
        secondDisposal,
        targetDisposal,
      ]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(true);
    expect(disposalTarget.disposed).toBe(true);
    await parent.disposeAsync();
  });

  test("rolls back construction waits when disposal-session linking is rejected", async () => {
    const PRODUCER = token<object>("PRODUCER");
    const ROOT = token<object>("ROOT");
    const RESOURCE = token<AsyncDisposable>("RESOURCE");
    const callChild = Promise.withResolvers<void>();
    const targetWaitingOnChild = Promise.withResolvers<void>();
    const joinProducer = Promise.withResolvers<void>();
    const rootStarted = Promise.withResolvers<void>();
    const joinRejected = Promise.withResolvers<unknown>();
    const attemptRoot = Promise.withResolvers<void>();
    const producerCalledTarget = Promise.withResolvers<void>();
    const producerWaitingOnRoot = Promise.withResolvers<void>();
    const finishRoot = Promise.withResolvers<void>();
    const parent = new Container();
    const producerScope = parent.createScope();
    const consumer = parent.createScope();
    const target = new Container();

    target.register(RESOURCE, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          await callChild.promise;
          const waiting = consumer.disposeAsync();
          targetWaitingOnChild.resolve();
          await waiting;
        },
      }),
    });
    target.resolve(RESOURCE);
    const targetDisposal = target.disposeAsync();

    parent.register(PRODUCER, {
      scope: "singleton",
      useFactoryAsync: async () => {
        const waitingOnTarget = target.disposeAsync();
        producerCalledTarget.resolve();
        await attemptRoot.promise;
        const waitingOnRoot = parent.resolveAsync(ROOT);
        producerWaitingOnRoot.resolve();
        await waitingOnRoot;
        await waitingOnTarget;
        return {};
      },
    });
    parent.register(ROOT, {
      scope: "singleton",
      useFactoryAsync: async () => {
        rootStarted.resolve();
        await joinProducer.promise;
        try {
          await parent.resolveAsync(PRODUCER);
        } catch (error) {
          joinRejected.resolve(error);
        }
        await finishRoot.promise;
        return {};
      },
    });

    const producer = producerScope.resolveAsync(PRODUCER);
    await producerCalledTarget.promise;
    const root = consumer.resolveAsync(ROOT);
    await rootStarted.promise;
    const consumerDisposal = consumer.disposeAsync();
    callChild.resolve();
    await targetWaitingOnChild.promise;
    joinProducer.resolve();
    await expect(joinRejected.promise).resolves.toBeInstanceOf(TypeError);
    attemptRoot.resolve();
    await producerWaitingOnRoot.promise;
    finishRoot.resolve();

    const outcome = await Promise.race([
      Promise.allSettled([
        producer,
        root,
        consumerDisposal,
        targetDisposal,
      ]),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);

    if (outcome === "timeout") throw new Error("disposal cycle timed out");
    expect(outcome.map(({ status }) => status)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ]);
    await parent.disposeAsync();
  });

  test("aggregates sync disposal failures after attempting every resource", () => {
    const FIRST = token<Disposable>("FIRST");
    const SECOND = token<Disposable>("SECOND");
    const attempted: string[] = [];
    const container = new Container();

    for (const [resource, name] of [
      [FIRST, "first"],
      [SECOND, "second"],
    ] as const) {
      container.register(resource, {
        useFactory: () => ({
          [Symbol.dispose]() {
            attempted.push(name);
            throw new Error(name);
          },
        }),
      });
      container.resolve(resource);
    }

    try {
      container.dispose();
      throw new Error("Expected disposal to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toHaveLength(2);
    }
    expect(attempted).toEqual(["second", "first"]);
    expect(container.disposed).toBe(true);
  });

  test("aggregates async disposal failures after attempting every resource", async () => {
    const FIRST = token<AsyncDisposable>("FIRST");
    const SECOND = token<AsyncDisposable>("SECOND");
    const attempted: string[] = [];
    const container = new Container();

    for (const [resource, name] of [
      [FIRST, "first"],
      [SECOND, "second"],
    ] as const) {
      container.register(resource, {
        useFactory: () => ({
          async [Symbol.asyncDispose]() {
            attempted.push(name);
            throw new Error(name);
          },
        }),
      });
      container.resolve(resource);
    }

    try {
      await container.disposeAsync();
      throw new Error("Expected disposal to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toHaveLength(2);
    }
    expect(attempted).toEqual(["second", "first"]);
    expect(container.disposed).toBe(true);
  });

  test("keeps dispose atomic when an owned resource requires async disposal", async () => {
    const ASYNC = token<AsyncDisposable>("ASYNC");
    const SYNC = token<Disposable>("SYNC");
    let asyncDisposals = 0;
    let syncDisposals = 0;
    const container = new Container();
    container.register(ASYNC, {
      useFactory: () => ({
        async [Symbol.asyncDispose]() {
          asyncDisposals += 1;
        },
      }),
    });
    container.register(SYNC, {
      useFactory: () => ({
        [Symbol.dispose]() {
          syncDisposals += 1;
        },
      }),
    });
    container.resolve(ASYNC);
    container.resolve(SYNC);

    expect(() => container.dispose()).toThrow();
    expect(container.disposed).toBe(false);
    expect(syncDisposals).toBe(0);
    expect(asyncDisposals).toBe(0);

    await container.disposeAsync();
    expect(syncDisposals).toBe(1);
    expect(asyncDisposals).toBe(1);
    expect(container.disposed).toBe(true);
  });

  test("keeps dispose atomic while resolution is pending and disposeAsync waits", async () => {
    const PENDING = token<AsyncDisposable>("PENDING");
    const SYNC = token<Disposable>("SYNC");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let asyncDisposals = 0;
    let syncDisposals = 0;
    const container = new Container();
    container.register(SYNC, {
      useFactory: () => ({
        [Symbol.dispose]() {
          syncDisposals += 1;
        },
      }),
    });
    container.register(PENDING, {
      useFactoryAsync: async () => {
        await gate;
        return {
          async [Symbol.asyncDispose]() {
            asyncDisposals += 1;
          },
        };
      },
    });
    container.resolve(SYNC);
    const pending = container.resolveAsync(PENDING);
    await Promise.resolve();

    expect(() => container.dispose()).toThrow();
    expect(container.disposed).toBe(false);
    expect(syncDisposals).toBe(0);

    const disposing = container.disposeAsync();
    release();
    await pending;
    await disposing;

    expect(syncDisposals).toBe(1);
    expect(asyncDisposals).toBe(1);
    expect(container.disposed).toBe(true);
  });

  test("rejects mutation, resolution, and new scopes after disposal", () => {
    const VALUE = token<number>("VALUE");
    const OTHER = token<number>("OTHER");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });
    container.dispose();

    expect(container.disposed).toBe(true);
    expect(() => container.register(OTHER, { useValue: 2 })).toThrow();
    expect(() => container.resolve(VALUE)).toThrow();
    expect(() => container.createScope()).toThrow();
  });

  test("supports using and await using", async () => {
    const SYNC = token<Disposable>("SYNC");
    const ASYNC = token<AsyncDisposable>("ASYNC");
    let syncDisposals = 0;
    let asyncDisposals = 0;
    let syncContainer!: Container;
    let asyncContainer!: Container;

    {
      using container = new Container();
      syncContainer = container;
      container.register(SYNC, {
        useFactory: () => ({
          [Symbol.dispose]() {
            syncDisposals += 1;
          },
        }),
      });
      container.resolve(SYNC);
    }

    {
      await using container = new Container();
      asyncContainer = container;
      container.register(ASYNC, {
        useFactory: () => ({
          async [Symbol.asyncDispose]() {
            asyncDisposals += 1;
          },
        }),
      });
      container.resolve(ASYNC);
    }

    expect(syncDisposals).toBe(1);
    expect(asyncDisposals).toBe(1);
    expect(syncContainer.disposed).toBe(true);
    expect(asyncContainer.disposed).toBe(true);
  });
});
