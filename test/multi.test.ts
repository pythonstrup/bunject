import { describe, expect, test } from "bun:test";
import {
  Container,
  RegistrationError,
  ResolutionError,
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

  test("a local binding set shadows the complete parent set", () => {
    const VALUE = token<number>("VALUE");
    const parent = new Container();
    parent.registerMulti(VALUE, { useValue: 1 });
    parent.registerMulti(VALUE, { useValue: 2 });
    const child = parent.createScope();

    expect(child.resolveAll(VALUE)).toEqual([1, 2]);
    child.registerMulti(VALUE, { useValue: 3 });
    expect(child.resolveAll(VALUE)).toEqual([3]);
    expect(parent.resolveAll(VALUE)).toEqual([1, 2]);
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
