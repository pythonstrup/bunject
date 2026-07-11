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

function evaluateDag(nodes: readonly DagNode[]): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const dependencies = node.dependencies.map((dependency) => values[dependency]!);
    values.push(`${index}:${node.base}[${dependencies.join(",")}]`);
  }
  return values;
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
});
