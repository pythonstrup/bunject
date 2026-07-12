// @ts-self-types="./providers.d.ts"

import { registrationError, tokenName } from "./errors.js";
import {
  assertToken,
  injectionDependencies,
  isConstructible,
} from "./dependencies.js";
import type {
  ActivationHook,
  AnyDependency,
  AnyToken,
  AsyncDisposalHook,
  AsyncFactoryProvider,
  ClassToken,
  ClassProvider,
  ConstructorDependenciesMatch,
  DefinedProvider,
  Dependency,
  DependencyValues,
  DisposalHook,
  ExistingProvider,
  FactoryProvider,
  InjectableClass,
  InjectableDeclarationMatchesConstructor,
  InjectableOptions,
  InjectableOptionsWithInject,
  MetadataClassProvider,
  NormalizedDependency,
  Scope,
  ValueProvider,
} from "./types.js";

type AnyProvider =
  | ClassProvider<any, readonly AnyDependency[]>
  | MetadataClassProvider<any>
  | ValueProvider<any>
  | FactoryProvider<any, readonly []>
  | FactoryProvider<any, readonly AnyDependency[]>
  | AsyncFactoryProvider<any, readonly []>
  | AsyncFactoryProvider<any, readonly AnyDependency[]>
  | ExistingProvider<any>;
export type AnyProviderInput = AnyProvider | DefinedProvider<any>;

export type NormalizedProvider =
  | {
      readonly kind: "class";
      readonly useClass: InjectableClass<any>;
      readonly inject: readonly NormalizedDependency[];
      readonly scope: Scope;
      readonly onActivation: ActivationHook<any> | undefined;
      readonly onDisposal: DisposalHook<any> | undefined;
      readonly onDisposalAsync: AsyncDisposalHook<any> | undefined;
    }
  | {
      readonly kind: "value";
      readonly useValue: unknown;
    }
  | {
      readonly kind: "factory";
      readonly useFactory: (...dependencies: any[]) => unknown;
      readonly inject: readonly NormalizedDependency[];
      readonly scope: Scope;
      readonly onActivation: ActivationHook<any> | undefined;
      readonly onDisposal: DisposalHook<any> | undefined;
      readonly onDisposalAsync: AsyncDisposalHook<any> | undefined;
    }
  | {
      readonly kind: "asyncFactory";
      readonly useFactoryAsync: (
        ...dependencies: any[]
      ) => PromiseLike<unknown>;
      readonly inject: readonly NormalizedDependency[];
      readonly scope: Scope;
      readonly onActivation: ActivationHook<any> | undefined;
      readonly onDisposal: DisposalHook<any> | undefined;
      readonly onDisposalAsync: AsyncDisposalHook<any> | undefined;
    }
  | {
      readonly kind: "existing";
      readonly useExisting: AnyToken;
      readonly inject: readonly [AnyToken];
    };

interface InjectableMetadata {
  readonly scope: Scope;
  readonly inject: readonly AnyDependency[] | undefined;
}

const injectableOptions = new WeakMap<ClassToken<any>, InjectableMetadata>();

/** Stores standard-decorator scope/injection metadata without global registration. */
export function Injectable<
  const TDependencies extends readonly Dependency<any>[],
>(
  options: InjectableOptionsWithInject<TDependencies>,
): <
  TClass extends new (
    ...dependencies: DependencyValues<NoInfer<TDependencies>>
  ) => any,
>(
  value: TClass & ConstructorDependenciesMatch<TClass, TDependencies>,
  context: ClassDecoratorContext<TClass>,
) => void;
export function Injectable(options?: InjectableOptions): <
  const TClass extends ClassToken<any>,
>(
  value: TClass & InjectableDeclarationMatchesConstructor<NoInfer<TClass>>,
  context: ClassDecoratorContext<TClass>,
) => void;
export function Injectable(
  options:
    | InjectableOptions
    | InjectableOptionsWithInject<readonly AnyDependency[]> = {},
) {
  const scope = checkedScope(options.scope, "transient");

  return <TClass extends ClassToken<any>>(
    value: TClass,
    context: ClassDecoratorContext<TClass>,
  ): void => {
    const inject =
      options.inject === undefined
        ? undefined
        : injectionDependencies(options.inject, value, true);
    context.addInitializer(function () {
      injectableOptions.set(this, { scope, inject });
    });
  };
}

export function providerScope(provider: NormalizedProvider): Scope | undefined {
  if (provider.kind === "value") return "singleton";
  if (provider.kind === "existing") return undefined;
  return provider.scope;
}


export function normalizeProvider(
  input: AnyProviderInput | undefined,
  registeredToken: AnyToken,
): NormalizedProvider {
  const provider = input as AnyProvider | undefined;
  if ((typeof provider !== "object" && typeof provider !== "function") || !provider) {
    throw registrationError(
      "INVALID_PROVIDER",
      `Invalid provider for ${tokenName(registeredToken)}.`,
      registeredToken,
    );
  }

  const keys = [
    "useClass",
    "useValue",
    "useFactory",
    "useFactoryAsync",
    "useExisting",
  ].filter((key) => key in provider);
  if (keys.length !== 1) {
    throw registrationError(
      "INVALID_PROVIDER",
      `Provider for ${tokenName(registeredToken)} must define exactly one of ` +
        "useClass, useValue, useFactory, useFactoryAsync, or useExisting.",
      registeredToken,
    );
  }

  if ("useExisting" in provider) {
    assertBorrowedProvider(provider, registeredToken);
    assertToken(provider.useExisting, registeredToken);
    return {
      kind: "existing",
      useExisting: provider.useExisting,
      inject: [provider.useExisting],
    };
  }

  if ("useValue" in provider) {
    assertBorrowedProvider(provider, registeredToken);
    let promiseLike: boolean;
    try {
      promiseLike = isPromiseLike(provider.useValue);
    } catch (cause) {
      throw registrationError(
        "INVALID_PROVIDER",
        `Could not inspect useValue for ${tokenName(registeredToken)}.`,
        registeredToken,
        cause,
      );
    }
    if (promiseLike) {
      throw registrationError(
        "INVALID_PROVIDER",
        `Promise-like values are not supported for ${tokenName(registeredToken)}. ` +
          "Wrap the Promise in an object or use useFactoryAsync.",
        registeredToken,
      );
    }
    return { kind: "value", useValue: provider.useValue };
  }

  if ("useClass" in provider) {
    if (!isConstructible(provider.useClass)) {
      throw registrationError(
        "INVALID_PROVIDER",
        `useClass for ${tokenName(registeredToken)} must be constructible.`,
        registeredToken,
      );
    }
    const metadata = injectableOptions.get(provider.useClass);
    const declaredDependencies =
      provider.inject !== undefined
        ? provider.inject
        : metadata?.inject !== undefined
          ? metadata.inject
          : provider.useClass.inject;
    const hasDependencyDeclaration =
      provider.inject !== undefined ||
      metadata !== undefined ||
      provider.useClass.inject !== undefined;
    const inheritedDecoratorDependencies =
      inheritedInjectableDependencies(provider.useClass);
    if (
      declaredDependencies === undefined &&
      inheritedDecoratorDependencies !== undefined
    ) {
      throw registrationError(
        "INVALID_PROVIDER",
        `${tokenName(registeredToken)} must redeclare inherited decorator ` +
          "dependencies for its own constructor.",
        registeredToken,
      );
    }
    if (!hasDependencyDeclaration) {
      throw registrationError(
        "INVALID_PROVIDER",
        `${tokenName(registeredToken)} has no injection declaration. Use ` +
          "@Injectable(), static inject, or provider.inject (including [] for " +
          "a zero-argument class).",
        registeredToken,
      );
    }
    return {
      kind: "class",
      useClass: provider.useClass,
      inject: injectionDependencies(declaredDependencies, registeredToken),
      scope: checkedScope(
        provider.scope,
        inheritedInjectableScope(provider.useClass) ?? "transient",
        registeredToken,
      ),
      onActivation: checkedActivationHook(
        provider.onActivation,
        registeredToken,
      ),
      onDisposal: checkedDisposalHook(
        provider.onDisposal,
        "onDisposal",
        registeredToken,
      ),
      onDisposalAsync: checkedDisposalHook(
        provider.onDisposalAsync,
        "onDisposalAsync",
        registeredToken,
      ),
    };
  }

  const inject = injectionDependencies(provider.inject, registeredToken);
  const scope = checkedScope(provider.scope, "transient", registeredToken);
  if ("useFactory" in provider) {
    if (typeof provider.useFactory !== "function") {
      throw registrationError(
        "INVALID_PROVIDER",
        `useFactory for ${tokenName(registeredToken)} must be a function.`,
        registeredToken,
      );
    }
    return {
      kind: "factory",
      useFactory: provider.useFactory,
      inject,
      scope,
      onActivation: checkedActivationHook(
        provider.onActivation,
        registeredToken,
      ),
      onDisposal: checkedDisposalHook(
        provider.onDisposal,
        "onDisposal",
        registeredToken,
      ),
      onDisposalAsync: checkedDisposalHook(
        provider.onDisposalAsync,
        "onDisposalAsync",
        registeredToken,
      ),
    };
  }

  if (typeof provider.useFactoryAsync !== "function") {
    throw registrationError(
      "INVALID_PROVIDER",
      `useFactoryAsync for ${tokenName(registeredToken)} must be a function.`,
      registeredToken,
    );
  }
  return {
    kind: "asyncFactory",
    useFactoryAsync: provider.useFactoryAsync,
    inject,
    scope,
    onActivation: checkedActivationHook(
      provider.onActivation,
      registeredToken,
    ),
    onDisposal: checkedDisposalHook(
      provider.onDisposal,
      "onDisposal",
      registeredToken,
    ),
    onDisposalAsync: checkedDisposalHook(
      provider.onDisposalAsync,
      "onDisposalAsync",
      registeredToken,
    ),
  };
}

function checkedActivationHook<T>(
  hook: ActivationHook<T> | undefined,
  token: AnyToken,
): ActivationHook<T> | undefined {
  if (hook !== undefined && typeof hook !== "function") {
    throw registrationError(
      "INVALID_PROVIDER",
      `onActivation for ${tokenName(token)} must be a function.`,
      token,
    );
  }
  return hook;
}

function assertBorrowedProvider(
  provider: AnyProvider,
  token: AnyToken,
): void {
  if (
    provider.inject !== undefined ||
    provider.scope !== undefined ||
    provider.onActivation !== undefined ||
    provider.onDisposal !== undefined ||
    provider.onDisposalAsync !== undefined
  ) {
    throw registrationError(
      "INVALID_PROVIDER",
      `Borrowed provider for ${tokenName(token)} cannot define inject, scope, ` +
        "or lifecycle hooks.",
      token,
    );
  }
}

function checkedDisposalHook<
  THook extends DisposalHook<any> | AsyncDisposalHook<any>,
>(
  hook: THook | undefined,
  name: "onDisposal" | "onDisposalAsync",
  token: AnyToken,
): THook | undefined {
  if (hook !== undefined && typeof hook !== "function") {
    throw registrationError(
      "INVALID_PROVIDER",
      `${name} for ${tokenName(token)} must be a function.`,
      token,
    );
  }
  return hook;
}

function inheritedInjectableScope(
  useClass: InjectableClass<any>,
): Scope | undefined {
  let current: object | null = useClass;
  while (typeof current === "function") {
    const options = injectableOptions.get(current as ClassToken<any>);
    if (options) return options.scope;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function inheritedInjectableDependencies(
  useClass: InjectableClass<any>,
): readonly AnyDependency[] | undefined {
  let current: object | null = Object.getPrototypeOf(useClass);
  while (typeof current === "function") {
    const dependencies = injectableOptions.get(
      current as ClassToken<any>,
    )?.inject;
    if (dependencies !== undefined) return dependencies;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function checkedScope(
  scope: Scope | undefined,
  fallback: Scope,
  owner?: AnyToken,
): Scope {
  const value = scope === undefined ? fallback : scope;
  if (
    value !== "singleton" &&
    value !== "scoped" &&
    value !== "resolution" &&
    value !== "transient"
  ) {
    if (owner) {
      throw registrationError(
        "INVALID_PROVIDER",
        `Unknown provider scope for ${tokenName(owner)}: ${String(value)}.`,
        owner,
      );
    }
    throw new TypeError(`Unknown service scope: ${String(value)}.`);
  }
  return value;
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}
