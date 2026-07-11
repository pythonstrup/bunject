// @ts-self-types="./dependencies.d.ts"

import { registrationError, tokenName } from "./errors.js";
import { dependencyDescriptorType } from "./types.js";
import type {
  AllDependency,
  AnyDependency,
  AnyToken,
  AsyncFactoryProvider,
  ClassProvider,
  Defined,
  DependencyTuple,
  FactoryProvider,
  ForwardRefDependency,
  ForwardRefTarget,
  InjectableClass,
  InjectionToken,
  LazyDependency,
  MultiResolutionOptions,
  NormalizedDependency,
  OptionalDependency,
  ProviderBuilder,
  ProviderWithInject,
  ResolverDependency,
  Token,
} from "./types.js";

/** Creates a unique symbol token carrying service type `T`. */
export function token<T>(description: string): InjectionToken<T> {
  return Symbol(description) as InjectionToken<T>;
}

/** Defers evaluation of one dependency declaration until registration. */
export function forwardRef<
  const TDependency extends ForwardRefTarget<any>,
>(get: () => TDependency): ForwardRefDependency<TDependency> {
  if (typeof get !== "function") {
    throw registrationError(
      "INVALID_TOKEN",
      "forwardRef() requires a dependency callback.",
    );
  }
  return Object.freeze({
    [dependencyDescriptorType]: "forward" as const,
    get,
  });
}

/** Declares a dependency whose absence is represented by `undefined`. */
export function optional<T>(target: Token<T>): OptionalDependency<T> {
  assertToken(target);
  return Object.freeze({
    [dependencyDescriptorType]: "optional" as const,
    token: target,
  });
}

/** Declares all bindings selected by nearest or chained lookup. */
export function all<T>(
  target: Token<T>,
  options: MultiResolutionOptions = {},
): AllDependency<T> {
  assertToken(target);
  return Object.freeze({
    [dependencyDescriptorType]: "all" as const,
    token: target,
    chained: options.chained === true,
  });
}

/** Declares a dependency whose target lookup and construction are deferred. */
export function lazy<T>(target: Token<T>): LazyDependency<T> {
  assertToken(target);
  return Object.freeze({
    [dependencyDescriptorType]: "lazy" as const,
    token: target,
  });
}

/** Injects a read-only resolver bound to the provider's activation container. */
export function resolver(): ResolverDependency {
  return Object.freeze({
    [dependencyDescriptorType]: "resolver" as const,
  });
}

/**
 * Type-checks a dependency-bearing provider while preserving its exact tuple
 * for later storage and registration. Call `defineProvider<T>()` to declare an
 * interface or other service type explicitly.
 */
export function defineProvider<
  T,
  const TDependencies extends DependencyTuple,
>(
  provider: ProviderWithInject<ClassProvider<T, TDependencies>, TDependencies>,
): Defined<
  ProviderWithInject<ClassProvider<T, TDependencies>, TDependencies>,
  T
>;
export function defineProvider<
  T,
  const TDependencies extends DependencyTuple,
>(
  provider: ProviderWithInject<FactoryProvider<T, TDependencies>, TDependencies>,
): Defined<
  ProviderWithInject<FactoryProvider<T, TDependencies>, TDependencies>,
  T
>;
export function defineProvider<
  T,
  const TDependencies extends DependencyTuple,
>(
  provider: ProviderWithInject<
    AsyncFactoryProvider<T, TDependencies>,
    TDependencies
  >,
): Defined<
  ProviderWithInject<AsyncFactoryProvider<T, TDependencies>, TDependencies>,
  T
>;
export function defineProvider<T>(): ProviderBuilder<T>;
export function defineProvider(provider?: unknown): unknown {
  return arguments.length === 0
    ? (definition: unknown) => definition
    : provider;
}

type TokenDependencyDescriptor =
  | OptionalDependency<any>
  | AllDependency<any>
  | LazyDependency<any>;

export function isTokenDependencyDescriptor(
  value: AnyDependency,
  kind: "all",
): value is AllDependency<any>;
export function isTokenDependencyDescriptor(
  value: AnyDependency,
  kind?: "optional" | "all" | "lazy",
): value is TokenDependencyDescriptor;
export function isTokenDependencyDescriptor(
  value: AnyDependency,
  kind?: "optional" | "all" | "lazy",
): value is TokenDependencyDescriptor {
  if (
    typeof value !== "object" ||
    value === null ||
    !(dependencyDescriptorType in value)
  ) {
    return false;
  }
  const descriptorKind = value[dependencyDescriptorType];
  return (
    (descriptorKind === "optional" ||
      descriptorKind === "all" ||
      descriptorKind === "lazy") &&
    (kind === undefined || descriptorKind === kind)
  );
}

export function isForwardRefDependency(
  value: unknown,
): value is ForwardRefDependency {
  return (
    typeof value === "object" &&
    value !== null &&
    dependencyDescriptorType in value &&
    value[dependencyDescriptorType] === "forward" &&
    typeof (value as { readonly get?: unknown }).get === "function"
  );
}

export function isResolverDependency(
  value: AnyDependency,
): value is ResolverDependency {
  return (
    typeof value === "object" &&
    value !== null &&
    dependencyDescriptorType in value &&
    value[dependencyDescriptorType] === "resolver"
  );
}

export function isConstructible(value: unknown): value is InjectableClass<any> {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

const constructibleTokens = new WeakSet<Function>();

export function injectionDependencies(
  inject: readonly AnyDependency[] | undefined,
  owner: AnyToken,
  deferForwardRefs: true,
): readonly AnyDependency[];
export function injectionDependencies(
  inject: readonly AnyDependency[] | undefined,
  owner: AnyToken,
  deferForwardRefs?: false,
): readonly NormalizedDependency[];
export function injectionDependencies(
  inject: readonly AnyDependency[] | undefined,
  owner: AnyToken,
  deferForwardRefs = false,
): readonly AnyDependency[] {
  if (inject === undefined) {
    return [];
  }
  if (!Array.isArray(inject)) {
    throw registrationError(
      "INVALID_PROVIDER",
      `inject for ${tokenName(owner)} must be an array of tokens.`,
      owner,
    );
  }
  return inject.map((dependency) =>
    normalizeDependency(dependency, owner, deferForwardRefs),
  );
}

function normalizeDependency(
  dependency: unknown,
  owner: AnyToken,
  deferForwardRefs: boolean,
): AnyDependency {
  assertDependency(dependency, owner);
  let normalized: AnyDependency = dependency;
  if (isForwardRefDependency(normalized)) {
    if (deferForwardRefs) return forwardRef(normalized.get);
    let forwarded: unknown;
    try {
      forwarded = normalized.get();
    } catch (cause) {
      throw registrationError(
        "INVALID_TOKEN",
        `forwardRef for ${tokenName(owner)} could not be evaluated.`,
        owner,
        cause,
      );
    }
    assertDependency(forwarded, owner);
    if (isForwardRefDependency(forwarded)) {
      throw registrationError(
        "INVALID_TOKEN",
        `forwardRef for ${tokenName(owner)} must return a direct dependency.`,
        owner,
      );
    }
    normalized = forwarded;
  }
  if (typeof normalized !== "object" || normalized === null) return normalized;
  if (isResolverDependency(normalized)) return resolver();
  const descriptor = normalized as TokenDependencyDescriptor;
  if (descriptor[dependencyDescriptorType] === "all") {
    return all(descriptor.token, { chained: descriptor.chained });
  }
  if (descriptor[dependencyDescriptorType] === "optional") {
    return optional(descriptor.token);
  }
  return lazy(descriptor.token);
}

export function assertToken(value: unknown, owner?: AnyToken): asserts value is AnyToken {
  if (typeof value === "symbol") return;
  if (typeof value === "function") {
    if (constructibleTokens.has(value)) return;
    if (isConstructible(value)) {
      constructibleTokens.add(value);
      return;
    }
  }
  throw registrationError(
    "INVALID_TOKEN",
    owner
      ? `inject for ${tokenName(owner)} contains an invalid token.`
      : "A token must be a class or a token() symbol.",
    owner,
  );
}

function assertDependency(
  value: unknown,
  owner: AnyToken,
): asserts value is AnyDependency {
  if (typeof value === "symbol" || isConstructible(value)) return;
  if (
    typeof value === "object" &&
    value !== null &&
    dependencyDescriptorType in value
  ) {
    const descriptor = value as {
      readonly [dependencyDescriptorType]: unknown;
      readonly token?: unknown;
      readonly chained?: unknown;
      readonly get?: unknown;
    };
    if (descriptor[dependencyDescriptorType] === "resolver") return;
    if (
      descriptor[dependencyDescriptorType] === "forward" &&
      typeof descriptor.get === "function"
    ) {
      return;
    }
    if (
      (descriptor[dependencyDescriptorType] === "optional" ||
        (descriptor[dependencyDescriptorType] === "all" &&
          typeof descriptor.chained === "boolean") ||
        descriptor[dependencyDescriptorType] === "lazy") &&
      (typeof descriptor.token === "symbol" || isConstructible(descriptor.token))
    ) {
      return;
    }
  }
  throw registrationError(
    "INVALID_TOKEN",
    `inject for ${tokenName(owner)} contains an invalid dependency.`,
    owner,
  );
}
