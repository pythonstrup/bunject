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
  InjectableClass,
  InjectionToken,
  LazyDependency,
  MultiResolutionOptions,
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
  return (
    typeof value === "object" &&
    value !== null &&
    dependencyDescriptorType in value &&
    value[dependencyDescriptorType] !== "resolver" &&
    (kind === undefined || value[dependencyDescriptorType] === kind)
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

export function injectionDependencies(
  inject: readonly AnyDependency[] | undefined,
  owner: AnyToken,
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
  return inject.map((dependency) => {
    assertDependency(dependency, owner);
    if (typeof dependency !== "object" || dependency === null) return dependency;
    if (isResolverDependency(dependency)) return resolver();
    const descriptor = dependency as TokenDependencyDescriptor;
    if (descriptor[dependencyDescriptorType] === "all") {
      return all(descriptor.token, { chained: descriptor.chained });
    }
    if (descriptor[dependencyDescriptorType] === "optional") {
      return optional(descriptor.token);
    }
    return lazy(descriptor.token);
  });
}

export function assertToken(value: unknown, owner?: AnyToken): asserts value is AnyToken {
  if (typeof value !== "symbol" && !isConstructible(value)) {
    throw registrationError(
      "INVALID_TOKEN",
      owner
        ? `inject for ${tokenName(owner)} contains an invalid token.`
        : "A token must be a class or a token() symbol.",
      owner,
    );
  }
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
    };
    if (descriptor[dependencyDescriptorType] === "resolver") return;
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
