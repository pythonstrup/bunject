import { describe, expect, test } from "bun:test";
import { Container, ResolutionError, token } from "../src/index";

describe("activation hooks", () => {
  test("runs once for each created value with a typed context", () => {
    const SERVICE = token<{ active: boolean }>("SERVICE");
    let activations = 0;
    const container = new Container();
    container.register(SERVICE, {
      scope: "singleton",
      useFactory: () => ({ active: false }),
      onActivation: (value, context) => {
        activations += 1;
        value.active = true;
        expect(context.container).toBe(container);
        expect(context.token).toBe(SERVICE);
      },
    });

    const first = container.resolve(SERVICE);
    expect(first.active).toBe(true);
    expect(container.resolve(SERVICE)).toBe(first);
    expect(activations).toBe(1);
  });

  test("does not cache a value when activation fails", () => {
    const SERVICE = token<object>("SERVICE");
    let creations = 0;
    let activations = 0;
    const container = new Container();
    container.register(SERVICE, {
      scope: "singleton",
      useFactory: () => {
        creations += 1;
        return {};
      },
      onActivation: () => {
        activations += 1;
        if (activations === 1) throw new Error("activation failed");
      },
    });

    expect(() => container.resolve(SERVICE)).toThrow(ResolutionError);
    expect(container.resolve(SERVICE)).toBeDefined();
    expect(creations).toBe(2);
    expect(activations).toBe(2);
  });

  test("rejects asynchronous activation hooks through both resolve paths", async () => {
    const SYNC = token<object>("SYNC");
    const ASYNC = token<object>("ASYNC");
    const container = new Container();
    const asyncHook = (async (): Promise<void> => {}) as unknown as () =>
      undefined;
    container.register(SYNC, {
      useFactory: () => ({}),
      onActivation: asyncHook,
    });
    container.register(ASYNC, {
      useFactoryAsync: async () => ({}),
      onActivation: asyncHook,
    });

    expect(() => container.resolve(SYNC)).toThrow(
      expect.objectContaining({ code: "PROVIDER_FAILED" }),
    );
    await expect(container.resolveAsync(ASYNC)).rejects.toEqual(
      expect.objectContaining({ code: "PROVIDER_FAILED" }),
    );
  });

  test("rejects activation hook return values through both resolve paths", async () => {
    const SYNC = token<object>("SYNC");
    const ASYNC = token<object>("ASYNC");
    const container = new Container();
    const returningHook = (() => 1) as unknown as () => undefined;
    container.register(SYNC, {
      useFactory: () => ({}),
      onActivation: returningHook,
    });
    container.register(ASYNC, {
      useFactoryAsync: async () => ({}),
      onActivation: returningHook,
    });

    expect(() => container.resolve(SYNC)).toThrow(
      expect.objectContaining({ code: "PROVIDER_FAILED" }),
    );
    await expect(container.resolveAsync(ASYNC)).rejects.toEqual(
      expect.objectContaining({ code: "PROVIDER_FAILED" }),
    );
  });

  test("captures the post-activation disposal contract and dependency order", () => {
    const DEPENDENCY = token<Disposable>("DEPENDENCY");
    const ROOT = token<object>("ROOT");
    const order: string[] = [];
    const container = new Container();
    container.register(DEPENDENCY, {
      useFactory: () => ({
        [Symbol.dispose]() {
          order.push("dependency");
        },
      }),
    });
    container.register(ROOT, {
      useFactory: () => ({}),
      onActivation: (value, context) => {
        context.container.resolve(DEPENDENCY);
        Object.defineProperty(value, Symbol.dispose, {
          value: () => order.push("root"),
        });
      },
    });

    container.resolve(ROOT);
    container.dispose();

    expect(order).toEqual(["root", "dependency"]);
  });
});
