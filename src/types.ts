// @ts-self-types="./types.d.ts"

import type { Container } from "./container.js";

declare const injectionTokenType: unique symbol;
declare const definedProviderType: unique symbol;
export const dependencyDescriptorType = Symbol("bunject.dependency");

/** Activation lifetime for class and factory providers. */
export type Scope = "singleton" | "scoped" | "resolution" | "transient";

/** Concrete constructor that produces `T`. */
export type Constructor<T = unknown> = new (...dependencies: any[]) => T;

/** Abstract or concrete class usable as a token for `T`. */
export type ClassToken<T = unknown> = abstract new (
  ...dependencies: any[]
) => T;

/** Invariant symbol token carrying service type `T`. */
export type InjectionToken<T> = symbol & {
  readonly [injectionTokenType]: (value: T) => T;
};

/** Class or typed-symbol identity for a service. */
export type Token<T> = ClassToken<T> | InjectionToken<T>;

/** Excludes every runtime-thenable service from synchronous provider contracts. */
export type NonPromise<T> = T extends {
  then: (...arguments_: any[]) => unknown;
}
  ? never
  : T;

/** Rejects declarations whose actual value type contains a Promise-like branch. */
export type NonPromiseMatch<T> = [T] extends [NonPromise<T>] ? unknown : never;

/** Extracts the service type carried by a token. */
export type TokenValue<TToken extends Token<any>> =
  TToken extends ClassToken<infer TValue>
    ? TValue
    : TToken extends InjectionToken<infer TValue>
      ? TValue
      : never;

/** Frozen descriptor for an optional constructor/factory dependency. */
export interface OptionalDependency<T> {
  readonly [dependencyDescriptorType]: "optional";
  readonly token: Token<T>;
}

/** Frozen descriptor for every binding selected by its multi-resolution mode. */
export interface AllDependency<T> {
  readonly [dependencyDescriptorType]: "all";
  readonly token: Token<T>;
  readonly chained: boolean;
}

/** Frozen descriptor for deferred resolution of one token. */
export interface LazyDependency<T> {
  readonly [dependencyDescriptorType]: "lazy";
  readonly token: Token<T>;
}

/** Frozen descriptor that injects a Resolver bound to the activation container. */
export interface ResolverDependency {
  readonly [dependencyDescriptorType]: "resolver";
}

/** Dependency declaration that may be produced by a forward reference. */
export type ForwardRefTarget<T = any> =
  | Token<T>
  | OptionalDependency<T>
  | AllDependency<T>
  | LazyDependency<T>
  | ResolverDependency;

/** Frozen declaration whose dependency is evaluated during registration. */
export interface ForwardRefDependency<
  TDependency extends ForwardRefTarget<any> = ForwardRefTarget<any>,
> {
  readonly [dependencyDescriptorType]: "forward";
  readonly get: () => TDependency;
}

/** Dependency declaration after registration-time forward references are erased. */
export type NormalizedDependency<T = any> = ForwardRefTarget<T>;

/** Deferred sync/async lookup for a single target token. */
export interface Lazy<T> {
  /** Resolves the deferred target synchronously. */
  readonly resolve: () => T;
  /** Resolves the deferred target through the async graph path. */
  readonly resolveAsync: () => Promise<T>;
}

/** Registration-query and resolution access bound to the activation container. */
export interface Resolver {
  /** Tests registration availability without construction. */
  readonly has: <T>(
    token: Token<T>,
    options?: RegistrationQueryOptions,
  ) => boolean;
  /** Resolves one required provider synchronously. */
  readonly resolve: <T>(token: Token<T>) => T;
  /** Returns `undefined` when absent; otherwise resolves synchronously. */
  readonly resolveOptional: <T>(token: Token<T>) => T | undefined;
  /** Resolves one required provider through the async graph path. */
  readonly resolveAsync: <T>(token: Token<T>) => Promise<T>;
  /** Returns `undefined` when absent; otherwise resolves asynchronously. */
  readonly resolveOptionalAsync: <T>(
    token: Token<T>,
  ) => Promise<T | undefined>;
  /** Resolves the selected complete binding sets synchronously. */
  readonly resolveAll: <T>(
    token: Token<T>,
    options?: MultiResolutionOptions,
  ) => readonly T[];
  /** Resolves the selected complete binding sets asynchronously. */
  readonly resolveAllAsync: <T>(
    token: Token<T>,
    options?: MultiResolutionOptions,
  ) => Promise<readonly T[]>;
}

/** Token or descriptor accepted in an explicit injection tuple. */
export type Dependency<T = any> =
  | ForwardRefTarget<T>
  | ForwardRefDependency<ForwardRefTarget<T>>;

/** Maps one dependency declaration to its injected runtime value. */
export type DependencyValue<TDependency extends Dependency<any>> =
  TDependency extends ForwardRefDependency<infer TForwarded>
    ? DependencyValue<TForwarded>
    : TDependency extends ResolverDependency
      ? Resolver
      : TDependency extends OptionalDependency<infer TValue>
        ? TValue | undefined
        : TDependency extends AllDependency<infer TValue>
          ? readonly TValue[]
          : TDependency extends LazyDependency<infer TValue>
            ? Lazy<TValue>
            : TDependency extends Token<any>
              ? TokenValue<TDependency>
              : never;

/** Maps an injection tuple to mutable constructor/factory parameters. */
export type DependencyValues<TDependencies extends readonly Dependency<any>[]> = {
  -readonly [TIndex in keyof TDependencies]: DependencyValue<
    TDependencies[TIndex]
  >;
};

/** Maps a tuple of direct tokens to their service values. */
export type TokenValues<TTokens extends readonly Token<any>[]> =
  DependencyValues<TTokens>;

/** Concrete service class with an optional explicit static dependency tuple. */
export type InjectableClass<T = unknown> = Constructor<T> & {
  readonly inject?: readonly Dependency<any>[];
};

type DependencyParametersMatch<
  TDependencies extends readonly Dependency<any>[],
  TParameters extends readonly unknown[],
> = number extends TDependencies["length"]
  ? number extends TParameters["length"]
    ? DependencyValues<TDependencies> extends TParameters
      ? unknown
      : never
    : never
  : DependencyValues<TDependencies> extends TParameters
    ? unknown
    : never;

// ponytail: TypeScript exposes overload sets only through finite inference.
// Twelve covers practical constructor APIs; use an adapter for overloaded input.
type ConstructorSignatureSets<TClass> = TClass extends {
  new (...dependencies: infer T1): infer R1;
  new (...dependencies: infer T2): infer R2;
  new (...dependencies: infer T3): infer R3;
  new (...dependencies: infer T4): infer R4;
  new (...dependencies: infer T5): infer R5;
  new (...dependencies: infer T6): infer R6;
  new (...dependencies: infer T7): infer R7;
  new (...dependencies: infer T8): infer R8;
  new (...dependencies: infer T9): infer R9;
  new (...dependencies: infer T10): infer R10;
  new (...dependencies: infer T11): infer R11;
  new (...dependencies: infer T12): infer R12;
}
  ? | [T1, R1]
    | [T2, R2]
    | [T3, R3]
    | [T4, R4]
    | [T5, R5]
    | [T6, R6]
    | [T7, R7]
    | [T8, R8]
    | [T9, R9]
    | [T10, R10]
    | [T11, R11]
    | [T12, R12]
  : never;

type FactorySignatureSets<TFactory> = TFactory extends {
  (...dependencies: infer T1): infer R1;
  (...dependencies: infer T2): infer R2;
  (...dependencies: infer T3): infer R3;
  (...dependencies: infer T4): infer R4;
  (...dependencies: infer T5): infer R5;
  (...dependencies: infer T6): infer R6;
  (...dependencies: infer T7): infer R7;
  (...dependencies: infer T8): infer R8;
  (...dependencies: infer T9): infer R9;
  (...dependencies: infer T10): infer R10;
  (...dependencies: infer T11): infer R11;
  (...dependencies: infer T12): infer R12;
}
  ? | [T1, R1]
    | [T2, R2]
    | [T3, R3]
    | [T4, R4]
    | [T5, R5]
    | [T6, R6]
    | [T7, R7]
    | [T8, R8]
    | [T9, R9]
    | [T10, R10]
    | [T11, R11]
    | [T12, R12]
  : never;

type TypeEqual<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
  T,
>() => T extends TRight ? 1 : 2
  ? (<T>() => T extends TRight ? 1 : 2) extends <T>() =>
        T extends TLeft ? 1 : 2
    ? true
    : false
  : false;

type SignatureMatches<TSignatures, TExpected> = TSignatures extends unknown
  ? TypeEqual<TSignatures, TExpected>
  : never;

type ConstructorSignatureMatch<TClass extends ClassToken<any>> = false extends
  SignatureMatches<
    ConstructorSignatureSets<TClass>,
    [ConstructorParameters<TClass>, InstanceType<TClass>]
  >
  ? never
  : unknown;

type FactorySignatureMatch<
  TFactory extends (...dependencies: any[]) => unknown,
> = false extends SignatureMatches<
  FactorySignatureSets<TFactory>,
  [Parameters<TFactory>, ReturnType<TFactory>]
>
  ? never
  : unknown;

export type ConstructorDependenciesMatch<
  TClass extends ClassToken<any>,
  TDependencies extends readonly Dependency<any>[],
> = DependencyParametersMatch<
  TDependencies,
  ConstructorParameters<TClass>
> &
  ConstructorSignatureMatch<TClass>;

export type FactoryDependenciesMatch<
  TFactory extends (...dependencies: any[]) => unknown,
  TDependencies extends readonly Dependency<any>[],
> = DependencyParametersMatch<TDependencies, Parameters<TFactory>> &
  FactorySignatureMatch<TFactory>;

export type StaticInjectMatchesConstructor<TClass extends ClassToken<any>> =
  TClass extends {
    readonly inject: infer TDependencies extends readonly Dependency<any>[];
  }
    ? ConstructorDependenciesMatch<TClass, TDependencies>
    : ConstructorSignatureMatch<TClass>;

export type InjectableDeclarationMatchesConstructor<
  TClass extends ClassToken<any>,
> = TClass extends { readonly inject: readonly Dependency<any>[] }
  ? StaticInjectMatchesConstructor<TClass>
  : ConstructorDependenciesMatch<TClass, readonly []>;

export type ProviderMatchesDeclaration<TProvider> = TProvider extends {
  readonly useValue: infer TValue;
}
  ? NonPromiseMatch<TValue>
  : TProvider extends {
    readonly useClass: infer TClass extends InjectableClass<any>;
    readonly inject: infer TDependencies extends readonly Dependency<any>[];
  }
    ? ConstructorDependenciesMatch<TClass, TDependencies> &
        NonPromiseMatch<InstanceType<TClass>>
    : TProvider extends {
          readonly useFactory: infer TFactory extends (
            ...dependencies: any[]
          ) => unknown;
          readonly inject: infer TDependencies extends readonly Dependency<any>[];
        }
      ? FactoryDependenciesMatch<TFactory, TDependencies> &
          NonPromiseMatch<ReturnType<TFactory>>
      : TProvider extends {
            readonly useFactory: infer TFactory extends (
              ...dependencies: any[]
            ) => unknown;
          }
        ? FactoryDependenciesMatch<TFactory, readonly []> &
            NonPromiseMatch<ReturnType<TFactory>>
        : TProvider extends {
            readonly useFactoryAsync: infer TFactory extends (
              ...dependencies: any[]
            ) => unknown;
            readonly inject: infer TDependencies extends readonly Dependency<any>[];
          }
          ? FactoryDependenciesMatch<TFactory, TDependencies>
          : TProvider extends {
                readonly useFactoryAsync: infer TFactory extends (
                  ...dependencies: any[]
                ) => unknown;
              }
            ? FactoryDependenciesMatch<TFactory, readonly []>
            : TProvider extends {
                  readonly useClass: infer TClass extends InjectableClass<any>;
                }
              ? StaticInjectMatchesConstructor<TClass> &
                  NonPromiseMatch<InstanceType<TClass>>
              : unknown;

/** Scope-only `@Injectable()` options without a decorator dependency tuple. */
export interface InjectableOptions {
  readonly scope?: Scope;
  readonly inject?: never;
}

/** Decorator options carrying an exact constructor dependency tuple. */
export interface InjectableOptionsWithInject<
  TDependencies extends readonly Dependency<any>[],
> {
  readonly scope?: Scope;
  readonly inject: TDependencies;
}

/** Selects nearest-set or child-to-root multi-resolution. */
export interface MultiResolutionOptions {
  readonly chained?: boolean;
}

/** Selects sync/async and single/all graph preflight semantics. */
export interface ValidationOptions {
  readonly async?: boolean;
  readonly all?: boolean;
  readonly chained?: boolean;
}

/** Controls inherited versus local-only registration queries. */
export interface RegistrationQueryOptions {
  readonly own?: boolean;
}

/** Frozen context passed to a provider activation hook. */
export interface ActivationContext<T> {
  readonly container: Container;
  readonly token: Token<T>;
}

/** Synchronous post-construction hook; returning a value is forbidden. */
export type ActivationHook<T> = (
  value: T,
  context: ActivationContext<T>,
) => undefined;

/** Frozen ownership context passed to provider cleanup hooks. */
export interface DisposalContext<T> {
  readonly container: Container;
  readonly token: Token<T>;
}

/** Synchronous provider cleanup adapter. */
export type DisposalHook<T> = (
  value: T,
  context: DisposalContext<T>,
) => undefined;

/** Asynchronous provider cleanup adapter. */
export type AsyncDisposalHook<T> = (
  value: T,
  context: DisposalContext<T>,
) => PromiseLike<void>;

/** Normalized provider kind reported by graph inspection. */
export type ProviderKind =
  | "class"
  | "value"
  | "factory"
  | "asyncFactory"
  | "existing";

/** Dependency edge kind reported by graph inspection. */
export type DependencyKind =
  | "required"
  | "optional"
  | "all"
  | "lazy"
  | "resolver";

/** Frozen dependency edge in an inspected graph. */
export type InspectedDependency =
  | {
      readonly token: Token<any>;
      readonly kind: Exclude<DependencyKind, "all" | "resolver">;
    }
  | {
      readonly token: Token<any>;
      readonly kind: "all";
      readonly chained: boolean;
    }
  | {
      readonly token?: never;
      readonly kind: "resolver";
    };

/** Frozen provider node in an inspected graph. */
export interface InspectedProvider {
  readonly token: Token<any>;
  readonly binding: number;
  readonly mode: "single" | "multi";
  readonly kind: ProviderKind;
  readonly scope: Scope | undefined;
  readonly owner: Container;
  readonly dependencies: readonly InspectedDependency[];
}

/** Frozen, construction-free view of a token's declared dependency graph. */
export interface DependencyGraph {
  readonly root: Token<any>;
  readonly providers: readonly InspectedProvider[];
  readonly missing: readonly Token<any>[];
}

/** Restricted registration surface exposed inside an atomic module. */
export interface RegistrationRegistry {
  /** Adds one staged single binding and returns this registry. */
  register<const TClass extends InjectableClass<any>>(
    service: TClass &
      StaticInjectMatchesConstructor<NoInfer<TClass>> &
      NonPromiseMatch<InstanceType<TClass>>,
  ): this;
  register<T, const TClass extends InjectableClass<NonPromise<T>>>(
    token: Token<T>,
    provider: MetadataClassProvider<NoInfer<T>, TClass>,
  ): this;
  register<
    T,
    const TDependencies extends DependencyTuple,
    const TClass extends InjectableClass<NonPromise<NoInfer<T>>> &
      (new (
        ...dependencies: DependencyValues<TDependencies>
      ) => NonPromise<NoInfer<T>>),
  >(
    token: Token<T>,
    provider: ProviderWithInject<
      CheckedClassProvider<NoInfer<T>, TDependencies, TClass>,
      TDependencies
    >,
  ): this;
  register<T, const TValue extends T>(
    token: Token<T>,
    provider: CheckedValueProvider<NoInfer<T>, TValue>,
  ): this;
  register<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  register<
    T,
    const TFactory extends () => NonPromise<NoInfer<T>>,
  >(
    token: Token<T>,
    provider: CheckedFactoryProvider<NoInfer<T>, readonly [], TFactory>,
  ): this;
  register<
    T,
    const TDependencies extends DependencyTuple,
    const TFactory extends (
      ...dependencies: DependencyValues<TDependencies>
    ) => NonPromise<NoInfer<T>>,
  >(
    token: Token<T>,
    provider: ProviderWithInject<
      CheckedFactoryProvider<NoInfer<T>, TDependencies, TFactory>,
      TDependencies
    >,
  ): this;
  register<T>(
    token: Token<T>,
    provider: AsyncFactoryProvider<NoInfer<T>, readonly []>,
  ): this;
  register<
    T,
    const TDependencies extends DependencyTuple,
    const TFactory extends (
      ...dependencies: DependencyValues<TDependencies>
    ) => PromiseLike<NonPromise<NoInfer<T>>>,
  >(
    token: Token<T>,
    provider: ProviderWithInject<
      CheckedAsyncFactoryProvider<NoInfer<T>, TDependencies, TFactory>,
      TDependencies
    >,
  ): this;
  register<T, TDefined extends T>(
    token: Token<T>,
    provider: DefinedProvider<TDefined> & NonPromiseMatch<TDefined>,
  ): this;
  register<T, const TProvider extends Provider<NoInfer<T>>>(
    token: Token<T>,
    provider: TProvider & ProviderMatchesDeclaration<NoInfer<TProvider>>,
  ): this;

  /** Appends one local multi-binding in registration order. */
  registerMulti<T, const TClass extends InjectableClass<NonPromise<T>>>(
    token: Token<T>,
    provider: MetadataClassProvider<NoInfer<T>, TClass>,
  ): this;
  registerMulti<
    T,
    const TDependencies extends DependencyTuple,
    const TClass extends InjectableClass<NonPromise<NoInfer<T>>> &
      (new (
        ...dependencies: DependencyValues<TDependencies>
      ) => NonPromise<NoInfer<T>>),
  >(
    token: Token<T>,
    provider: ProviderWithInject<
      CheckedClassProvider<NoInfer<T>, TDependencies, TClass>,
      TDependencies
    >,
  ): this;
  registerMulti<T, const TValue extends T>(
    token: Token<T>,
    provider: CheckedValueProvider<NoInfer<T>, TValue>,
  ): this;
  registerMulti<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  registerMulti<
    T,
    const TFactory extends () => NonPromise<NoInfer<T>>,
  >(
    token: Token<T>,
    provider: CheckedFactoryProvider<NoInfer<T>, readonly [], TFactory>,
  ): this;
  registerMulti<
    T,
    const TDependencies extends DependencyTuple,
    const TFactory extends (
      ...dependencies: DependencyValues<TDependencies>
    ) => NonPromise<NoInfer<T>>,
  >(
    token: Token<T>,
    provider: ProviderWithInject<
      CheckedFactoryProvider<NoInfer<T>, TDependencies, TFactory>,
      TDependencies
    >,
  ): this;
  registerMulti<T>(
    token: Token<T>,
    provider: AsyncFactoryProvider<NoInfer<T>, readonly []>,
  ): this;
  registerMulti<
    T,
    const TDependencies extends DependencyTuple,
    const TFactory extends (
      ...dependencies: DependencyValues<TDependencies>
    ) => PromiseLike<NonPromise<NoInfer<T>>>,
  >(
    token: Token<T>,
    provider: ProviderWithInject<
      CheckedAsyncFactoryProvider<NoInfer<T>, TDependencies, TFactory>,
      TDependencies
    >,
  ): this;
  registerMulti<T, TDefined extends T>(
    token: Token<T>,
    provider: DefinedProvider<TDefined> & NonPromiseMatch<TDefined>,
  ): this;
  registerMulti<T, const TProvider extends Provider<NoInfer<T>>>(
    token: Token<T>,
    provider: TProvider & ProviderMatchesDeclaration<NoInfer<TProvider>>,
  ): this;
}

/** A synchronous, atomically staged group of registrations. */
export type RegistrationModule = (
  registry: RegistrationRegistry,
) => undefined;

/** Constructs a service class with an explicit or class-owned dependency tuple. */
export interface ClassProvider<
  T,
  TDependencies extends readonly Dependency<any>[] = readonly Dependency<any>[],
> {
  readonly useClass: (new (
    ...dependencies: DependencyValues<NoInfer<TDependencies>>
  ) => NonPromise<T>) & {
    readonly inject?: readonly Dependency<any>[];
  };
  readonly scope?: Scope;
  readonly inject?: TDependencies;
  readonly onActivation?: ActivationHook<T>;
  readonly onDisposal?: DisposalHook<T>;
  readonly onDisposalAsync?: AsyncDisposalHook<T>;
  readonly useValue?: never;
  readonly useFactory?: never;
  readonly useFactoryAsync?: never;
  readonly useExisting?: never;
}

export type MetadataClassProvider<
  T,
  TClass extends InjectableClass<NonPromise<T>> = InjectableClass<
    NonPromise<T>
  >,
> = Omit<ClassProvider<T, readonly []>, "useClass" | "inject"> & {
  readonly useClass: TClass &
    StaticInjectMatchesConstructor<NoInfer<TClass>> &
    NonPromiseMatch<InstanceType<TClass>>;
  readonly inject?: never;
};

/** Registers a borrowed non-Promise value. */
export interface ValueProvider<T> {
  readonly useValue: NonPromise<T>;
  readonly scope?: never;
  readonly inject?: never;
  readonly useClass?: never;
  readonly useFactory?: never;
  readonly useFactoryAsync?: never;
  readonly useExisting?: never;
  readonly onActivation?: never;
  readonly onDisposal?: never;
  readonly onDisposalAsync?: never;
}

/** Creates a service synchronously from an explicit dependency tuple. */
export interface FactoryProvider<
  T,
  TDependencies extends readonly Dependency<any>[] = readonly Dependency<any>[],
> {
  readonly inject?: TDependencies;
  readonly useFactory: (
    ...dependencies: DependencyValues<NoInfer<TDependencies>>
  ) => NonPromise<T>;
  readonly scope?: Scope;
  readonly onActivation?: ActivationHook<T>;
  readonly onDisposal?: DisposalHook<T>;
  readonly onDisposalAsync?: AsyncDisposalHook<T>;
  readonly useClass?: never;
  readonly useValue?: never;
  readonly useFactoryAsync?: never;
  readonly useExisting?: never;
}

/** Creates a service asynchronously from an explicit dependency tuple. */
export interface AsyncFactoryProvider<
  T,
  TDependencies extends readonly Dependency<any>[] = readonly Dependency<any>[],
> {
  readonly inject?: TDependencies;
  readonly useFactoryAsync: (
    ...dependencies: DependencyValues<NoInfer<TDependencies>>
  ) => PromiseLike<NonPromise<T>>;
  readonly scope?: Scope;
  readonly onActivation?: ActivationHook<T>;
  readonly onDisposal?: DisposalHook<T>;
  readonly onDisposalAsync?: AsyncDisposalHook<T>;
  readonly useClass?: never;
  readonly useValue?: never;
  readonly useFactory?: never;
  readonly useExisting?: never;
}

/** Aliases another token without taking separate ownership. */
export interface ExistingProvider<T> {
  readonly useExisting: Token<T>;
  readonly scope?: never;
  readonly inject?: never;
  readonly useClass?: never;
  readonly useValue?: never;
  readonly useFactory?: never;
  readonly useFactoryAsync?: never;
  readonly onActivation?: never;
  readonly onDisposal?: never;
  readonly onDisposalAsync?: never;
}

/** Union of every provider registration form for service `T`. */
export type Provider<T> =
  | ClassProvider<T>
  | MetadataClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | AsyncFactoryProvider<T>
  | ExistingProvider<T>;

/** An opaque, dependency-checked provider definition safe to store and reuse. */
export interface DefinedProvider<T> {
  readonly [definedProviderType]: (value: T) => T;
}

export type DependencyTuple = readonly Dependency<any>[];

export type ProviderWithInject<
  TProvider,
  TDependencies extends DependencyTuple,
> = TProvider & { readonly inject: TDependencies };

export type Defined<TProvider, T> = TProvider & DefinedProvider<T>;

export type CheckedValueProvider<T, TValue extends T> = Omit<
  ValueProvider<T>,
  "useValue"
> & {
  readonly useValue: TValue;
} & NonPromiseMatch<TValue>;

export type CheckedClassProvider<
  T,
  TDependencies extends readonly Dependency<any>[],
  TClass extends InjectableClass<NonPromise<T>>,
> = Omit<ClassProvider<T, TDependencies>, "useClass"> & {
  readonly useClass: TClass;
} & ConstructorDependenciesMatch<TClass, TDependencies> &
  NonPromiseMatch<InstanceType<TClass>>;

export type CheckedFactoryProvider<
  T,
  TDependencies extends readonly Dependency<any>[],
  TFactory extends (...dependencies: any[]) => NonPromise<T>,
> = Omit<FactoryProvider<T, TDependencies>, "useFactory"> & {
  readonly useFactory: TFactory;
} & FactoryDependenciesMatch<TFactory, TDependencies> &
  NonPromiseMatch<ReturnType<TFactory>>;

export type CheckedAsyncFactoryProvider<
  T,
  TDependencies extends readonly Dependency<any>[],
  TFactory extends (...dependencies: any[]) => PromiseLike<NonPromise<T>>,
> = Omit<AsyncFactoryProvider<T, TDependencies>, "useFactoryAsync"> & {
  readonly useFactoryAsync: TFactory;
} & FactoryDependenciesMatch<TFactory, TDependencies>;

export interface ProviderBuilder<T> {
  <
    const TDependencies extends DependencyTuple,
    const TClass extends InjectableClass<NonPromise<T>> &
      (new (
        ...dependencies: DependencyValues<TDependencies>
      ) => NonPromise<T>),
  >(
    provider: ProviderWithInject<
      CheckedClassProvider<T, TDependencies, TClass>,
      TDependencies
    >,
  ): Defined<
    ProviderWithInject<
      CheckedClassProvider<T, TDependencies, TClass>,
      TDependencies
    >,
    T
  >;
  <
    const TDependencies extends DependencyTuple,
    const TFactory extends (
      ...dependencies: DependencyValues<TDependencies>
    ) => NonPromise<T>,
  >(
    provider: ProviderWithInject<
      CheckedFactoryProvider<T, TDependencies, TFactory>,
      TDependencies
    >,
  ): Defined<
    ProviderWithInject<
      CheckedFactoryProvider<T, TDependencies, TFactory>,
      TDependencies
    >,
    T
  >;
  <
    const TDependencies extends DependencyTuple,
    const TFactory extends (
      ...dependencies: DependencyValues<TDependencies>
    ) => PromiseLike<NonPromise<T>>,
  >(
    provider: ProviderWithInject<
      CheckedAsyncFactoryProvider<T, TDependencies, TFactory>,
      TDependencies
    >,
  ): Defined<
    ProviderWithInject<
      CheckedAsyncFactoryProvider<T, TDependencies, TFactory>,
      TDependencies
    >,
    T
  >;
}


export type AnyToken = Token<any>;
export type AnyDependency = Dependency<any>;
