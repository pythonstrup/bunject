import { describe, expect, test } from "bun:test";
import { Container, all, lazy, optional, token } from "../src/index";

describe("registration modules", () => {
  test("commits staged single and multi registrations atomically", () => {
    const VALUE = token<number>("VALUE");
    const ITEMS = token<number>("ITEMS");
    const container = new Container();
    let escaped = false;

    container.load((registry) => {
      const chained = registry
        .register(VALUE, { useValue: 1 })
        .registerMulti(ITEMS, { useValue: 2 })
        .registerMulti(ITEMS, { useValue: 3 });
      expect(chained).toBe(registry);
      escaped = "resolve" in registry;
    });

    expect(escaped).toBe(false);
    expect(container.resolve(VALUE)).toBe(1);
    expect(container.resolveAll(ITEMS)).toEqual([2, 3]);
  });

  test("rolls back every staged registration when validation fails", () => {
    const EXISTING = token<object>("EXISTING");
    const STAGED = token<number>("STAGED");
    const container = new Container();
    container.register(EXISTING, {
      scope: "singleton",
      useFactory: () => ({}),
    });
    const instance = container.resolve(EXISTING);

    expect(() =>
      container.load((registry) => {
        registry.register(STAGED, { useValue: 1 });
        registry.register(EXISTING, { useValue: {} });
      }),
    ).toThrow(expect.objectContaining({ code: "DUPLICATE_PROVIDER" }));

    expect(container.has(STAGED)).toBe(false);
    expect(container.resolve(EXISTING)).toBe(instance);
  });

  test("locks the target family against reentrant side effects", () => {
    const VALUE = token<number>("VALUE");
    const PENDING = token<number>("PENDING");
    const container = new Container();
    container.register(PENDING, { useFactoryAsync: async () => 1 });

    expect(() =>
      container.load((registry) => {
        registry.register(VALUE, { useValue: 1 });
        container.dispose();
      }),
    ).toThrow();
    expect(container.disposed).toBe(false);
    expect(container.has(VALUE)).toBe(false);

    expect(() =>
      container.load((registry) => {
        registry.register(VALUE, { useValue: 1 });
        container.resolve(PENDING);
      }),
    ).toThrow(expect.objectContaining({ code: "CONTAINER_BUSY" }));
    expect(container.has(VALUE)).toBe(false);
  });
});

describe("graph inspection", () => {
  test("returns an immutable, side-effect-free graph with descriptor edges", () => {
    const REQUIRED = token<number>("REQUIRED");
    const OPTIONAL = token<number>("OPTIONAL");
    const MANY = token<number>("MANY");
    const DEFERRED = token<number>("DEFERRED");
    const ROOT = token<object>("ROOT");
    let constructions = 0;
    const container = new Container();
    container.register(REQUIRED, { useValue: 1 });
    container.registerMulti(MANY, { useValue: 2 });
    container.registerMulti(MANY, { useValue: 3 });
    container.register(ROOT, {
      inject: [REQUIRED, optional(OPTIONAL), all(MANY), lazy(DEFERRED)],
      useFactory: () => {
        constructions += 1;
        return {};
      },
    });

    const graph = container.inspect(ROOT);

    expect(graph.providers.map(({ token: provider }) => provider)).toEqual([
      ROOT,
      REQUIRED,
      MANY,
      MANY,
    ]);
    expect(graph.providers[0]?.dependencies.map(({ kind }) => kind)).toEqual([
      "required",
      "optional",
      "all",
      "lazy",
    ]);
    expect(graph.missing).toEqual([]);
    expect(constructions).toBe(0);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.providers)).toBe(true);

    container.unregister(REQUIRED);
    expect(container.inspect(ROOT).missing).toEqual([REQUIRED]);
  });

  test("distinguishes local registration from inherited availability", () => {
    const VALUE = token<number>("VALUE");
    const parent = new Container();
    parent.register(VALUE, { useValue: 1 });
    const child = parent.createScope();

    expect(child.has(VALUE)).toBe(true);
    expect(child.has(VALUE, { own: true })).toBe(false);
  });
});
