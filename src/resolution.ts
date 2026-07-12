// @ts-self-types="./resolution.d.ts"

import { AsyncLocalStorage } from "node:async_hooks";

import {
  isResolverDependency,
  isTokenDependencyDescriptor,
} from "./dependencies.js";
import {
  formatPath,
  providerFailure,
  resolutionError,
  tokenName,
} from "./errors.js";
import { isPromiseLike, providerScope } from "./providers.js";
import type { NormalizedProvider } from "./providers.js";
import { dependencyDescriptorType } from "./types.js";
import type {
  AnyToken,
  DependencyGraph,
  InspectedDependency,
  InspectedProvider,
} from "./types.js";
import type { Container } from "./container.js";

/** @internal */
export interface Registration {
  readonly token: AnyToken;
  readonly owner: Container;
  readonly provider: NormalizedProvider;
}

/** @internal */
export type RuntimeDependencies = Map<Container, Map<AnyToken, number>>;

/** @internal */
export interface Construction {
  readonly token: AnyToken;
  readonly path: readonly AnyToken[];
  readonly waits: Map<Construction, number>;
}

/** @internal */
export type CacheEntry =
  | {
      readonly state: "ready";
      readonly value: unknown;
      readonly dynamicDependencies: RuntimeDependencies;
    }
  | {
      readonly state: "pending";
      readonly promise: Promise<unknown>;
      readonly producer: Construction;
      readonly session: ResolutionSession;
      readonly dynamicDependencies: RuntimeDependencies;
    };

/** @internal */
export interface ResolutionSession {
  readonly caches: Map<Container, Map<Registration, CacheEntry>>;
}

/** @internal */
export interface ContainerFamily {
  mutating: boolean;
}

/** @internal */
export interface LifetimeCaptor {
  readonly token: AnyToken;
  readonly scope: "singleton" | "scoped" | "resolution";
  readonly rank: number;
  readonly domain: Container;
}

/** @internal */
export interface ResolutionContext {
  readonly container: Container;
  readonly family: ContainerFamily;
  readonly parent: ResolutionContext | undefined;
  readonly path: readonly AnyToken[];
  readonly session: ResolutionSession;
  readonly construction: Construction | undefined;
  readonly captor: LifetimeCaptor | undefined;
  readonly collector: RuntimeDependencies;
  active: boolean;
}

/** @internal */
export const RUNTIME_DEPENDENCY_RESOLVE = 1,
  RUNTIME_DEPENDENCY_HAS = 2,
  RUNTIME_DEPENDENCY_HAS_OWN = 4,
  RUNTIME_DEPENDENCY_RESOLVE_CHAINED = 8;

const runtimeDependencyParents = new WeakMap<
  RuntimeDependencies,
  RuntimeDependencies
>();

/** @internal */
export const resolutionContext = new AsyncLocalStorage<ResolutionContext>();

interface GraphBindingSet {
  readonly mode: "single" | "multi";
  readonly bindings: readonly Registration[];
}

/** @internal */
export interface GraphAccess {
  readonly lookup: (
    container: Container,
    token: AnyToken,
  ) => GraphBindingSet | undefined;
  readonly lookupSets: (
    container: Container,
    token: AnyToken,
    chained: boolean,
  ) => readonly GraphBindingSet[];
  readonly lookupOne: (
    container: Container,
    token: AnyToken,
    path: readonly AnyToken[],
  ) => Registration | undefined;
  readonly isAncestorOf: (
    ancestor: Container,
    container: Container,
  ) => boolean;
}

interface GraphValidation {
  readonly root: AnyToken;
  readonly lookup: Container;
  readonly synchronous: boolean;
  readonly all: boolean;
  readonly initialCaptor: LifetimeCaptor | undefined;
  readonly prefix: readonly AnyToken[];
  readonly chained: boolean;
  readonly access: GraphAccess;
}

/** @internal */
export function inspectGraph(
  root: AnyToken,
  lookup: Container,
  chained: boolean,
  access: GraphAccess,
): DependencyGraph {
  const providers: InspectedProvider[] = [];
  const missing = new Set<AnyToken>();
  const visited = new Map<Container, Set<Registration>>();
  const visit = (
    target: AnyToken,
    currentLookup: Container,
    emptyIsMissing: boolean,
    chainedBindings = false,
  ): void => {
    const bindingSets = access.lookupSets(
      currentLookup,
      target,
      chainedBindings,
    );
    if (bindingSets.length === 0) {
      if (emptyIsMissing) missing.add(target);
      return;
    }

    for (const bindings of bindingSets) {
      for (const [binding, registration] of bindings.bindings.entries()) {
        const scope = providerScope(registration.provider);
        const effectiveLookup =
          scope === "singleton" ? registration.owner : currentLookup;
        let registrations = visited.get(effectiveLookup);
        if (!registrations) {
          registrations = new Set();
          visited.set(effectiveLookup, registrations);
        }
        if (registrations.has(registration)) continue;
        registrations.add(registration);

        const dependencies =
          registration.provider.kind === "value"
            ? []
            : registration.provider.inject.map<InspectedDependency>(
                (dependency): InspectedDependency => {
                  if (isResolverDependency(dependency)) {
                    return Object.freeze({ kind: "resolver" });
                  }
                  if (isTokenDependencyDescriptor(dependency, "all")) {
                    return Object.freeze({
                      token: dependency.token,
                      kind: "all" as const,
                      chained: dependency.chained,
                    });
                  }
                  return Object.freeze({
                    token: isTokenDependencyDescriptor(dependency)
                      ? dependency.token
                      : dependency,
                    kind: isTokenDependencyDescriptor(dependency)
                      ? dependency[dependencyDescriptorType]
                      : "required",
                  });
                },
              );
        providers.push(
          Object.freeze({
            token: target,
            binding,
            mode: bindings.mode,
            kind: registration.provider.kind,
            scope,
            owner: registration.owner,
            dependencies: Object.freeze(dependencies),
          }),
        );

        for (const dependency of dependencies) {
          if (dependency.kind === "lazy" || dependency.kind === "resolver") {
            continue;
          }
          visit(
            dependency.token,
            effectiveLookup,
            dependency.kind === "required",
            dependency.kind === "all" && dependency.chained,
          );
        }
      }
    }
  };

  visit(root, lookup, true, chained);
  return Object.freeze({
    root,
    providers: Object.freeze(providers),
    missing: Object.freeze([...missing]),
  });
}

/** @internal */
export function validateGraph({
  root,
  lookup,
  synchronous,
  all,
  initialCaptor,
  prefix,
  chained,
  access,
}: GraphValidation): void {
  if (
    initialCaptor &&
    !access.isAncestorOf(lookup, initialCaptor.domain)
  ) {
    throw resolutionError(
      "CAPTIVE_DEPENDENCY",
      `${tokenName(initialCaptor.token)} (${initialCaptor.scope}) cannot ` +
        "resolve through a descendant container.",
      [...prefix, root],
    );
  }

  interface Frame {
    readonly token: AnyToken;
  }
  type VisitStates = Map<Container, Map<Registration, Set<string>>>;
  const states: VisitStates = new Map();
  const stack: Frame[] = prefix.map((token) => ({ token }));
  const containerIds = new Map<Container, number>();
  const containerId = (container: Container): number => {
    const known = containerIds.get(container);
    if (known !== undefined) return known;
    const identifier = containerIds.size;
    containerIds.set(container, identifier);
    return identifier;
  };
  const captorKey = (captor?: LifetimeCaptor): string =>
    captor
      ? `${captor.rank}:${containerId(captor.domain)}`
      : "none";
  const wasVisited = (
    source: VisitStates,
    currentLookup: Container,
    registration: Registration,
    captor?: LifetimeCaptor,
  ): boolean =>
    source
      .get(currentLookup)
      ?.get(registration)
      ?.has(captorKey(captor)) === true;
  const markVisited = (
    source: VisitStates,
    currentLookup: Container,
    registration: Registration,
    captor?: LifetimeCaptor,
  ): void => {
    let registrations = source.get(currentLookup);
    if (!registrations) {
      registrations = new Map();
      source.set(currentLookup, registrations);
    }
    let captors = registrations.get(registration);
    if (!captors) {
      captors = new Set();
      registrations.set(registration, captors);
    }
    captors.add(captorKey(captor));
  };

  const validateLazyLifetime = (
    token: AnyToken,
    currentLookup: Container,
    captor: LifetimeCaptor,
    path: readonly AnyToken[],
    visited: VisitStates,
    allBindings = false,
    chainedBindings = false,
  ): void => {
    const bindingSets = access.lookupSets(
      currentLookup,
      token,
      allBindings && chainedBindings,
    );
    for (const bindings of bindingSets) {
      for (const registration of bindings.bindings) {
        const scope = providerScope(registration.provider);
        const effectiveLookup =
          scope === "singleton" ? registration.owner : currentLookup;
        if (wasVisited(visited, effectiveLookup, registration, captor)) {
          continue;
        }
        markVisited(visited, effectiveLookup, registration, captor);

        let nextCaptor = captor;
        if (
          scope === "transient" &&
          !access.isAncestorOf(effectiveLookup, captor.domain)
        ) {
          throw resolutionError(
            "CAPTIVE_DEPENDENCY",
            `${tokenName(token)} (transient) cannot be captured by ` +
              `${tokenName(captor.token)} (${captor.scope}).`,
            path,
          );
        }
        if (scope && scope !== "transient") {
          const domain =
            scope === "singleton" ? registration.owner : effectiveLookup;
          const rank = lifetimeRank(scope);
          if (
            rank < captor.rank ||
            !access.isAncestorOf(domain, captor.domain)
          ) {
            throw resolutionError(
              "CAPTIVE_DEPENDENCY",
              `${tokenName(token)} (${scope}) cannot be captured by ` +
                `${tokenName(captor.token)} (${captor.scope}).`,
              path,
            );
          }
          nextCaptor = { token, scope, rank, domain };
        }

        if (registration.provider.kind === "value") continue;
        for (const dependency of registration.provider.inject) {
          if (isResolverDependency(dependency)) continue;
          const dependencyToken = isTokenDependencyDescriptor(dependency)
            ? dependency.token
            : dependency;
          const dependencyIsAll = isTokenDependencyDescriptor(
            dependency,
            "all",
          );
          const dependencyChained =
            dependencyIsAll && dependency.chained;
          if (
            access.lookupSets(
              effectiveLookup,
              dependencyToken,
              dependencyChained,
            ).length === 0
          ) {
            continue;
          }
          validateLazyLifetime(
            dependencyToken,
            effectiveLookup,
            nextCaptor,
            [...path, dependencyToken],
            visited,
            dependencyIsAll,
            dependencyChained,
          );
        }
      }
    }
  };

  const visitRegistration = (
    token: AnyToken,
    registration: Registration,
    currentLookup: Container,
    path: readonly AnyToken[],
    captor?: LifetimeCaptor,
  ): void => {
    const scope = providerScope(registration.provider);
    const effectiveLookup =
      scope === "singleton" ? registration.owner : currentLookup;
    const cycleStart = stack.findIndex((frame) => frame.token === token);
    if (cycleStart !== -1) {
      const cycle = [
        ...stack.slice(cycleStart).map((frame) => frame.token),
        token,
      ];
      throw resolutionError(
        "CIRCULAR",
        `Circular dependency detected: ${formatPath(cycle)}.`,
        path,
        undefined,
        cycle,
      );
    }
    if (wasVisited(states, effectiveLookup, registration, captor)) return;

    const provider = registration.provider;
    if (synchronous && provider.kind === "asyncFactory") {
      throw resolutionError(
        "ASYNC_IN_SYNC",
        `Async provider ${tokenName(token)} cannot be resolved with resolve(). ` +
          "Use resolveAsync() instead.",
        path,
      );
    }

    let nextCaptor = captor;
    if (
      scope === "transient" &&
      captor &&
      !access.isAncestorOf(effectiveLookup, captor.domain)
    ) {
      throw resolutionError(
        "CAPTIVE_DEPENDENCY",
        `${tokenName(token)} (transient) cannot be captured by ` +
          `${tokenName(captor.token)} (${captor.scope}).`,
        path,
      );
    }
    if (scope && scope !== "transient") {
      const domain =
        scope === "singleton" ? registration.owner : effectiveLookup;
      const rank = lifetimeRank(scope);
      if (
        captor &&
        (rank < captor.rank ||
          !access.isAncestorOf(domain, captor.domain))
      ) {
        throw resolutionError(
          "CAPTIVE_DEPENDENCY",
          `${tokenName(token)} (${scope}) cannot be captured by ` +
            `${tokenName(captor.token)} (${captor.scope}).`,
          path,
        );
      }
      nextCaptor = { token, scope, rank, domain };
    }

    stack.push({ token });
    if (provider.kind !== "value") {
      for (const dependency of provider.inject) {
        if (isResolverDependency(dependency)) continue;
        const dependencyToken = isTokenDependencyDescriptor(dependency)
          ? dependency.token
          : dependency;
        if (isTokenDependencyDescriptor(dependency, "lazy")) {
          if (nextCaptor) {
            validateLazyLifetime(
              dependencyToken,
              effectiveLookup,
              nextCaptor,
              [...path, dependencyToken],
              new Map(),
            );
          }
          continue;
        }
        if (
          isTokenDependencyDescriptor(dependency, "optional") &&
          !access.lookup(effectiveLookup, dependencyToken)
        ) {
          continue;
        }
        const allDependency = isTokenDependencyDescriptor(dependency, "all");
        visit(
          dependencyToken,
          effectiveLookup,
          nextCaptor,
          allDependency,
          allDependency && dependency.chained,
        );
      }
    }
    stack.pop();
    markVisited(states, effectiveLookup, registration, captor);
  };

  const visit = (
    token: AnyToken,
    currentLookup: Container,
    captor?: LifetimeCaptor,
    allBindings = false,
    chainedBindings = false,
  ): void => {
    const path = [...stack.map((frame) => frame.token), token];
    const bindingSets = access.lookupSets(
      currentLookup,
      token,
      allBindings && chainedBindings,
    );
    if (bindingSets.length === 0) {
      if (allBindings) return;
      throw resolutionError(
        "NOT_FOUND",
        `Provider not found for ${tokenName(token)}.`,
        path,
      );
    }

    const registrations = allBindings
      ? bindingSets.flatMap((bindings) => bindings.bindings)
      : [access.lookupOne(currentLookup, token, path)!];
    for (const registration of registrations) {
      visitRegistration(token, registration, currentLookup, path, captor);
    }
  };

  visit(root, lookup, initialCaptor, all, chained);
}

/** @internal */
export function createResolutionSession(): ResolutionSession {
  return { caches: new Map() };
}

/** @internal */
export function createConstruction(
  token: AnyToken,
  path: readonly AnyToken[],
): Construction {
  return { token, path, waits: new Map() };
}

/** @internal */
export function recordDynamicDependency(
  dependencies: RuntimeDependencies | undefined,
  lookup: Container,
  token: AnyToken,
  mode = RUNTIME_DEPENDENCY_RESOLVE,
): void {
  for (
    let current = dependencies;
    current;
    current = runtimeDependencyParents.get(current)
  ) {
    let tokens = current.get(lookup);
    if (!tokens) {
      tokens = new Map();
      current.set(lookup, tokens);
    }
    tokens.set(token, (tokens.get(token) ?? 0) | mode);
  }
}

/** @internal */
export function createRuntimeCollector(
  parent?: RuntimeDependencies,
): RuntimeDependencies {
  const collector: RuntimeDependencies = new Map();
  if (parent) runtimeDependencyParents.set(collector, parent);
  return collector;
}

/** @internal */
export function mergeRuntimeDependencies(
  target: RuntimeDependencies,
  source: ReadonlyMap<Container, ReadonlyMap<AnyToken, number>>,
): void {
  for (const [lookup, dependencies] of source) {
    let tokens = target.get(lookup);
    if (!tokens) {
      tokens = new Map();
      target.set(lookup, tokens);
    }
    for (const [token, mode] of dependencies) {
      tokens.set(token, (tokens.get(token) ?? 0) | mode);
    }
  }
}

/** @internal */
export function clearRuntimeDependencyParent(
  collector: RuntimeDependencies,
): void {
  runtimeDependencyParents.delete(collector);
}

/** @internal */
export function waitForConstruction(
  current: Construction | undefined,
  producer: Construction,
  promise: Promise<unknown>,
  beforeWait?: () => (() => void) | undefined,
): Promise<unknown> {
  return waitForConstructionStart(
    current,
    producer,
    () => promise,
    beforeWait,
  );
}

/** @internal */
export function waitForConstructionStart<T>(
  current: Construction | undefined,
  producer: Construction,
  start: () => Promise<T>,
  beforeWait?: () => (() => void) | undefined,
): Promise<T> {
  if (current) {
    const waitPath = findConstructionPath(producer, current, new Set());
    if (waitPath) {
      const cycle = [current.token, ...waitPath.map((item) => item.token)];
      throw resolutionError(
        "CIRCULAR",
        `Circular dependency detected: ${formatPath(cycle)}.`,
        [...current.path, ...waitPath.map((item) => item.token)],
        undefined,
        cycle,
      );
    }
  }

  // Cross-graph preflight must succeed before this construction edge is visible.
  const cleanupWait = beforeWait?.();
  if (current) {
    current.waits.set(producer, (current.waits.get(producer) ?? 0) + 1);
  }
  const cleanup = () => {
    if (current) {
      const remaining = (current.waits.get(producer) ?? 1) - 1;
      if (remaining === 0) current.waits.delete(producer);
      else current.waits.set(producer, remaining);
    }
    cleanupWait?.();
  };
  let promise: Promise<T>;
  try {
    promise = start();
  } catch (error) {
    cleanup();
    throw error;
  }
  return current || cleanupWait ? promise.finally(cleanup) : promise;
}

function findConstructionPath(
  current: Construction,
  target: Construction,
  visited: Set<Construction>,
): readonly Construction[] | undefined {
  if (current === target) return [current];
  if (visited.has(current)) return undefined;
  visited.add(current);
  for (const dependency of current.waits.keys()) {
    const path = findConstructionPath(dependency, target, visited);
    if (path) return [current, ...path];
  }
  return undefined;
}

/** @internal */
export function nextLifetimeCaptor(
  token: AnyToken,
  registration: Registration,
  lookup: Container,
  captor?: LifetimeCaptor,
): LifetimeCaptor | undefined {
  const scope = providerScope(registration.provider);
  if (!scope || scope === "transient") return captor;
  const domain = scope === "singleton" ? registration.owner : lookup;
  return strongerCaptor(captor, {
    token,
    scope,
    rank: lifetimeRank(scope),
    domain,
  });
}

/** @internal */
export function strongerCaptor(
  first?: LifetimeCaptor,
  second?: LifetimeCaptor,
): LifetimeCaptor | undefined {
  if (!first) return second;
  if (!second) return first;
  return second.rank >= first.rank ? second : first;
}

function lifetimeRank(
  scope: "singleton" | "scoped" | "resolution",
): number {
  if (scope === "singleton") return 3;
  if (scope === "scoped") return 2;
  return 1;
}

/** @internal */
export function providerPromiseLike(
  value: unknown,
  path: readonly AnyToken[],
): value is PromiseLike<unknown> {
  try {
    return isPromiseLike(value);
  } catch (cause) {
    throw providerFailure(path, cause);
  }
}

/** @internal */
export function consumeRejectedPromise(value: PromiseLike<unknown>): void {
  void Promise.resolve(value).catch(() => undefined);
}
