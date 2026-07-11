import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { Container, token } from "../src/index";

interface DagNode {
  readonly base: number;
  readonly dependencies: readonly number[];
}

const dagArbitrary = fc
  .array(
    fc.record({
      base: fc.integer({ min: -9, max: 9 }),
      edges: fc.nat(255),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((nodes): readonly DagNode[] =>
    nodes.map(({ base, edges }, index) => ({
      base,
      dependencies: Array.from({ length: index }, (_, dependency) => dependency)
        .filter((dependency) => ((edges >>> dependency) & 1) === 1),
    })),
  );

const scopeLayersArbitrary = fc.array(
  fc.option(
    fc.array(fc.integer({ min: -20, max: 20 }), {
      minLength: 1,
      maxLength: 4,
    }),
    { nil: undefined },
  ),
  { minLength: 1, maxLength: 6 },
);

const mutationsArbitrary = fc.array(
  fc.record({
    rawIndex: fc.nat(255),
    base: fc.integer({ min: -9, max: 9 }),
  }),
  { minLength: 1, maxLength: 20 },
);

function evaluateDag(
  nodes: readonly DagNode[],
  bases: readonly number[] = nodes.map((node) => node.base),
): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const dependencies = node.dependencies.map((dependency) => values[dependency]!);
    values.push(`${index}:${bases[index]}[${dependencies.join(",")}]`);
  }
  return values;
}

function affectedNodes(nodes: readonly DagNode[], target: number): ReadonlySet<number> {
  const affected = new Set([target]);
  for (let index = target + 1; index < nodes.length; index += 1) {
    if (nodes[index]!.dependencies.some((dependency) => affected.has(dependency))) {
      affected.add(index);
    }
  }
  return affected;
}

describe("container properties", () => {
  test("matches a reference evaluator for generated dependency DAGs", () => {
    fc.assert(
      fc.property(dagArbitrary, (nodes) => {
        const expected = evaluateDag(nodes);
        const tokens = nodes.map((_, index) => token<string>(`NODE:${index}`));
        const calls = nodes.map(() => 0);
        const container = new Container();

        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index]!;
          container.register(tokens[index]!, {
            inject: node.dependencies.map((dependency) => tokens[dependency]!),
            scope: "singleton",
            useFactory: (...dependencies) => {
              calls[index]! += 1;
              return `${index}:${node.base}[${dependencies.join(",")}]`;
            },
          });
        }

        for (let index = nodes.length - 1; index >= 0; index -= 1) {
          expect(container.resolve(tokens[index]!)).toBe(expected[index]!);
        }
        expect(calls).toEqual(nodes.map(() => 1));
      }),
      { seed: 0x0b_01_ec_7, numRuns: 120 },
    );
  });

  test("matches nearest-scope shadowing for generated multi-binding chains", () => {
    fc.assert(
      fc.property(scopeLayersArbitrary, (layers) => {
        const VALUE = token<number>("VALUE");
        const scopes = [new Container()];

        for (let index = 1; index < layers.length; index += 1) {
          scopes.push(scopes[index - 1]!.createScope());
        }
        for (let index = 0; index < layers.length; index += 1) {
          for (const value of layers[index] ?? []) {
            scopes[index]!.registerMulti(VALUE, { useValue: value });
          }
        }

        let expected: readonly number[] = [];
        for (let index = 0; index < layers.length; index += 1) {
          expected = layers[index] ?? expected;
          const scope = scopes[index]!;
          expect(scope.resolveAll(VALUE)).toEqual(expected);

          if (expected.length === 0) {
            expect(() => scope.resolve(VALUE)).toThrow(
              expect.objectContaining({ code: "NOT_FOUND" }),
            );
          } else if (expected.length === 1) {
            expect(scope.resolve(VALUE)).toBe(expected[0]!);
          } else {
            expect(() => scope.resolve(VALUE)).toThrow(
              expect.objectContaining({ code: "MULTIPLE_PROVIDERS" }),
            );
          }
        }
      }),
      { seed: 0x05_c0_9e_5, numRuns: 100 },
    );
  });

  test("matches a cache invalidation model across generated graph mutations", () => {
    fc.assert(
      fc.property(dagArbitrary, mutationsArbitrary, (nodes, mutations) => {
        interface ResolvedNode {
          readonly text: string;
        }

        const tokens = nodes.map((_, index) =>
          token<ResolvedNode>(`MUTABLE_NODE:${index}`),
        );
        const bases = nodes.map((node) => node.base);
        const calls = nodes.map(() => 0);
        const container = new Container();
        const providerFor = (index: number) => ({
          inject: nodes[index]!.dependencies.map(
            (dependency) => tokens[dependency]!,
          ),
          scope: "singleton" as const,
          useFactory: (...dependencies: ResolvedNode[]): ResolvedNode => {
            calls[index]! += 1;
            return {
              text: `${index}:${bases[index]}[${dependencies
                .map((dependency) => dependency.text)
                .join(",")}]`,
            };
          },
        });

        tokens.forEach((nodeToken, index) => {
          container.register(nodeToken, providerFor(index));
        });

        let instances = tokens.map((nodeToken) => container.resolve(nodeToken));
        expect(instances.map((instance) => instance.text)).toEqual(
          [...evaluateDag(nodes, bases)],
        );

        for (const mutation of mutations) {
          const target = mutation.rawIndex % nodes.length;
          const affected = affectedNodes(nodes, target);
          const callsBefore = [...calls];
          bases[target] = mutation.base;
          container.rebind(tokens[target]!, providerFor(target));

          const next = tokens.map((nodeToken) => container.resolve(nodeToken));
          expect(next.map((instance) => instance.text)).toEqual(
            [...evaluateDag(nodes, bases)],
          );
          next.forEach((instance, index) => {
            if (affected.has(index)) expect(instance).not.toBe(instances[index]);
            else expect(instance).toBe(instances[index]!);
            expect(calls[index]).toBe(
              callsBefore[index]! + Number(affected.has(index)),
            );
          });

          const callsAfter = [...calls];
          const cached = tokens.map((nodeToken) => container.resolve(nodeToken));
          cached.forEach((instance, index) => {
            expect(instance).toBe(next[index]!);
          });
          expect(calls).toEqual(callsAfter);
          instances = next;
        }
      }),
      { seed: 0x0c_ac_4e_5, numRuns: 100 },
    );
  });
});
