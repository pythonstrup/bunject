import { describe, expect, test } from "bun:test";
import {
  Container,
  RegistrationError,
  Injectable,
  token,
  type Scope,
} from "../src/index";

describe("registration validation", () => {
  test("reports stable registration error codes", () => {
    const TOKEN = token<number>("TOKEN");
    const invalidCases: Array<{
      readonly code: RegistrationError["code"];
      readonly register: (container: Container) => unknown;
    }> = [
      {
        code: "INVALID_TOKEN",
        register: (container) =>
          (container as any).register({ invalid: true }, { useValue: 1 }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) => (container as any).register(TOKEN, undefined),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) => (container as any).register(TOKEN, {}),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            useValue: 1,
            useFactory: () => 1,
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, { useValue: Promise.resolve(1) }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            inject: "not-an-array",
            useFactory: () => 1,
          }),
      },
      {
        code: "INVALID_TOKEN",
        register: (container) =>
          (container as any).register(TOKEN, {
            inject: [{}],
            useFactory: () => 1,
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, { useClass: 1 }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, { useFactory: 1 }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, { useFactoryAsync: 1 }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            scope: "request",
            useFactory: () => 1,
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) => (container as any).register(TOKEN),
      },
    ];

    for (const invalidCase of invalidCases) {
      try {
        invalidCase.register(new Container());
        throw new Error("Expected registration to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(RegistrationError);
        expect((error as RegistrationError).code).toBe(invalidCase.code);
      }
    }
  });

  test("exposes the duplicate token on registration errors", () => {
    const TOKEN = token<number>("TOKEN");
    const container = new Container();
    container.register(TOKEN, { useValue: 1 });

    try {
      container.register(TOKEN, { useValue: 2 });
      throw new Error("Expected registration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistrationError);
      expect(error).toMatchObject({
        code: "DUPLICATE_PROVIDER",
        token: TOKEN,
      });
    }
  });

  test("validates decorator options when the decorator is created", () => {
    expect(() => Injectable({ scope: "request" as Scope })).toThrow(TypeError);
  });

  test("rejects required constructors without an injection declaration", () => {
    class MissingDeclaration {
      constructor(readonly value: object) {}
    }
    const VALUE = token<MissingDeclaration>("VALUE");
    const container = new Container();

    expect(() => container.register(MissingDeclaration)).toThrow(
      expect.objectContaining({ code: "INVALID_PROVIDER" }),
    );
    expect(() =>
      container.register(VALUE, { useClass: MissingDeclaration }),
    ).toThrow(expect.objectContaining({ code: "INVALID_PROVIDER" }));
  });

  test("does not apply a base decorator tuple to a changed constructor", () => {
    class Database {}
    class Cache {}

    @Injectable({ inject: [Database] })
    class Base {
      constructor(readonly database: Database) {}
    }

    class Derived extends Base {
      constructor(readonly cache: Cache) {
        super(new Database());
      }
    }

    const container = new Container();
    expect(() => container.register(Derived)).toThrow(
      expect.objectContaining({ code: "INVALID_PROVIDER" }),
    );
    expect(() =>
      container.register(Derived, {
        inject: [Cache],
        useClass: Derived,
      }),
    ).not.toThrow();
  });

  test("freezes a container family while async resolution is active", async () => {
    const VALUE = token<object>("VALUE");
    const OTHER = token<object>("OTHER");
    const parent = new Container();
    parent.register(VALUE, {
      scope: "scoped",
      useFactoryAsync: async () => {
        await Bun.sleep(5);
        return {};
      },
    });
    const child = parent.createScope();
    const pending = child.resolveAsync(VALUE);

    expect(() => parent.register(OTHER, { useValue: {} })).toThrow(
      expect.objectContaining({ code: "CONTAINER_BUSY" }),
    );
    expect(() => child.register(OTHER, { useValue: {} })).toThrow(
      expect.objectContaining({ code: "CONTAINER_BUSY" }),
    );
    expect(() => parent.createScope()).toThrow(
      expect.objectContaining({ code: "CONTAINER_BUSY" }),
    );

    await pending;
    expect(parent.register(OTHER, { useValue: {} })).toBe(parent);
  });
});
