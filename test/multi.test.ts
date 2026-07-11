import { describe, expect, test } from "bun:test";
import {
  Container,
  RegistrationError,
  ResolutionError,
  all,
  token,
} from "../src/index";

describe("multi bindings", () => {
  test("resolves zero, one, and many bindings in registration order", () => {
    const VALUE = token<number>("VALUE");
    const container = new Container();
    expect(container.resolveAll(VALUE)).toEqual([]);

    container.registerMulti(VALUE, { useValue: 1 });
    expect(container.resolve(VALUE)).toBe(1);
    expect(container.resolveAll(VALUE)).toEqual([1]);

    container.registerMulti(VALUE, { useFactory: () => 2 });
    expect(container.resolveAll(VALUE)).toEqual([1, 2]);
    expect(() => container.resolve(VALUE)).toThrow(
      expect.objectContaining({
        code: "MULTIPLE_PROVIDERS",
        path: [VALUE],
      }),
    );
  });

  test("rejects mixing single and multi registration modes", () => {
    const FIRST = token<number>("FIRST");
    const SECOND = token<number>("SECOND");
    const container = new Container();
    container.register(FIRST, { useValue: 1 });
    container.registerMulti(SECOND, { useValue: 1 });

    for (const register of [
      () => container.registerMulti(FIRST, { useValue: 2 }),
      () => container.register(SECOND, { useValue: 2 }),
    ]) {
      expect(register).toThrow(
        expect.objectContaining({ code: "BINDING_MODE_CONFLICT" }),
      );
    }
  });

  test("preflights every binding before sync construction", async () => {
    const VALUE = token<number>("VALUE");
    let syncCalls = 0;
    let asyncCalls = 0;
    const container = new Container();
    container.registerMulti(VALUE, {
      useFactory: () => {
        syncCalls += 1;
        return 1;
      },
    });
    container.registerMulti(VALUE, {
      useFactoryAsync: async () => {
        asyncCalls += 1;
        return 2;
      },
    });

    expect(() => container.resolveAll(VALUE)).toThrow(
      expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
    );
    expect(syncCalls).toBe(0);
    expect(asyncCalls).toBe(0);
    await expect(container.resolveAllAsync(VALUE)).resolves.toEqual([1, 2]);
    expect(syncCalls).toBe(1);
    expect(asyncCalls).toBe(1);
  });

  test("coalesces concurrent async singletons per binding", async () => {
    const VALUE = token<{ readonly binding: number }>("VALUE");
    let creations = 0;
    const container = new Container();
    for (const binding of [1, 2]) {
      container.registerMulti(VALUE, {
        scope: "singleton",
        useFactoryAsync: async () => {
          creations += 1;
          await Bun.sleep(5);
          return { binding };
        },
      });
    }

    const [first, second] = await Promise.all([
      container.resolveAllAsync(VALUE),
      container.resolveAllAsync(VALUE),
    ]);
    expect(first.map((value) => value.binding)).toEqual([1, 2]);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(creations).toBe(2);
  });

  test("keeps nearest shadowing by default and chains child-to-parent across modes", () => {
    const VALUE = token<number>("VALUE");
    const root = new Container();
    root.registerMulti(VALUE, { useValue: 1 });
    root.registerMulti(VALUE, { useValue: 2 });
    const parent = root.createScope();
    parent.register(VALUE, { useValue: 3 });
    const child = parent.createScope();
    child.registerMulti(VALUE, { useValue: 4 });
    child.registerMulti(VALUE, { useValue: 5 });

    expect(child.resolveAll(VALUE)).toEqual([4, 5]);
    expect(child.resolveAll(VALUE, { chained: true })).toEqual([4, 5, 3, 1, 2]);
  });

  test("preflights and coalesces async chained bindings across levels", async () => {
    const VALUE = token<{ readonly source: string }>("VALUE");
    let childCreations = 0;
    let parentCreations = 0;
    const parent = new Container();
    parent.registerMulti(VALUE, {
      scope: "singleton",
      useFactoryAsync: async () => {
        parentCreations += 1;
        await Bun.sleep(5);
        return { source: "parent" };
      },
    });
    const child = parent.createScope();
    child.registerMulti(VALUE, {
      scope: "singleton",
      useFactory: () => {
        childCreations += 1;
        return { source: "child" };
      },
    });

    expect(() => child.resolveAll(VALUE, { chained: true })).toThrow(
      expect.objectContaining({ code: "ASYNC_IN_SYNC" }),
    );
    expect(childCreations).toBe(0);
    expect(parentCreations).toBe(0);

    const [first, second] = await Promise.all([
      child.resolveAllAsync(VALUE, { chained: true }),
      child.resolveAllAsync(VALUE, { chained: true }),
    ]);
    expect(first.map(({ source }) => source)).toEqual(["child", "parent"]);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(childCreations).toBe(1);
    expect(parentCreations).toBe(1);
  });

  test("preflights cross-set cycles before constructing an earlier binding", () => {
    const VALUE = token<number>("VALUE");
    let creations = 0;
    const parent = new Container();
    parent.register(VALUE, {
      inject: [VALUE],
      useFactory: (value) => value,
    });
    const child = parent.createScope();
    child.register(VALUE, {
      useFactory: () => {
        creations += 1;
        return 1;
      },
    });

    expect(() => child.resolveAll(VALUE, { chained: true })).toThrow(
      expect.objectContaining({ code: "CIRCULAR", path: [VALUE, VALUE] }),
    );
    expect(creations).toBe(0);
  });

  test("turns async chained-option failures into Promise rejections", async () => {
    const VALUE = token<number>("VALUE");
    const failure = new Error("options failed");
    const options = Object.defineProperty({}, "chained", {
      get() {
        throw failure;
      },
    });
    const operation = new Container().resolveAllAsync(VALUE, options);

    expect(operation).toBeInstanceOf(Promise);
    await expect(operation).rejects.toBe(failure);
  });

  test("all descriptors preserve explicit chained intent", () => {
    const VALUE = token<number>("VALUE");
    const ROOT = token<readonly number[]>("ROOT");
    const nearest = all(VALUE);
    const chained = all(VALUE, { chained: true });
    const parent = new Container();
    parent.registerMulti(VALUE, { useValue: 1 });
    const child = parent.createScope();
    child.registerMulti(VALUE, { useValue: 2 });
    child.register(ROOT, {
      inject: [chained],
      useFactory: (values) => values,
    });

    expect(nearest.chained).toBe(false);
    expect(chained.chained).toBe(true);
    expect(Object.isFrozen(chained)).toBe(true);
    expect(child.resolve(ROOT)).toEqual([2, 1]);
  });

  test("a single alias to a multi target remains ambiguous", () => {
    const TARGET = token<number>("TARGET");
    const ALIAS = token<number>("ALIAS");
    const container = new Container();
    container.registerMulti(TARGET, { useValue: 1 });
    container.registerMulti(TARGET, { useValue: 2 });
    container.register(ALIAS, { useExisting: TARGET });

    expect(() => container.resolve(ALIAS)).toThrow(
      expect.objectContaining({
        code: "MULTIPLE_PROVIDERS",
        path: [ALIAS, TARGET],
      }),
    );
  });

  test("multi registration errors expose their token", () => {
    const VALUE = token<number>("VALUE");
    const container = new Container();
    container.register(VALUE, { useValue: 1 });

    try {
      container.registerMulti(VALUE, { useValue: 2 });
      throw new Error("Expected registration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistrationError);
      expect(error).toMatchObject({
        code: "BINDING_MODE_CONFLICT",
        token: VALUE,
      });
    }
  });

  test("ambiguity failures are ResolutionErrors", () => {
    const VALUE = token<number>("VALUE");
    const container = new Container();
    container.registerMulti(VALUE, { useValue: 1 });
    container.registerMulti(VALUE, { useValue: 2 });

    try {
      container.resolve(VALUE);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).code).toBe("MULTIPLE_PROVIDERS");
    }
  });
});
