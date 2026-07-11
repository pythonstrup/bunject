import { describe, expect, test } from "bun:test";
import {
  Container,
  ResolutionError,
  Injectable,
  defineProvider,
  token,
  type Token,
} from "../src/index";

describe("Container", () => {
  test("reuses a defined provider without wrapping it", () => {
    const VALUE = token<number>("VALUE");
    const DOUBLE = token<number>("DOUBLE");
    const raw = {
      inject: [VALUE] as const,
      useFactory: (value: number) => value * 2,
    };
    const provider = defineProvider<number>()(raw);
    const container = new Container();
    container.register(VALUE, { useValue: 21 });
    container.register(DOUBLE, provider);

    expect(provider === raw).toBe(true);
    expect(container.resolve(DOUBLE)).toBe(42);
  });

  test("injects class, value, and factory providers", () => {
    class Database {
      readonly name = "main";
    }
    const DATABASE = token<Database>("DATABASE");
    const LABEL = token<string>("LABEL");

    @Injectable()
    class Repository {
      static inject = [DATABASE] as const;
      constructor(readonly database: Database) {}
    }

    @Injectable()
    class Application {
      static inject = [Repository, LABEL] as const;
      constructor(
        readonly repository: Repository,
        readonly label: string,
      ) {}
    }

    const container = new Container();
    container.register(DATABASE, { useValue: new Database() });
    container.register(LABEL, {
      inject: [DATABASE],
      useFactory: (database) => database.name,
    });
    container.register(Repository);
    container.register(Application);

    const application = container.resolve(Application);
    expect(application.repository.database.name).toBe("main");
    expect(application.label).toBe("main");
  });

  test("honors singleton, transient, and explicit scope precedence", () => {
    @Injectable({ scope: "singleton" })
    class Singleton {}

    @Injectable()
    class Transient {}

    @Injectable({ scope: "singleton" })
    class Overridden {}

    const container = new Container();
    container.register(Singleton);
    container.register(Transient);
    container.register(Overridden, {
      useClass: Overridden,
      scope: "transient",
    });

    expect(container.resolve(Singleton)).toBe(container.resolve(Singleton));
    expect(container.resolve(Transient)).not.toBe(container.resolve(Transient));
    expect(container.resolve(Overridden)).not.toBe(container.resolve(Overridden));
  });

  test("requires an explicit empty tuple for an undecorated class", () => {
    class PlainService {}
    const container = new Container();
    expect(() => container.register(PlainService)).toThrow(
      expect.objectContaining({ code: "INVALID_PROVIDER" }),
    );
    container.register(PlainService, {
      inject: [],
      useClass: PlainService,
    });

    expect(container.resolve(PlainService)).toBeInstanceOf(PlainService);
    expect(container.resolve(PlainService)).not.toBe(
      container.resolve(PlainService),
    );
  });

  test("keeps tokens with the same description distinct and preserves falsy values", () => {
    const FIRST = token<number>("VALUE");
    const SECOND = token<number>("VALUE");
    const EMPTY = token<undefined>("EMPTY");
    const container = new Container();

    container.register(FIRST, { useValue: 0 });
    container.register(SECOND, { useValue: 2 });
    container.register(EMPTY, { useValue: undefined });

    expect(container.resolve(FIRST)).toBe(0);
    expect(container.resolve(SECOND)).toBe(2);
    expect(container.resolve(EMPTY)).toBeUndefined();
  });

  test("caches an undefined singleton factory result", () => {
    const EMPTY = token<undefined>("EMPTY");
    let calls = 0;
    const container = new Container();
    container.register(EMPTY, {
      scope: "singleton",
      useFactory: () => {
        calls += 1;
        return undefined;
      },
    });

    expect(container.resolve(EMPTY)).toBeUndefined();
    expect(container.resolve(EMPTY)).toBeUndefined();
    expect(calls).toBe(1);
  });

  test("reports the complete missing dependency path", () => {
    const DATABASE = token<object>("DATABASE");

    @Injectable()
    class Repository {
      static inject = [DATABASE] as const;
      constructor(_database: object) {}
    }

    @Injectable()
    class Application {
      static inject = [Repository] as const;
      constructor(_repository: Repository) {}
    }

    const container = new Container();
    container.register(Repository);
    container.register(Application);

    try {
      container.resolve(Application);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).code).toBe("NOT_FOUND");
      expect((error as ResolutionError).path).toEqual([
        Application,
        Repository,
        DATABASE,
      ]);
      expect((error as Error).message).toContain(
        "Application -> Repository -> DATABASE",
      );
    }
  });

  test("detects cycles without rejecting a diamond graph", () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const C = token<object>("C");
    const D = token<object>("D");

    const cyclic = new Container();
    cyclic.register(A, { inject: [B], useFactory: (b) => ({ b }) });
    cyclic.register(B, { inject: [A], useFactory: (a) => ({ a }) });

    try {
      cyclic.resolve(A);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).code).toBe("CIRCULAR");
      expect((error as ResolutionError).path).toEqual([A, B, A]);
    }

    const diamond = new Container();
    diamond.register(D, { useFactory: () => ({}) });
    diamond.register(B, { inject: [D], useFactory: (d) => ({ d }) });
    diamond.register(C, { inject: [D], useFactory: (d) => ({ d }) });
    diamond.register(A, {
      inject: [B, C],
      useFactory: (b, c) => ({ b, c }),
    });
    expect(diamond.resolve(A)).toBeDefined();
  });

  test("detects async cycles instead of waiting on pending singletons", async () => {
    const A = token<object>("A");
    const B = token<object>("B");
    const container = new Container();
    container.register(A, {
      inject: [B],
      scope: "singleton",
      useFactoryAsync: async (b) => ({ b }),
    });
    container.register(B, {
      inject: [A],
      scope: "singleton",
      useFactoryAsync: async (a) => ({ a }),
    });

    await expect(container.resolveAsync(A)).rejects.toMatchObject({
      code: "CIRCULAR",
      path: [A, B, A],
    });
  });

  test("does not invoke an async provider through resolve, even when nested", () => {
    const CONFIG = token<object>("CONFIG");
    let calls = 0;

    @Injectable()
    class Application {
      static inject = [CONFIG] as const;
      constructor(_config: object) {}
    }

    const container = new Container();
    container.register(CONFIG, {
      useFactoryAsync: async () => {
        calls += 1;
        return {};
      },
    });
    container.register(Application);

    expect(() => container.resolve(Application)).toThrow(ResolutionError);
    expect(calls).toBe(0);
  });

  test("resolves mixed async graphs and deduplicates an async singleton", async () => {
    const CONFIG = token<{ port: number }>("CONFIG");
    let calls = 0;

    @Injectable()
    class Application {
      static inject = [CONFIG] as const;
      constructor(readonly config: { port: number }) {}
    }

    const container = new Container();
    container.register(CONFIG, {
      scope: "singleton",
      useFactoryAsync: async () => {
        calls += 1;
        await Bun.sleep(5);
        return { port: 3000 };
      },
    });
    container.register(Application);

    const [first, second] = await Promise.all([
      container.resolveAsync(Application),
      container.resolveAsync(Application),
    ]);
    expect(first.config).toBe(second.config);
    expect(calls).toBe(1);
  });

  test("never exposes an async provider through resolve after warm-up", async () => {
    const CONFIG = token<object>("CONFIG");
    const container = new Container();
    container.register(CONFIG, {
      scope: "singleton",
      useFactoryAsync: async () => ({}),
    });

    await container.resolveAsync(CONFIG);
    try {
      container.resolve(CONFIG);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).code).toBe("ASYNC_IN_SYNC");
    }
  });

  test("does not duplicate a sync singleton while async resolution is pending", async () => {
    const CONFIG = token<object>("CONFIG");
    let constructions = 0;

    @Injectable({ scope: "singleton" })
    class Application {
      static inject = [CONFIG] as const;
      constructor(_config: object) {
        constructions += 1;
      }
    }

    const container = new Container();
    container.register(CONFIG, {
      useFactoryAsync: async () => {
        await Bun.sleep(5);
        return {};
      },
    });
    container.register(Application);

    const pending = container.resolveAsync(Application);
    try {
      container.resolve(Application);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).code).toBe("ASYNC_IN_SYNC");
    }
    const resolved = await pending;
    await expect(container.resolveAsync(Application)).resolves.toBe(resolved);
    expect(() => container.resolve(Application)).toThrow(ResolutionError);
    expect(constructions).toBe(1);
  });

  test("rebases a shared pending failure for each caller", async () => {
    const SHARED = token<object>("SHARED");

    @Injectable()
    class FirstRoot {
      static inject = [SHARED] as const;
      constructor(_shared: object) {}
    }

    @Injectable()
    class SecondRoot {
      static inject = [SHARED] as const;
      constructor(_shared: object) {}
    }

    const container = new Container();
    container.register(SHARED, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await Bun.sleep(1);
        throw new Error("shared failure");
      },
    });
    container.register(FirstRoot);
    container.register(SecondRoot);

    const [first, second] = await Promise.allSettled([
      container.resolveAsync(FirstRoot),
      container.resolveAsync(SecondRoot),
    ]);
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    expect((first as PromiseRejectedResult).reason.path).toEqual([
      FirstRoot,
      SHARED,
    ]);
    expect((second as PromiseRejectedResult).reason.path).toEqual([
      SecondRoot,
      SHARED,
    ]);
  });

  test("retries a rejected async singleton", async () => {
    const VALUE = token<number>("VALUE");
    let attempts = 0;
    const container = new Container();
    container.register(VALUE, {
      scope: "singleton",
      useFactoryAsync: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary");
        return 42;
      },
    });

    await expect(container.resolveAsync(VALUE)).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
    });
    await expect(container.resolveAsync(VALUE)).resolves.toBe(42);
    expect(attempts).toBe(2);
  });

  test("preserves provider failures as causes", () => {
    const cause = new Error("boom");

    @Injectable()
    class Broken {
      constructor() {
        throw cause;
      }
    }

    const container = new Container();
    container.register(Broken);

    try {
      container.resolve(Broken);
      throw new Error("Expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).code).toBe("PROVIDER_FAILED");
      expect((error as Error).cause).toBe(cause);
    }
  });

  test("does not auto-register decorators and isolates containers", () => {
    @Injectable({ scope: "singleton" })
    class ServiceA {}

    const first = new Container();
    const second = new Container();

    expect(() => first.resolve(ServiceA)).toThrow(ResolutionError);
    first.register(ServiceA);
    second.register(ServiceA);
    expect(first.resolve(ServiceA)).not.toBe(second.resolve(ServiceA));
  });

  test("rejects duplicate registration and snapshots injection metadata", () => {
    const FIRST = token<number>("FIRST");
    const SECOND = token<number>("SECOND");
    const RESULT = token<number>("RESULT");
    const inject: [Token<number>] = [FIRST];
    const provider = {
      inject,
      useFactory: (value: number) => value,
    };
    const container = new Container();

    container.register(FIRST, { useValue: 1 });
    container.register(SECOND, { useValue: 2 });
    container.register(RESULT, provider);
    inject[0] = SECOND;

    expect(container.resolve(RESULT)).toBe(1);
    expect(() => container.register(FIRST, { useValue: 3 })).toThrow(TypeError);
  });

  test("snapshots a class's own static inject tuple", () => {
    const FIRST = token<number>("FIRST");
    const SECOND = token<number>("SECOND");

    @Injectable()
    class Consumer {
      static inject: Token<number>[] = [FIRST];
      constructor(readonly value: number) {}
    }

    const container = new Container();
    container.register(FIRST, { useValue: 1 });
    container.register(SECOND, { useValue: 2 });
    container.register(Consumer);
    Consumer.inject[0] = SECOND;

    expect(container.resolve(Consumer).value).toBe(1);
  });

  test("supports inherited injectable scope and static inject metadata", () => {
    const VALUE = token<number>("VALUE");

    @Injectable({ scope: "singleton" })
    class BaseService {
      static inject = [VALUE] as const;
      constructor(readonly value: number) {}
    }

    class DerivedService extends BaseService {}

    const container = new Container();
    container.register(VALUE, { useValue: 42 });
    container.register(DerivedService);

    const first = container.resolve(DerivedService);
    expect(first.value).toBe(42);
    expect(container.resolve(DerivedService)).toBe(first);
  });

  test("supports an explicit dependency tuple on class providers", () => {
    const VALUE = token<number>("VALUE");
    const CONSUMER = token<Consumer>("CONSUMER");

    class Consumer {
      constructor(readonly value: number) {}
    }

    const container = new Container();
    container.register(VALUE, { useValue: 42 });
    container.register(CONSUMER, { useClass: Consumer, inject: [VALUE] });

    expect(container.resolve(CONSUMER).value).toBe(42);
  });

  test("aliases an existing provider without creating a second instance", async () => {
    const TARGET = token<object>("TARGET");
    const ALIAS = token<object>("ALIAS");
    let creations = 0;
    const container = new Container();
    container.register(TARGET, {
      scope: "singleton",
      useFactoryAsync: async () => {
        creations += 1;
        return {};
      },
    });
    container.register(ALIAS, { useExisting: TARGET });

    expect(() => container.resolve(ALIAS)).toThrow(
      expect.objectContaining({
        code: "ASYNC_IN_SYNC",
        path: [ALIAS, TARGET],
      }),
    );
    const target = await container.resolveAsync(TARGET);
    await expect(container.resolveAsync(ALIAS)).resolves.toBe(target);
    expect(creations).toBe(1);
  });

  test("inspects registration and validates without construction", () => {
    const VALUE = token<object>("VALUE");
    const ASYNC = token<object>("ASYNC");
    let creations = 0;
    const container = new Container();
    container.register(VALUE, {
      useFactory: () => {
        creations += 1;
        return {};
      },
    });
    container.register(ASYNC, { useFactoryAsync: async () => ({}) });

    expect(container.has(VALUE)).toBeTrue();
    container.validate(VALUE);
    expect(() => container.validate(ASYNC)).toThrow(ResolutionError);
    container.validate(ASYNC, { async: true });
    expect(creations).toBe(0);
    expect(container.has(token<object>("OTHER"))).toBeFalse();
  });
});
