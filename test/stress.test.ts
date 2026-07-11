import { describe, expect, test } from "bun:test";
import {
  Container,
  ResolutionError,
  token,
} from "../src/index";

describe("stress and generated graphs", () => {
  test("resolves deterministic generated DAGs", () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const random = seededRandom(seed);
      const tokens = Array.from({ length: 40 }, (_, index) =>
        token<number>(`seed:${seed}:node:${index}`),
      );
      const container = new Container();
      container.register(tokens[0]!, { useValue: 1 });

      for (let index = 1; index < tokens.length; index += 1) {
        const dependencyCount = 1 + Math.floor(random() * Math.min(index, 3));
        const dependencyIndexes = new Set<number>();
        while (dependencyIndexes.size < dependencyCount) {
          dependencyIndexes.add(Math.floor(random() * index));
        }
        const dependencies = [...dependencyIndexes].map(
          (dependencyIndex) => tokens[dependencyIndex]!,
        );
        container.register(tokens[index]!, {
          inject: dependencies,
          scope: "singleton",
          useFactory: (...values: number[]) =>
            values.reduce((total, value) => total + value, 1),
        });
      }

      expect(container.resolve(tokens.at(-1)!)).toBeGreaterThan(0);
    }
  });

  test("deduplicates a singleton across many concurrent roots", async () => {
    const SHARED = token<object>("SHARED");
    let creations = 0;
    const roots = Array.from({ length: 500 }, (_, index) =>
      token<{ readonly index: number }>(`ROOT:${index}`),
    );
    const container = new Container();
    container.register(SHARED, {
      scope: "singleton",
      useFactoryAsync: async () => {
        creations += 1;
        await Bun.sleep(1);
        return {};
      },
    });
    roots.forEach((root, index) => {
      container.register(root, {
        inject: [SHARED],
        useFactory: () => ({ index }),
      });
    });

    const results = await Promise.all(roots.map((root) => container.resolveAsync(root)));
    expect(results).toHaveLength(roots.length);
    expect(creations).toBe(1);
  });

  test("preserves every caller path under a shared concurrent failure", async () => {
    const SHARED = token<object>("SHARED");
    const roots = Array.from({ length: 100 }, (_, index) =>
      token<object>(`ROOT:${index}`),
    );
    const container = new Container();
    container.register(SHARED, {
      scope: "singleton",
      useFactoryAsync: async () => {
        await Bun.sleep(1);
        throw new Error("shared failure");
      },
    });
    roots.forEach((root) => {
      container.register(root, {
        inject: [SHARED],
        useFactory: (shared) => shared,
      });
    });

    const results = await Promise.allSettled(
      roots.map((root) => container.resolveAsync(root)),
    );
    results.forEach((result, index) => {
      expect(result.status).toBe("rejected");
      const error = (result as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(ResolutionError);
      expect(error.path).toEqual([roots[index], SHARED]);
    });
  });
});

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
