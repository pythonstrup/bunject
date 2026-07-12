import { describe, expect, test } from "bun:test";
import {
  Container,
  RegistrationError,
  Injectable,
  optional,
  token,
  type Scope,
} from "../src/index";

describe("registration validation", () => {
  test("reports stable registration error codes", () => {
    const TOKEN = token<number>("TOKEN");
    const invalidOptional = {
      ...optional(class Dependency {}),
      token: () => ({}),
    };
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
        code: "INVALID_TOKEN",
        register: (container) =>
          (container as any).register(() => {}, { useValue: 1 }),
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
            useValue: 1,
            onDisposal: () => {},
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            useExisting: TOKEN,
            onDisposalAsync: async () => {},
          }),
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
        code: "INVALID_TOKEN",
        register: (container) =>
          (container as any).register(TOKEN, {
            inject: [() => ({})],
            useFactory: () => 1,
          }),
      },
      {
        code: "INVALID_TOKEN",
        register: (container) =>
          (container as any).register(TOKEN, {
            inject: [invalidOptional],
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
          (container as any).register(TOKEN, {
            inject: [],
            useClass: () => ({}),
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            inject: null,
            useClass: class Service {},
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            scope: "singleton",
            useValue: 1,
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            inject: [],
            useExisting: TOKEN,
          }),
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
            useFactory: () => 1,
            onActivation: 1,
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            useFactory: () => 1,
            onDisposal: 1,
          }),
      },
      {
        code: "INVALID_PROVIDER",
        register: (container) =>
          (container as any).register(TOKEN, {
            useFactory: () => 1,
            onDisposalAsync: 1,
          }),
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

  test("keeps accepted token identity while rechecking class providers", () => {
    class Service {}
    const { proxy, revoke } = Proxy.revocable(Service, {});
    const OTHER = token<Service>("OTHER");
    const service = new Service();
    const container = new Container();
    container.register(proxy, { useValue: service });

    revoke();

    expect(container.resolve(proxy)).toBe(service);
    expect(container.unregister(proxy)).toBe(true);
    expect(() => container.resolve(proxy)).toThrow(
      expect.objectContaining({
        code: "NOT_FOUND",
        path: [proxy],
      }),
    );
    expect(() =>
      container.register(OTHER, {
        inject: [],
        useClass: proxy,
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_PROVIDER" }));

    const unusualName = new Proxy(class {}, {
      get(target, property, receiver) {
        return property === "name"
          ? Symbol("unusual")
          : Reflect.get(target, property, receiver);
      },
    });
    expect(() => new Container().resolve(unusualName)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
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

    class HiddenByDefault {
      constructor(
        readonly optional = 1,
        readonly required: object,
      ) {}
    }
    class HiddenByRest {
      constructor(..._values: [object]) {}
    }
    expect(HiddenByDefault.length).toBe(0);
    expect(HiddenByRest.length).toBe(0);
    expect(() => container.register(HiddenByDefault)).toThrow(
      expect.objectContaining({ code: "INVALID_PROVIDER" }),
    );
    expect(() => container.register(HiddenByRest)).toThrow(
      expect.objectContaining({ code: "INVALID_PROVIDER" }),
    );
  });

  test("accepts decorated constructors callable without dependencies", () => {
    @Injectable()
    class Optional {
      constructor(readonly value?: number) {}
    }

    @Injectable()
    class Defaulted {
      constructor(readonly value = 42) {}
    }

    @Injectable()
    class Rest {
      readonly values: readonly number[];

      constructor(...values: number[]) {
        this.values = values;
      }
    }

    const container = new Container();
    container.register(Optional);
    container.register(Defaulted);
    container.register(Rest);

    expect(container.resolve(Optional).value).toBeUndefined();
    expect(container.resolve(Defaulted).value).toBe(42);
    expect(container.resolve(Rest).values).toEqual([]);
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

  test("attaches metadata to a class produced by a stacked decorator", () => {
    const VALUE = token<number>("VALUE");
    function replace<TClass extends new (...dependencies: any[]) => any>(
      value: TClass,
      _context: ClassDecoratorContext<TClass>,
    ): TClass {
      return class extends value {} as TClass;
    }

    @replace
    @Injectable({ inject: [VALUE], scope: "singleton" })
    class Service {
      constructor(readonly value: number) {}
    }

    const container = new Container();
    container.register(VALUE, { useValue: 42 });
    container.register(Service);
    const service = container.resolve(Service);
    expect(service.value).toBe(42);
    expect(container.resolve(Service)).toBe(service);
  });

  test("locks only containers visible to an active async graph", async () => {
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
    const sibling = parent.createScope();
    expect(sibling.register(OTHER, { useValue: {} })).toBe(sibling);
    expect(sibling.resolve(OTHER)).toBeDefined();

    await pending;
    expect(parent.register(OTHER, { useValue: {} })).toBe(parent);
  });
});
