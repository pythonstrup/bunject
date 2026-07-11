import { AsyncLocalStorage } from "node:async_hooks";

declare const injectionTokenType: unique symbol;
const dependencyDescriptorType = Symbol("bunject.dependency");

export type Scope = "singleton" | "scoped" | "resolution" | "transient";

export type Constructor<T = unknown> = new (...dependencies: any[]) => T;

export type ClassToken<T = unknown> = abstract new (
  ...dependencies: any[]
) => T;

export type InjectionToken<T> = symbol & {
  readonly [injectionTokenType]: (value: T) => T;
};

export type Token<T> = ClassToken<T> | InjectionToken<T>;

export type NonPromise<T> = T extends PromiseLike<unknown> ? never : T;

export type TokenValue<TToken extends Token<any>> =
  TToken extends ClassToken<infer TValue>
    ? TValue
    : TToken extends InjectionToken<infer TValue>
      ? TValue
      : never;

export interface OptionalDependency<T> {
  readonly [dependencyDescriptorType]: "optional";
  readonly token: Token<T>;
}

export interface AllDependency<T> {
  readonly [dependencyDescriptorType]: "all";
  readonly token: Token<T>;
}

export interface LazyDependency<T> {
  readonly [dependencyDescriptorType]: "lazy";
  readonly token: Token<T>;
}

export interface Lazy<T> {
  resolve(): T;
  resolveAsync(): Promise<T>;
}

export type Dependency<T = any> =
  | Token<T>
  | OptionalDependency<T>
  | AllDependency<T>
  | LazyDependency<T>;

export type DependencyValue<TDependency extends Dependency<any>> =
  TDependency extends OptionalDependency<infer TValue>
    ? TValue | undefined
    : TDependency extends AllDependency<infer TValue>
      ? readonly TValue[]
      : TDependency extends LazyDependency<infer TValue>
        ? Lazy<TValue>
        : TDependency extends Token<any>
          ? TokenValue<TDependency>
          : never;

export type DependencyValues<TDependencies extends readonly Dependency<any>[]> = {
  -readonly [TIndex in keyof TDependencies]: DependencyValue<
    TDependencies[TIndex]
  >;
};

export type TokenValues<TTokens extends readonly Token<any>[]> =
  DependencyValues<TTokens>;

export type InjectableClass<T = unknown> = Constructor<T> & {
  readonly inject?: readonly Dependency<any>[];
};

export interface ServiceOptions {
  readonly scope?: Scope;
  readonly inject?: never;
}

export interface ServiceOptionsWithInject<
  TDependencies extends readonly Dependency<any>[],
> {
  readonly scope?: Scope;
  readonly inject: TDependencies;
}

export interface ValidationOptions {
  readonly async?: boolean;
  readonly all?: boolean;
}

export interface RegistrationQueryOptions {
  readonly own?: boolean;
}

export interface ActivationContext<T> {
  readonly container: Container;
  readonly token: Token<T>;
}

export type ActivationHook<T> = (
  value: T,
  context: ActivationContext<T>,
) => void;

export type ProviderKind =
  | "class"
  | "value"
  | "factory"
  | "asyncFactory"
  | "existing";

export type DependencyKind = "required" | "optional" | "all" | "lazy";

export interface InspectedDependency {
  readonly token: Token<any>;
  readonly kind: DependencyKind;
}

export interface InspectedProvider {
  readonly token: Token<any>;
  readonly binding: number;
  readonly mode: "single" | "multi";
  readonly kind: ProviderKind;
  readonly scope: Scope | undefined;
  readonly owner: Container;
  readonly dependencies: readonly InspectedDependency[];
}

export interface DependencyGraph {
  readonly root: Token<any>;
  readonly providers: readonly InspectedProvider[];
  readonly missing: readonly Token<any>[];
}

export interface RegistrationRegistry {
  register<T>(service: InjectableClass<T>): this;
  register<T, const TDependencies extends readonly Dependency<any>[] = readonly []>(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  register<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  register<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  register<T, const TDependencies extends readonly Dependency<any>[] = readonly []>(
    token: Token<T>,
    provider:
      | FactoryProvider<NoInfer<T>, TDependencies>
      | AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  register<T>(token: Token<T>, provider: Provider<NoInfer<T>>): this;

  registerMulti<
    T,
    const TDependencies extends readonly Dependency<any>[] = readonly [],
  >(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  registerMulti<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  registerMulti<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  registerMulti<
    T,
    const TDependencies extends readonly Dependency<any>[] = readonly [],
  >(
    token: Token<T>,
    provider:
      | FactoryProvider<NoInfer<T>, TDependencies>
      | AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  registerMulti<T>(token: Token<T>, provider: Provider<NoInfer<T>>): this;
}

export type RegistrationModule = (registry: RegistrationRegistry) => void;

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
  readonly useValue?: never;
  readonly useFactory?: never;
  readonly useFactoryAsync?: never;
  readonly useExisting?: never;
}

export interface ValueProvider<T> {
  readonly useValue: NonPromise<T>;
  readonly scope?: never;
  readonly inject?: never;
  readonly useClass?: never;
  readonly useFactory?: never;
  readonly useFactoryAsync?: never;
  readonly useExisting?: never;
  readonly onActivation?: never;
}

export interface FactoryProvider<
  T,
  TDependencies extends readonly Dependency<any>[] = readonly Dependency<any>[],
> {
  readonly inject?: TDependencies;
  readonly useFactory: (
    ...dependencies: DependencyValues<TDependencies>
  ) => NonPromise<T>;
  readonly scope?: Scope;
  readonly onActivation?: ActivationHook<T>;
  readonly useClass?: never;
  readonly useValue?: never;
  readonly useFactoryAsync?: never;
  readonly useExisting?: never;
}

export interface AsyncFactoryProvider<
  T,
  TDependencies extends readonly Dependency<any>[] = readonly Dependency<any>[],
> {
  readonly inject?: TDependencies;
  readonly useFactoryAsync: (
    ...dependencies: DependencyValues<TDependencies>
  ) => PromiseLike<NonPromise<T>>;
  readonly scope?: Scope;
  readonly onActivation?: ActivationHook<T>;
  readonly useClass?: never;
  readonly useValue?: never;
  readonly useFactory?: never;
  readonly useExisting?: never;
}

export interface ExistingProvider<T> {
  readonly useExisting: Token<T>;
  readonly scope?: never;
  readonly inject?: never;
  readonly useClass?: never;
  readonly useValue?: never;
  readonly useFactory?: never;
  readonly useFactoryAsync?: never;
  readonly onActivation?: never;
}

export type Provider<T> =
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | AsyncFactoryProvider<T>
  | ExistingProvider<T>;

export type ResolutionErrorCode =
  | "NOT_FOUND"
  | "MULTIPLE_PROVIDERS"
  | "CIRCULAR"
  | "ASYNC_IN_SYNC"
  | "CAPTIVE_DEPENDENCY"
  | "CONTAINER_BUSY"
  | "DISPOSED"
  | "PROVIDER_FAILED";

export type RegistrationErrorCode =
  | "INVALID_TOKEN"
  | "INVALID_PROVIDER"
  | "INVALID_MODULE"
  | "CONTAINER_BUSY"
  | "CONTAINER_DISPOSED"
  | "BINDING_MODE_CONFLICT"
  | "DUPLICATE_PROVIDER"
  | "NOT_REGISTERED";

type AnyToken = Token<any>;
type AnyDependency = Dependency<any>;
type AnyProvider =
  | ClassProvider<any, readonly AnyDependency[]>
  | ValueProvider<any>
  | FactoryProvider<any, readonly AnyDependency[]>
  | AsyncFactoryProvider<any, readonly AnyDependency[]>
  | ExistingProvider<any>;

type NormalizedProvider =
  | {
      readonly kind: "class";
      readonly useClass: InjectableClass<any>;
      readonly inject: readonly AnyDependency[];
      readonly scope: Scope;
      readonly onActivation: ActivationHook<any> | undefined;
    }
  | {
      readonly kind: "value";
      readonly useValue: unknown;
    }
  | {
      readonly kind: "factory";
      readonly useFactory: (...dependencies: any[]) => unknown;
      readonly inject: readonly AnyDependency[];
      readonly scope: Scope;
      readonly onActivation: ActivationHook<any> | undefined;
    }
  | {
      readonly kind: "asyncFactory";
      readonly useFactoryAsync: (
        ...dependencies: any[]
      ) => PromiseLike<unknown>;
      readonly inject: readonly AnyDependency[];
      readonly scope: Scope;
      readonly onActivation: ActivationHook<any> | undefined;
    }
  | {
      readonly kind: "existing";
      readonly useExisting: AnyToken;
      readonly inject: readonly [AnyToken];
    };

interface Registration {
  readonly token: AnyToken;
  readonly owner: Container;
  readonly provider: NormalizedProvider;
}

interface BindingSet {
  readonly mode: "single" | "multi";
  readonly bindings: Registration[];
}

type CacheEntry =
  | {
      readonly state: "ready";
      readonly value: unknown;
      readonly dynamicDependencies: RuntimeDependencies;
    }
  | {
      readonly state: "pending";
      readonly promise: Promise<unknown>;
      readonly producer: Construction;
      readonly dynamicDependencies: RuntimeDependencies;
    };

interface Construction {
  readonly token: AnyToken;
  readonly path: readonly AnyToken[];
  readonly waits: Map<Construction, number>;
}

type RuntimeDependencies = Map<Container, Set<AnyToken>>;
const runtimeDependencyParents = new WeakMap<
  RuntimeDependencies,
  RuntimeDependencies
>();

interface OwnedResource {
  readonly value: object;
  readonly dispose: unknown;
  readonly disposeAsync: unknown;
}

type LifecycleState = "active" | "disposing-async" | "disposed";

interface DisposalOperation {
  readonly owned: Set<Container>;
  readonly waits: Set<DisposalOperation>;
  readonly errors: unknown[];
  readonly stack: Container[];
  readonly tasks: Map<Container, Promise<void>>;
  readonly promise: Promise<void>;
}

interface SyncDisposalOperation {
  readonly owned: Set<Container>;
  readonly stack: Container[];
  readonly done: Set<Container>;
  readonly errors: unknown[];
}

interface ResolutionSession {
  readonly caches: Map<Container, Map<Registration, CacheEntry>>;
}

interface ContainerFamily {
  activeResolutions: number;
  mutating: boolean;
}

interface LifetimeCaptor {
  readonly token: AnyToken;
  readonly scope: "singleton" | "scoped" | "resolution";
  readonly rank: number;
  readonly domain: Container;
}

interface ServiceMetadata {
  readonly scope: Scope;
  readonly inject: readonly AnyDependency[] | undefined;
}

const serviceOptions = new WeakMap<ClassToken<any>, ServiceMetadata>();

interface ResolutionContext {
  readonly container: Container;
  readonly family: ContainerFamily;
  readonly path: readonly AnyToken[];
  readonly session: ResolutionSession;
  readonly construction: Construction | undefined;
  readonly captor: LifetimeCaptor | undefined;
  readonly collector: RuntimeDependencies;
  active: boolean;
}

const resolutionContext = new AsyncLocalStorage<ResolutionContext>();
const disposalContext = new AsyncLocalStorage<DisposalOperation>();

export function token<T>(description: string): InjectionToken<T> {
  return Symbol(description) as InjectionToken<T>;
}

export function optional<T>(target: Token<T>): OptionalDependency<T> {
  assertToken(target);
  return Object.freeze({
    [dependencyDescriptorType]: "optional" as const,
    token: target,
  });
}

export function all<T>(target: Token<T>): AllDependency<T> {
  assertToken(target);
  return Object.freeze({
    [dependencyDescriptorType]: "all" as const,
    token: target,
  });
}

export function lazy<T>(target: Token<T>): LazyDependency<T> {
  assertToken(target);
  return Object.freeze({
    [dependencyDescriptorType]: "lazy" as const,
    token: target,
  });
}

export function Service<
  const TDependencies extends readonly Dependency<any>[],
>(
  options: ServiceOptionsWithInject<TDependencies>,
): <
  TClass extends new (
    ...dependencies: DependencyValues<NoInfer<TDependencies>>
  ) => any,
>(
  value: TClass,
  context: ClassDecoratorContext<TClass>,
) => void;
export function Service(options?: ServiceOptions): <TClass extends ClassToken<any>>(
  value: TClass,
  context: ClassDecoratorContext<TClass>,
) => void;
export function Service(
  options:
    | ServiceOptions
    | ServiceOptionsWithInject<readonly AnyDependency[]> = {},
) {
  const scope = checkedScope(options.scope, "transient");

  return <TClass extends ClassToken<any>>(
    value: TClass,
    context: ClassDecoratorContext<TClass>,
  ): void => {
    const inject =
      options.inject === undefined
        ? undefined
        : injectionDependencies(options.inject, value);
    context.addInitializer(function () {
      serviceOptions.set(this, { scope, inject });
    });
  };
}

export class ResolutionError extends Error {
  readonly code: ResolutionErrorCode;
  readonly path: readonly AnyToken[];
  readonly cycle: readonly AnyToken[] | undefined;

  constructor(
    code: ResolutionErrorCode,
    message: string,
    path: readonly AnyToken[],
    cause?: unknown,
    cycle?: readonly AnyToken[],
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ResolutionError";
    this.code = code;
    this.path = Object.freeze([...path]);
    this.cycle = cycle ? Object.freeze([...cycle]) : undefined;
  }
}

export class RegistrationError extends TypeError {
  readonly code: RegistrationErrorCode;
  readonly token: AnyToken | undefined;

  constructor(
    code: RegistrationErrorCode,
    message: string,
    token?: AnyToken,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RegistrationError";
    this.code = code;
    this.token = token;
  }
}

export class Container implements Disposable, AsyncDisposable {
  readonly #registrations = new Map<AnyToken, BindingSet>();
  readonly #singletonCache = new Map<Registration, CacheEntry>();
  readonly #scopedCache = new Map<Registration, CacheEntry>();
  readonly #validatedSync = new Set<AnyToken>();
  readonly #validatedAsync = new Set<AnyToken>();
  readonly #validatedAllSync = new Set<AnyToken>();
  readonly #validatedAllAsync = new Set<AnyToken>();
  readonly #children = new Set<Container>();
  readonly #owned: OwnedResource[] = [];
  readonly #inFlight = new Set<Promise<unknown>>();
  #parent: Container | undefined;
  #family: ContainerFamily = { activeResolutions: 0, mutating: false };
  #activeResolutions = 0;
  #lifecycle: LifecycleState = "active";
  #disposePromise: Promise<void> | undefined;
  #disposalOperation: DisposalOperation | undefined;
  #syncDisposalOperation: SyncDisposalOperation | undefined;

  register<T>(service: InjectableClass<T>): this;
  register<T, const TDependencies extends readonly AnyDependency[] = readonly []>(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  register<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  register<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  register<T, const TDependencies extends readonly AnyDependency[] = readonly []>(
    token: Token<T>,
    provider:
      | FactoryProvider<NoInfer<T>, TDependencies>
      | AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  register<T>(token: Token<T>, provider: Provider<NoInfer<T>>): this;
  register(token: AnyToken, provider?: AnyProvider): this {
    this.#assertMutable("register providers", token);
    assertToken(token);

    return this.#runMutation(() => {
      let candidate = provider;
      if (arguments.length === 1) {
        if (typeof token !== "function") {
          throw registrationError(
            "INVALID_PROVIDER",
            `${tokenName(token)} is not a class.`,
            token,
          );
        }
        candidate = { useClass: token as InjectableClass<any> };
      }

      return this.#addRegistration(token, candidate, "single");
    });
  }

  registerMulti<
    T,
    const TDependencies extends readonly AnyDependency[] = readonly [],
  >(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  registerMulti<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  registerMulti<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  registerMulti<
    T,
    const TDependencies extends readonly AnyDependency[] = readonly [],
  >(
    token: Token<T>,
    provider:
      | FactoryProvider<NoInfer<T>, TDependencies>
      | AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  registerMulti<T>(token: Token<T>, provider: Provider<NoInfer<T>>): this;
  registerMulti(token: AnyToken, provider: AnyProvider): this {
    this.#assertMutable("register providers", token);
    assertToken(token);
    return this.#runMutation(() =>
      this.#addRegistration(token, provider, "multi"),
    );
  }

  rebind<T>(service: InjectableClass<T>): this;
  rebind<T, const TDependencies extends readonly AnyDependency[] = readonly []>(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  rebind<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  rebind<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  rebind<T, const TDependencies extends readonly AnyDependency[] = readonly []>(
    token: Token<T>,
    provider:
      | FactoryProvider<NoInfer<T>, TDependencies>
      | AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  rebind<T>(token: Token<T>, provider: Provider<NoInfer<T>>): this;
  rebind(token: AnyToken, provider?: AnyProvider): this {
    this.#assertMutable("rebind providers", token);
    assertToken(token);
    if (!this.#registrations.has(token)) {
      throw registrationError(
        "NOT_REGISTERED",
        `No local provider is registered for ${tokenName(token)}.`,
        token,
      );
    }

    return this.#runMutation(() => {
      let candidate = provider;
      if (arguments.length === 1) {
        if (typeof token !== "function") {
          throw registrationError(
            "INVALID_PROVIDER",
            `${tokenName(token)} is not a class.`,
            token,
          );
        }
        candidate = { useClass: token as InjectableClass<any> };
      }

      const registration: Registration = {
      token,
      owner: this,
      provider: normalizeProvider(candidate, token),
      };
      this.#registrations.set(token, {
        mode: "single",
        bindings: [registration],
      });
      this.#invalidateForToken(token, true);
      return this;
    });
  }

  unregister<T>(token: Token<T>): boolean {
    this.#assertMutable("unregister providers", token);
    assertToken(token);
    return this.#runMutation(() => {
      if (!this.#registrations.delete(token)) return false;
      this.#invalidateForToken(token, true);
      return true;
    });
  }

  load(...modules: readonly RegistrationModule[]): this {
    this.#assertMutable("load modules");
    for (const module of modules) {
      if (typeof module !== "function") {
        throw registrationError(
          "INVALID_MODULE",
          "A registration module must be a function.",
        );
      }
    }

    return this.#runMutation(() => {
      const staging = new Container();
      const register = staging.register.bind(staging) as (
        ...values: any[]
      ) => Container;
      const registerMulti = staging.registerMulti.bind(staging) as (
        ...values: any[]
      ) => Container;
      let registry!: RegistrationRegistry;
      registry = Object.freeze({
        register: (...values: any[]) => {
          register(...values);
          return registry;
        },
        registerMulti: (...values: any[]) => {
          registerMulti(...values);
          return registry;
        },
      }) as RegistrationRegistry;
      for (const module of modules) {
        const result = module(registry);
        if (isPromiseLike(result)) {
          consumeRejectedPromise(result);
          throw registrationError(
            "INVALID_MODULE",
            "Registration modules must be synchronous.",
          );
        }
      }
      if (staging.#registrations.size === 0) return this;

      const planned = new Map<AnyToken, BindingSet>();
      for (const [token, bindings] of this.#registrations) {
        planned.set(token, {
          mode: bindings.mode,
          bindings: [...bindings.bindings],
        });
      }
      for (const [token, additions] of staging.#registrations) {
        const existing = planned.get(token);
        if (existing && existing.mode !== additions.mode) {
          throw registrationError(
            "BINDING_MODE_CONFLICT",
            `Cannot mix single and multi bindings for ${tokenName(token)}.`,
            token,
          );
        }
        if (existing?.mode === "single") {
          throw registrationError(
            "DUPLICATE_PROVIDER",
            `A provider is already registered for ${tokenName(token)}.`,
            token,
          );
        }

        const registrations = additions.bindings.map<Registration>(
          (registration) => ({
            token,
            owner: this,
            provider: registration.provider,
          }),
        );
        if (existing) existing.bindings.push(...registrations);
        else {
          planned.set(token, { mode: additions.mode, bindings: registrations });
        }
      }

      this.#registrations.clear();
      for (const [token, bindings] of planned) {
        this.#registrations.set(token, bindings);
      }
      for (const token of staging.#registrations.keys()) {
        this.#invalidateForToken(token, false);
      }
      return this;
    });
  }

  createScope(): Container {
    this.#assertMutable("create a scope");
    return this.#runMutation(() => {
      const child = new Container();
      child.#parent = this;
      child.#family = this.#family;
      this.#children.add(child);
      return child;
    });
  }

  resolve<T>(token: Token<T>): T {
    return this.#resolvePublicSync(token);
  }

  #resolvePublicSync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
  ): T {
    assertToken(token);
    this.#assertCanResolve(token);
    const context = this.#activeContext();
    this.#assertDynamicLookup(context, token);
    recordDynamicDependency(context?.collector, this, token);
    const captor = strongerCaptor(context?.captor, capturedCaptor);
    const captors = captorConstraints(context?.captor, capturedCaptor);
    const session = context?.session ?? createResolutionSession();
    const ancestry = context?.path ?? [];
    const locked = this.#beginResolution();
    try {
      if (captors.length === 0) {
        this.#validateGraph(token, true, false, undefined, ancestry);
      }
      else {
        for (const constraint of captors) {
          this.#validateGraph(token, true, false, constraint, ancestry);
        }
      }
      return this.#resolveSync(
        token,
        ancestry,
        session,
        captor,
        context?.collector,
      );
    } finally {
      this.#endResolution(locked);
    }
  }

  resolveAsync<T>(token: Token<T>): Promise<T> {
    return this.#resolvePublicAsync(token);
  }

  #resolvePublicAsync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
  ): Promise<T> {
    let context: ResolutionContext | undefined;
    try {
      assertToken(token);
      this.#assertCanResolve(token);
      context = this.#activeContext();
      this.#assertDynamicLookup(context, token);
    } catch (error) {
      return Promise.reject(error);
    }

    recordDynamicDependency(context?.collector, this, token);
    const captor = strongerCaptor(context?.captor, capturedCaptor);
    const captors = captorConstraints(context?.captor, capturedCaptor);
    return this.#trackInFlight(
      this.#resolveAsyncPublic(token, captor, captors, context?.collector),
    );
  }

  async #resolveAsyncPublic<T>(
    token: Token<T>,
    captor?: LifetimeCaptor,
    captors: readonly LifetimeCaptor[] = captor ? [captor] : [],
    collector?: RuntimeDependencies,
  ): Promise<T> {
    const context = this.#activeContext();
    const session = context?.session ?? createResolutionSession();
    const ancestry = context?.path ?? [];
    const locked = this.#beginResolution();
    try {
      if (captors.length === 0) {
        this.#validateGraph(token, false, false, undefined, ancestry);
      }
      else {
        for (const constraint of captors) {
          this.#validateGraph(token, false, false, constraint, ancestry);
        }
      }
      return await this.#resolveAsync(
        token,
        ancestry,
        session,
        captor,
        collector,
      );
    } finally {
      this.#endResolution(locked);
    }
  }

  resolveAll<T>(token: Token<T>): readonly T[] {
    assertToken(token);
    this.#assertCanResolve(token);
    const context = this.#activeContext();
    this.#assertDynamicLookup(context, token);
    recordDynamicDependency(context?.collector, this, token);
    const captor = context?.captor;
    const session = context?.session ?? createResolutionSession();
    const ancestry = context?.path ?? [];
    const locked = this.#beginResolution();
    try {
      this.#validateGraph(token, true, true, captor, ancestry);
      const bindings = this.#lookup(token);
      if (!bindings) return [];
      const path = enterPath(token, ancestry);
      return bindings.bindings.map((registration) =>
        this.#resolveRegistrationSync(
          token,
          registration,
          path,
          session,
          captor,
          context?.collector,
        ),
      );
    } finally {
      this.#endResolution(locked);
    }
  }

  resolveAllAsync<T>(token: Token<T>): Promise<readonly T[]> {
    try {
      assertToken(token);
      this.#assertCanResolve(token);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#trackInFlight(this.#resolveAllAsyncPublic(token));
  }

  async #resolveAllAsyncPublic<T>(token: Token<T>): Promise<readonly T[]> {
    const context = this.#activeContext();
    this.#assertDynamicLookup(context, token);
    recordDynamicDependency(context?.collector, this, token);
    const captor = context?.captor;
    const session = context?.session ?? createResolutionSession();
    const ancestry = context?.path ?? [];
    const locked = this.#beginResolution();
    try {
      this.#validateGraph(token, false, true, captor, ancestry);
      const bindings = this.#lookup(token);
      if (!bindings) return [];
      const path = enterPath(token, ancestry);
      const values: T[] = [];
      for (const registration of bindings.bindings) {
        values.push(
          await this.#resolveRegistrationAsync(
            token,
            registration,
            path,
            session,
            captor,
            context?.collector,
          ),
        );
      }
      return values;
    } finally {
      this.#endResolution(locked);
    }
  }

  has<T>(token: Token<T>, options: RegistrationQueryOptions = {}): boolean {
    assertToken(token);
    const context = this.#activeContext();
    this.#assertDynamicLookup(context, token);
    if (context?.captor && !this.#isAncestorOf(context.captor.domain)) {
      throw resolutionError(
        "CAPTIVE_DEPENDENCY",
        `${tokenName(context.captor.token)} (${context.captor.scope}) cannot ` +
          `query a descendant container for ${tokenName(token)}.`,
        [...context.path, token],
      );
    }
    recordDynamicDependency(context?.collector, this, token);
    return options.own === true
      ? this.#registrations.has(token)
      : this.#lookup(token) !== undefined;
  }

  validate<T>(token: Token<T>, options: ValidationOptions = {}): void {
    assertToken(token);
    this.#assertCanResolve(token);
    this.#validateGraph(
      token,
      options.async !== true,
      options.all === true,
      this.#activeContext()?.captor,
      this.#activeContext()?.path ?? [],
    );
  }

  inspect<T>(token: Token<T>): DependencyGraph {
    assertToken(token);
    this.#assertCanResolve(token);

    const providers: InspectedProvider[] = [];
    const missing = new Set<AnyToken>();
    const visited = new Map<Container, Set<Registration>>();
    const visit = (
      target: AnyToken,
      lookup: Container,
      emptyIsMissing: boolean,
    ): void => {
      const bindings = lookup.#lookup(target);
      if (!bindings) {
        if (emptyIsMissing) missing.add(target);
        return;
      }

      for (const [binding, registration] of bindings.bindings.entries()) {
        const scope = providerScope(registration.provider);
        const effectiveLookup =
          scope === "singleton" ? registration.owner : lookup;
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
                (dependency) =>
                  Object.freeze({
                    token: isDependencyDescriptor(dependency)
                      ? dependency.token
                      : dependency,
                    kind: dependencyKind(dependency),
                  }),
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
          if (dependency.kind === "lazy") continue;
          visit(
            dependency.token,
            effectiveLookup,
            dependency.kind === "required",
          );
        }
      }
    };

    visit(token, this, true);
    return Object.freeze({
      root: token,
      providers: Object.freeze(providers),
      missing: Object.freeze([...missing]),
    });
  }

  get disposed(): boolean {
    return this.#lifecycle !== "active";
  }

  dispose(): void {
    if (this.#family.mutating) {
      throw new TypeError("Cannot dispose a container during registration mutation.");
    }
    if (this.#lifecycle === "disposed") {
      const operation = this.#syncDisposalOperation;
      if (!operation || operation.done.has(this)) return;
      const current = operation.stack.at(-1);
      if (
        current === this ||
        (current !== undefined && this.#isAncestorOf(current))
      ) {
        return;
      }
      if (operation.stack.includes(this)) {
        throw new TypeError("Circular disposal within one container tree.");
      }
      this.#disposeSyncNode(operation);
      return;
    }
    if (this.#lifecycle === "disposing-async") {
      throw new TypeError("Async disposal is already in progress.");
    }

    this.#assertSyncDisposableTree();
    const operation: SyncDisposalOperation = {
      owned: new Set(),
      stack: [],
      done: new Set(),
      errors: [],
    };
    this.#markSyncDisposedTree(operation);
    this.#disposeSyncNode(operation);
    if (operation.errors.length > 0) {
      throw new AggregateError(
        operation.errors,
        "Container disposal failed.",
      );
    }
  }

  disposeAsync(): Promise<void> {
    const activeDisposal = disposalContext.getStore();
    const providerContext = resolutionContext.getStore();
    const providerDisposal =
      providerContext?.active === true
        ? providerContext.container.#disposalOperation
        : undefined;
    if (activeDisposal?.owned.has(this)) {
      const current = activeDisposal.stack.at(-1);
      if (
        current === this ||
        (current !== undefined && this.#isAncestorOf(current))
      ) {
        return Promise.resolve();
      }
      if (activeDisposal.stack.includes(this)) {
        return Promise.reject(
          new TypeError("Circular disposal within one container tree."),
        );
      }
      return this.#disposeAsyncNode(activeDisposal);
    }
    if (this.#lifecycle === "disposed") return Promise.resolve();
    if (this.#family.mutating) {
      return Promise.reject(
        new TypeError("Cannot dispose a container during registration mutation."),
      );
    }
    if (activeDisposal) {
      for (const container of activeDisposal.owned) {
        if (this.#isAncestorOf(container)) {
          return Promise.reject(
            new TypeError(
              "A disposer cannot start disposal of an owning ancestor.",
            ),
          );
        }
      }
    }
    if (this.#activeContext()) {
      return Promise.reject(
        new TypeError("A provider cannot dispose its active container."),
      );
    }
    if (this.#lifecycle === "disposing-async") {
      const target = this.#disposalOperation;
      const waiter = activeDisposal ?? providerDisposal;
      if (waiter && target) {
        if (waiter === target) {
          return Promise.reject(
            new TypeError("A provider cannot await its own container disposal."),
          );
        }
        return waitForDisposal(waiter, target);
      }
      return target?.promise ?? this.#disposePromise ?? Promise.resolve();
    }

    let resolveDisposal!: () => void;
    let rejectDisposal!: (reason: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveDisposal = resolve;
      rejectDisposal = reject;
    });
    const operation: DisposalOperation = {
      owned: new Set(),
      waits: new Set(),
      errors: [],
      stack: [],
      tasks: new Map(),
      promise,
    };
    const foreign = new Set<DisposalOperation>();
    this.#freezeAsyncTree(operation, foreign);

    const cleanup = disposalContext.run(operation, async () => {
      await this.#waitForInFlight(operation.owned);
      for (const pending of foreign) {
        try {
          await waitForDisposal(operation, pending);
        } catch (error) {
          appendDisposalError(operation.errors, error);
        }
      }
      await this.#disposeAsyncNode(operation);
      if (operation.errors.length > 0) {
        throw new AggregateError(
          operation.errors,
          "Container disposal failed.",
        );
      }
    });
    void cleanup.then(resolveDisposal, rejectDisposal);

    const waiter = activeDisposal ?? providerDisposal;
    return waiter
      ? waitForDisposal(waiter, operation)
      : promise;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.disposeAsync();
  }

  #activeContext(): ResolutionContext | undefined {
    const context = resolutionContext.getStore();
    return context?.active && context.family === this.#family ? context : undefined;
  }

  #validateGraph(
    root: AnyToken,
    synchronous: boolean,
    all = false,
    initialCaptor?: LifetimeCaptor,
    prefix: readonly AnyToken[] = [],
  ): void {
    const validated = all
      ? synchronous
        ? this.#validatedAllSync
        : this.#validatedAllAsync
      : synchronous
        ? this.#validatedSync
        : this.#validatedAsync;
    const cacheable = initialCaptor === undefined;
    if (cacheable && validated.has(root)) return;
    if (initialCaptor && !this.#isAncestorOf(initialCaptor.domain)) {
      throw resolutionError(
        "CAPTIVE_DEPENDENCY",
        `${tokenName(initialCaptor.token)} (${initialCaptor.scope}) cannot ` +
          `resolve through a descendant container.`,
        [...prefix, root],
      );
    }

    interface Frame {
      readonly token: AnyToken;
      readonly registration: Registration;
      readonly lookup: Container;
    }
    type VisitStates = Map<Container, Map<Registration, Set<string>>>;
    const states: VisitStates = new Map();
    const stack: Frame[] = [];
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
      lookup: Container,
      registration: Registration,
      captor?: LifetimeCaptor,
    ): boolean =>
      source.get(lookup)?.get(registration)?.has(captorKey(captor)) === true;
    const markVisited = (
      source: VisitStates,
      lookup: Container,
      registration: Registration,
      captor?: LifetimeCaptor,
    ): void => {
      let registrations = source.get(lookup);
      if (!registrations) {
        registrations = new Map();
        source.set(lookup, registrations);
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
      lookup: Container,
      captor: LifetimeCaptor,
      path: readonly AnyToken[],
      visited: VisitStates,
    ): void => {
      const bindings = lookup.#lookup(token);
      if (!bindings) return;
      for (const registration of bindings.bindings) {
        const scope = providerScope(registration.provider);
        const effectiveLookup =
          scope === "singleton" ? registration.owner : lookup;
        if (wasVisited(visited, effectiveLookup, registration, captor)) continue;
        markVisited(visited, effectiveLookup, registration, captor);

        let nextCaptor = captor;
        if (
          scope === "transient" &&
          !effectiveLookup.#isAncestorOf(captor.domain)
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
          if (rank < captor.rank || !domain.#isAncestorOf(captor.domain)) {
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
          const dependencyToken = isDependencyDescriptor(dependency)
            ? dependency.token
            : dependency;
          if (!effectiveLookup.#lookup(dependencyToken)) continue;
          validateLazyLifetime(
            dependencyToken,
            effectiveLookup,
            nextCaptor,
            [...path, dependencyToken],
            visited,
          );
        }
      }
    };

    const visitRegistration = (
      token: AnyToken,
      registration: Registration,
      lookup: Container,
      path: readonly AnyToken[],
      captor?: LifetimeCaptor,
    ): void => {
      const scope = providerScope(registration.provider);
      const effectiveLookup = scope === "singleton" ? registration.owner : lookup;
      const cycleStart = stack.findIndex(
        (frame) =>
          frame.registration === registration && frame.lookup === effectiveLookup,
      );
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
        !effectiveLookup.#isAncestorOf(captor.domain)
      ) {
        throw resolutionError(
          "CAPTIVE_DEPENDENCY",
          `${tokenName(token)} (transient) cannot be captured by ` +
            `${tokenName(captor.token)} (${captor.scope}).`,
          path,
        );
      }
      if (scope && scope !== "transient") {
        const domain = scope === "singleton" ? registration.owner : effectiveLookup;
        const rank = lifetimeRank(scope);
        if (
          captor &&
          (rank < captor.rank || !domain.#isAncestorOf(captor.domain))
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

      stack.push({ token, registration, lookup: effectiveLookup });
      if (provider.kind !== "value") {
        for (const dependency of provider.inject) {
          const dependencyToken = isDependencyDescriptor(dependency)
            ? dependency.token
            : dependency;
          if (isDependencyDescriptor(dependency, "lazy")) {
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
            isDependencyDescriptor(dependency, "optional") &&
            !effectiveLookup.#lookup(dependencyToken)
          ) {
            continue;
          }
          visit(
            dependencyToken,
            effectiveLookup,
            nextCaptor,
            isDependencyDescriptor(dependency, "all"),
          );
        }
      }
      stack.pop();
      markVisited(states, effectiveLookup, registration, captor);
    };

    const visit = (
      token: AnyToken,
      lookup: Container,
      captor?: LifetimeCaptor,
      allBindings = false,
    ): void => {
      const path = [
        ...prefix,
        ...stack.map((frame) => frame.token),
        token,
      ];
      const bindings = lookup.#lookup(token);
      if (!bindings) {
        if (allBindings) return;
        throw resolutionError(
          "NOT_FOUND",
          `Provider not found for ${tokenName(token)}.`,
          path,
        );
      }

      const registrations = allBindings
        ? bindings.bindings
        : [lookup.#lookupOne(token, path)!];
      for (const registration of registrations) {
        visitRegistration(token, registration, lookup, path, captor);
      }
    };

    visit(root, this, initialCaptor, all);
    if (cacheable) validated.add(root);
    if (cacheable && synchronous) {
      (all ? this.#validatedAllAsync : this.#validatedAsync).add(root);
    }
  }

  #resolveSync<T>(
    token: Token<T>,
    ancestry: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): T {
    const path = enterPath(token, ancestry);
    const registration = this.#lookupOne(token, path);
    if (!registration) {
      throw resolutionError(
        "NOT_FOUND",
        `Provider not found for ${tokenName(token)}.`,
        path,
      );
    }
    return this.#resolveRegistrationSync(
      token,
      registration,
      path,
      session,
      captor,
      collector,
    );
  }

  #resolveRegistrationSync<T>(
    token: Token<T>,
    registration: Registration,
    path: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    parentCollector?: RuntimeDependencies,
  ): T {
    const provider = registration.provider;

    if (provider.kind === "asyncFactory") {
      throw resolutionError(
        "ASYNC_IN_SYNC",
        `Async provider ${tokenName(token)} cannot be resolved with resolve(). ` +
          "Use resolveAsync() instead.",
        path,
      );
    }

    if (provider.kind === "value") {
      return provider.useValue as T;
    }

    if (provider.kind === "existing") {
      return this.#resolveSync(
        provider.useExisting,
        path,
        session,
        captor,
        parentCollector,
      ) as T;
    }

    const cache = this.#cacheFor(registration, session);
    const cached = cache?.get(registration);
    if (cached?.state === "ready") {
      if (parentCollector) {
        mergeRuntimeDependencies(
          parentCollector,
          cached.dynamicDependencies,
        );
      }
      return cached.value as T;
    }
    if (cached?.state === "pending") {
      throw resolutionError(
        "ASYNC_IN_SYNC",
        `${tokenName(token)} is currently resolving asynchronously. ` +
          "Await resolveAsync() before using resolve().",
        path,
      );
    }

    const activation = provider.scope === "singleton" ? registration.owner : this;
    const collector = createRuntimeCollector(parentCollector);
    const nextCaptor = nextLifetimeCaptor(
      token,
      registration,
      this,
      captor,
    );
    const construction = createConstruction(token, path);
    const dependencies = provider.inject.map((dependency) =>
      activation.#resolveDependencySync(
        dependency,
        path,
        session,
        nextCaptor,
        collector,
      ),
    );

    let instance: unknown;
    if (provider.kind === "class") {
      try {
        instance = activation.#runSyncProvider(
          path,
          session,
          construction,
          nextCaptor,
          collector,
          () => new provider.useClass(...dependencies),
        );
      } catch (cause) {
        throw providerOrResolutionFailure(path, cause);
      }
    } else {
      try {
        instance = activation.#runSyncProvider(
          path,
          session,
          construction,
          nextCaptor,
          collector,
          () => provider.useFactory(...dependencies),
        );
      } catch (cause) {
        throw providerOrResolutionFailure(path, cause);
      }
    }

    if (isPromiseLike(instance)) {
      consumeRejectedPromise(instance);
      throw resolutionError(
        "ASYNC_IN_SYNC",
        `${tokenName(token)} returned a Promise from a synchronous provider. ` +
          "Register it with useFactoryAsync and call resolveAsync().",
        path,
      );
    }

    try {
      activation.#runActivationHook(
        provider,
        token,
        instance,
        path,
        session,
        construction,
        nextCaptor,
        collector,
      );
    } catch (cause) {
      activation.#throwActivationFailure(instance, path, cause);
    }
    try {
      activation.#trackOwned(instance);
    } catch (cause) {
      throw providerFailure(path, cause);
    }
    cache?.set(registration, {
      state: "ready",
      value: instance,
      dynamicDependencies: collector,
    });
    if (parentCollector) {
      mergeRuntimeDependencies(parentCollector, collector);
    }
    runtimeDependencyParents.delete(collector);
    return instance as T;
  }

  #resolveAsync<T>(
    token: Token<T>,
    ancestry: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): Promise<T> {
    const path = enterPath(token, ancestry);
    const registration = this.#lookupOne(token, path);
    if (!registration) {
      throw resolutionError(
        "NOT_FOUND",
        `Provider not found for ${tokenName(token)}.`,
        path,
      );
    }
    return this.#resolveRegistrationAsync(
      token,
      registration,
      path,
      session,
      captor,
      collector,
    );
  }

  #resolveRegistrationAsync<T>(
    token: Token<T>,
    registration: Registration,
    path: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    parentCollector?: RuntimeDependencies,
  ): Promise<T> {
    const provider = registration.provider;

    if (provider.kind === "value") {
      return Promise.resolve(provider.useValue as T);
    }

    if (provider.kind === "existing") {
      return this.#resolveAsync(
        provider.useExisting,
        path,
        session,
        captor,
        parentCollector,
      ) as Promise<T>;
    }

    const cache = this.#cacheFor(registration, session);
    const cached = cache?.get(registration);
    if (cached?.state === "ready") {
      if (parentCollector) {
        mergeRuntimeDependencies(
          parentCollector,
          cached.dynamicDependencies,
        );
      }
      return Promise.resolve(cached.value as T);
    }
    if (cached?.state === "pending") {
      const waiting = waitForConstruction(
        this.#activeContext()?.construction,
        cached.producer,
        cached.promise,
      );
      return waiting
        .finally(() => {
          if (parentCollector) {
            mergeRuntimeDependencies(
              parentCollector,
              cached.dynamicDependencies,
            );
          }
        })
        .then((value) => {
          const ready = cache?.get(registration);
          if (ready?.state === "ready" && parentCollector) {
            mergeRuntimeDependencies(
              parentCollector,
              ready.dynamicDependencies,
            );
          }
          return value;
        })
        .catch((error) => {
          throw rebasePendingError(error, token, path);
        }) as Promise<T>;
    }

    const activation = provider.scope === "singleton" ? registration.owner : this;
    const collector = createRuntimeCollector(parentCollector);
    const nextCaptor = nextLifetimeCaptor(
      token,
      registration,
      this,
      captor,
    );
    const construction = createConstruction(token, path);
    if (!cache) {
      return activation.#createOwnedAsync(
        provider,
        path,
        session,
        construction,
        nextCaptor,
        collector,
      ).then((instance) => {
        if (parentCollector) {
          mergeRuntimeDependencies(parentCollector, collector);
        }
        return instance as T;
      }).finally(() => runtimeDependencyParents.delete(collector));
    }

    let entry: CacheEntry;
    const creation = Promise.resolve().then(() =>
      activation.#createOwnedAsync(
        provider,
        path,
        session,
        construction,
        nextCaptor,
        collector,
      ),
    );
    const tracked = creation
      .then((instance) => {
        cache.set(registration, {
          state: "ready",
          value: instance,
          dynamicDependencies: collector,
        });
        if (parentCollector) {
          mergeRuntimeDependencies(parentCollector, collector);
        }
        return instance;
      })
      .finally(() => {
        runtimeDependencyParents.delete(collector);
        if (cache.get(registration) === entry && entry.state === "pending") {
          cache.delete(registration);
        }
      });
    entry = {
      state: "pending",
      promise: tracked,
      producer: construction,
      dynamicDependencies: collector,
    };
    cache.set(registration, entry);
    return tracked as Promise<T>;
  }

  #resolveDependencySync(
    dependency: AnyDependency,
    path: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): unknown {
    if (!isDependencyDescriptor(dependency)) {
      return this.#resolveSync(dependency, path, session, captor, collector);
    }
    if (dependency[dependencyDescriptorType] === "optional") {
      return this.#lookup(dependency.token)
        ? this.#resolveSync(
            dependency.token,
            path,
            session,
            captor,
            collector,
          )
        : undefined;
    }
    if (dependency[dependencyDescriptorType] === "all") {
      return this.#resolveAllSync(
        dependency.token,
        path,
        session,
        captor,
        collector,
      );
    }
    return this.#createLazyResolver(dependency.token, captor);
  }

  async #resolveDependencyAsync(
    dependency: AnyDependency,
    path: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): Promise<unknown> {
    if (!isDependencyDescriptor(dependency)) {
      return this.#resolveAsync(dependency, path, session, captor, collector);
    }
    if (dependency[dependencyDescriptorType] === "optional") {
      return this.#lookup(dependency.token)
        ? this.#resolveAsync(
            dependency.token,
            path,
            session,
            captor,
            collector,
          )
        : undefined;
    }
    if (dependency[dependencyDescriptorType] === "all") {
      return this.#resolveAllAsync(
        dependency.token,
        path,
        session,
        captor,
        collector,
      );
    }
    return this.#createLazyResolver(dependency.token, captor);
  }

  #createLazyResolver<T>(
    target: Token<T>,
    captor?: LifetimeCaptor,
  ): Lazy<T> {
    return Object.freeze({
      resolve: () => this.#resolvePublicSync(target, captor),
      resolveAsync: () => this.#resolvePublicAsync(target, captor),
    });
  }

  #resolveAllSync<T>(
    token: Token<T>,
    ancestry: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): readonly T[] {
    const bindings = this.#lookup(token);
    if (!bindings) return [];
    const path = enterPath(token, ancestry);
    return bindings.bindings.map((registration) =>
      this.#resolveRegistrationSync(
        token,
        registration,
        path,
        session,
        captor,
        collector,
      ),
    );
  }

  async #resolveAllAsync<T>(
    token: Token<T>,
    ancestry: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): Promise<readonly T[]> {
    const bindings = this.#lookup(token);
    if (!bindings) return [];
    const path = enterPath(token, ancestry);
    const values: T[] = [];
    for (const registration of bindings.bindings) {
      values.push(
        await this.#resolveRegistrationAsync(
          token,
          registration,
          path,
          session,
          captor,
          collector,
        ),
      );
    }
    return values;
  }

  async #createAsync(
    provider: NormalizedProvider,
    path: readonly AnyToken[],
    session: ResolutionSession,
    construction: Construction,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): Promise<unknown> {
    if (provider.kind === "value") {
      return provider.useValue;
    }

    if (provider.kind === "existing") {
      return this.#resolveAsync(
        provider.useExisting,
        path,
        session,
        captor,
        collector,
      );
    }

    const dependencies: unknown[] = [];
    for (const dependency of provider.inject) {
      dependencies.push(
        await this.#resolveDependencyAsync(
          dependency,
          path,
          session,
          captor,
          collector,
        ),
      );
    }

    if (provider.kind === "class") {
      let instance: unknown;
      try {
        instance = this.#runSyncProvider(
          path,
          session,
          construction,
          captor,
          collector ?? new Map(),
          () => new provider.useClass(...dependencies),
        );
      } catch (cause) {
        throw providerOrResolutionFailure(path, cause);
      }
      if (isPromiseLike(instance)) {
        consumeRejectedPromise(instance);
        throw providerFailure(
          path,
          new TypeError("A class provider returned a Promise. Use useFactoryAsync."),
        );
      }
      return instance;
    }

    if (provider.kind === "factory") {
      let instance: unknown;
      try {
        instance = this.#runSyncProvider(
          path,
          session,
          construction,
          captor,
          collector ?? new Map(),
          () => provider.useFactory(...dependencies),
        );
      } catch (cause) {
        throw providerOrResolutionFailure(path, cause);
      }
      if (isPromiseLike(instance)) {
        consumeRejectedPromise(instance);
        throw providerFailure(
          path,
          new TypeError("useFactory returned a Promise. Use useFactoryAsync."),
        );
      }
      return instance;
    }

    try {
      return await this.#runAsyncProvider(
        path,
        session,
        construction,
        captor,
        collector ?? new Map(),
        () => provider.useFactoryAsync(...dependencies),
      );
    } catch (cause) {
      throw providerOrResolutionFailure(path, cause);
    }
  }

  async #createOwnedAsync(
    provider: NormalizedProvider,
    path: readonly AnyToken[],
    session: ResolutionSession,
    construction: Construction,
    captor?: LifetimeCaptor,
    collector: RuntimeDependencies = new Map(),
  ): Promise<unknown> {
    const instance = await this.#createAsync(
      provider,
      path,
      session,
      construction,
      captor,
      collector,
    );
    const token = path.at(-1)!;
    try {
      this.#runActivationHook(
        provider,
        token,
        instance,
        path,
        session,
        construction,
        captor,
        collector,
      );
    } catch (cause) {
      this.#throwActivationFailure(instance, path, cause);
    }
    try {
      this.#trackOwned(instance);
    } catch (cause) {
      throw providerFailure(path, cause);
    }
    return instance;
  }

  #throwActivationFailure(
    value: unknown,
    path: readonly AnyToken[],
    cause: unknown,
  ): never {
    try {
      this.#trackOwned(value);
    } catch (ownershipCause) {
      throw providerFailure(
        path,
        new AggregateError(
          [cause, ownershipCause],
          "Activation and resource tracking both failed.",
        ),
      );
    }
    throw providerOrResolutionFailure(path, cause);
  }

  #runActivationHook(
    provider: NormalizedProvider,
    token: AnyToken,
    value: unknown,
    path: readonly AnyToken[],
    session: ResolutionSession,
    construction: Construction,
    captor?: LifetimeCaptor,
    collector: RuntimeDependencies = new Map(),
  ): void {
    if (
      provider.kind === "value" ||
      provider.kind === "existing" ||
      !provider.onActivation
    ) {
      return;
    }
    const context = Object.freeze({ container: this, token });
    const result = this.#runSyncProvider(
      path,
      session,
      construction,
      captor,
      collector,
      () => provider.onActivation!(value, context),
    );
    if (isPromiseLike(result)) {
      consumeRejectedPromise(result);
      throw new TypeError("onActivation must be synchronous.");
    }
  }

  #runSyncProvider<T>(
    path: readonly AnyToken[],
    session: ResolutionSession,
    construction: Construction,
    captor: LifetimeCaptor | undefined,
    collector: RuntimeDependencies,
    operation: () => T,
  ): T {
    const context: ResolutionContext = {
      container: this,
      family: this.#family,
      path,
      session,
      construction,
      captor,
      collector,
      active: true,
    };
    try {
      return resolutionContext.run(context, operation);
    } finally {
      context.active = false;
    }
  }

  #runAsyncProvider<T>(
    path: readonly AnyToken[],
    session: ResolutionSession,
    construction: Construction,
    captor: LifetimeCaptor | undefined,
    collector: RuntimeDependencies,
    operation: () => PromiseLike<T>,
  ): Promise<T> {
    const context: ResolutionContext = {
      container: this,
      family: this.#family,
      path,
      session,
      construction,
      captor,
      collector,
      active: true,
    };
    return resolutionContext.run(context, async () => {
      try {
        return await operation();
      } finally {
        context.active = false;
      }
    });
  }

  #addRegistration(
    token: AnyToken,
    provider: AnyProvider | undefined,
    mode: BindingSet["mode"],
  ): this {
    const existing = this.#registrations.get(token);
    if (existing?.mode !== undefined && existing.mode !== mode) {
      throw registrationError(
        "BINDING_MODE_CONFLICT",
        `Cannot mix single and multi bindings for ${tokenName(token)}.`,
        token,
      );
    }
    if (existing?.mode === "single") {
      throw registrationError(
        "DUPLICATE_PROVIDER",
        `A provider is already registered for ${tokenName(token)}.`,
        token,
      );
    }

    const registration: Registration = {
      token,
      owner: this,
      provider: normalizeProvider(provider, token),
    };
    if (existing) existing.bindings.push(registration);
    else this.#registrations.set(token, { mode, bindings: [registration] });
    this.#invalidateForToken(token, false);
    return this;
  }

  #lookup(token: AnyToken): BindingSet | undefined {
    for (let current: Container | undefined = this; current; current = current.#parent) {
      const bindings = current.#registrations.get(token);
      if (bindings) return bindings;
    }
    return undefined;
  }

  #lookupOne(token: AnyToken, path: readonly AnyToken[]): Registration | undefined {
    const bindings = this.#lookup(token);
    if (!bindings) return undefined;
    if (bindings.bindings.length > 1) {
      throw resolutionError(
        "MULTIPLE_PROVIDERS",
        `Multiple providers are registered for ${tokenName(token)}. ` +
          "Use resolveAll() or resolveAllAsync().",
        path,
      );
    }
    return bindings.bindings[0];
  }

  #cacheFor(
    registration: Registration,
    session: ResolutionSession,
  ): Map<Registration, CacheEntry> | undefined {
    const scope = providerScope(registration.provider);
    if (scope === "singleton") return registration.owner.#singletonCache;
    if (scope === "scoped") return this.#scopedCache;
    if (scope === "resolution") {
      let cache = session.caches.get(this);
      if (!cache) {
        cache = new Map();
        session.caches.set(this, cache);
      }
      return cache;
    }
    return undefined;
  }

  #isAncestorOf(container: Container): boolean {
    for (let current: Container | undefined = container; current; current = current.#parent) {
      if (current === this) return true;
    }
    return false;
  }

  #invalidateForToken(token: AnyToken, retireOwnBindings: boolean): void {
    const mutationOwner = this;
    const visit = (container: Container): void => {
      const invalidate = (cache: Map<Registration, CacheEntry>): void => {
        for (const [registration, entry] of cache) {
          if (
            container.#registrationAffectedBy(
              registration,
              container,
              token,
              mutationOwner,
              retireOwnBindings,
              entry.state === "ready"
                ? entry.dynamicDependencies
                : undefined,
              new Map(),
              true,
            )
          ) {
            cache.delete(registration);
          }
        }
      };
      invalidate(container.#singletonCache);
      invalidate(container.#scopedCache);
      container.#clearValidation();
      for (const child of container.#children) visit(child);
    };
    visit(this);
  }

  #registrationAffectedBy(
    registration: Registration,
    lookup: Container,
    token: AnyToken,
    mutationOwner: Container,
    retireOwnBindings: boolean,
    runtimeDependencies: RuntimeDependencies | undefined,
    visited: Map<Container, Set<Registration>>,
    root: boolean,
  ): boolean {
    const scope = providerScope(registration.provider);
    const effectiveLookup = scope === "singleton" ? registration.owner : lookup;
    if (
      root &&
      retireOwnBindings &&
      registration.token === token &&
      mutationOwner.#mutationVisibleFrom(effectiveLookup, token)
    ) {
      return true;
    }

    let registrations = visited.get(effectiveLookup);
    if (!registrations) {
      registrations = new Set();
      visited.set(effectiveLookup, registrations);
    }
    if (registrations.has(registration)) return false;
    registrations.add(registration);

    if (registration.provider.kind === "value") return false;
    for (const dependency of registration.provider.inject) {
      if (isDependencyDescriptor(dependency, "lazy")) continue;
      const dependencyToken = isDependencyDescriptor(dependency)
        ? dependency.token
        : dependency;
      if (
        dependencyToken === token &&
        mutationOwner.#mutationVisibleFrom(effectiveLookup, token)
      ) {
        return true;
      }
      const bindings = effectiveLookup.#lookup(dependencyToken);
      if (!bindings) continue;
      for (const dependencyRegistration of bindings.bindings) {
        if (
          this.#registrationAffectedBy(
            dependencyRegistration,
            effectiveLookup,
            token,
            mutationOwner,
            retireOwnBindings,
            effectiveLookup.#cachedRuntimeDependencies(
              dependencyRegistration,
              effectiveLookup,
            ),
            visited,
            false,
          )
        ) {
          return true;
        }
      }
    }
    for (const [dynamicLookup, dependencies] of runtimeDependencies ?? []) {
      for (const dependencyToken of dependencies) {
        if (
          dependencyToken === token &&
          mutationOwner.#mutationVisibleFrom(dynamicLookup, token)
        ) {
          return true;
        }
        const bindings = dynamicLookup.#lookup(dependencyToken);
        if (!bindings) continue;
        for (const dependencyRegistration of bindings.bindings) {
          if (
            this.#registrationAffectedBy(
              dependencyRegistration,
              dynamicLookup,
              token,
              mutationOwner,
              retireOwnBindings,
              dynamicLookup.#cachedRuntimeDependencies(
                dependencyRegistration,
                dynamicLookup,
              ),
              visited,
              false,
            )
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  #cachedRuntimeDependencies(
    registration: Registration,
    lookup: Container,
  ): RuntimeDependencies | undefined {
    const scope = providerScope(registration.provider);
    const entry =
      scope === "singleton"
        ? registration.owner.#singletonCache.get(registration)
        : scope === "scoped"
          ? lookup.#scopedCache.get(registration)
          : undefined;
    return entry?.state === "ready" ? entry.dynamicDependencies : undefined;
  }

  #mutationVisibleFrom(lookup: Container, token: AnyToken): boolean {
    if (!this.#isAncestorOf(lookup)) return false;
    for (
      let current: Container | undefined = lookup;
      current && current !== this;
      current = current.#parent
    ) {
      if (current.#registrations.has(token)) return false;
    }
    return true;
  }

  #clearValidation(): void {
    this.#validatedSync.clear();
    this.#validatedAsync.clear();
    this.#validatedAllSync.clear();
    this.#validatedAllAsync.clear();
  }

  #trackInFlight<T>(operation: Promise<T>): Promise<T> {
    this.#inFlight.add(operation);
    void operation.then(
      () => this.#inFlight.delete(operation),
      () => this.#inFlight.delete(operation),
    );
    return operation;
  }

  #trackOwned(value: unknown): void {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    ) {
      return;
    }

    const resource = value as object;
    const dispose: unknown = Reflect.get(resource, Symbol.dispose);
    const disposeAsync: unknown = Reflect.get(resource, Symbol.asyncDispose);
    if (dispose !== undefined && dispose !== null || disposeAsync !== undefined && disposeAsync !== null) {
      this.#owned.push({ value: resource, dispose, disposeAsync });
    }
  }

  #assertSyncDisposableTree(): void {
    if (this.#lifecycle !== "active") {
      throw new TypeError("Async disposal is already in progress.");
    }
    if (
      this.#activeResolutions > 0 ||
      this.#inFlight.size > 0 ||
      hasPendingEntry(this.#singletonCache) ||
      hasPendingEntry(this.#scopedCache)
    ) {
      throw new TypeError(
        "Async disposal is required while resolution is in progress; use disposeAsync().",
      );
    }
    for (const resource of this.#owned) {
      const dispose = checkedDisposalMethod(resource.dispose, Symbol.dispose);
      if (!dispose) {
        const disposeAsync = checkedDisposalMethod(
          resource.disposeAsync,
          Symbol.asyncDispose,
        );
        if (disposeAsync) {
          throw new TypeError(
            "Async disposal is required for an owned resource; use disposeAsync().",
          );
        }
      }
    }
    for (const child of this.#children) child.#assertSyncDisposableTree();
  }

  #markSyncDisposedTree(operation: SyncDisposalOperation): void {
    this.#lifecycle = "disposed";
    this.#syncDisposalOperation = operation;
    operation.owned.add(this);
    for (const child of this.#children) {
      child.#markSyncDisposedTree(operation);
    }
  }

  #disposeSyncNode(operation: SyncDisposalOperation): void {
    if (operation.done.has(this)) return;
    operation.stack.push(this);
    try {
      const children = [...this.#children];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]!;
        if (operation.owned.has(child)) child.#disposeSyncNode(operation);
      }
      while (this.#owned.length > 0) {
        const resource = this.#owned.pop()!;
        try {
          const dispose = checkedDisposalMethod(
            resource.dispose,
            Symbol.dispose,
          );
          const result = dispose?.call(resource.value);
          if (isPromiseLike(result)) consumeRejectedPromise(result);
        } catch (error) {
          appendDisposalError(operation.errors, error);
        }
      }
      operation.done.add(this);
      this.#finishDisposal();
    } finally {
      const index = operation.stack.lastIndexOf(this);
      if (index !== -1) operation.stack.splice(index, 1);
    }
  }

  #freezeAsyncTree(
    operation: DisposalOperation,
    foreign: Set<DisposalOperation>,
  ): void {
    if (this.#lifecycle === "disposed") return;
    if (this.#lifecycle === "disposing-async") {
      if (
        this.#disposalOperation &&
        this.#disposalOperation !== operation
      ) {
        foreign.add(this.#disposalOperation);
      }
      return;
    }

    this.#lifecycle = "disposing-async";
    this.#disposePromise = operation.promise;
    this.#disposalOperation = operation;
    operation.owned.add(this);
    for (const child of this.#children) {
      child.#freezeAsyncTree(operation, foreign);
    }
  }

  async #waitForInFlight(owned: ReadonlySet<Container>): Promise<void> {
    while (true) {
      const pending = new Set<Promise<unknown>>();
      for (const container of owned) {
        for (const operation of container.#inFlight) pending.add(operation);
      }
      if (pending.size === 0) return;
      await Promise.allSettled(pending);
    }
  }

  #disposeAsyncNode(operation: DisposalOperation): Promise<void> {
    const existing = operation.tasks.get(this);
    if (existing) return existing;
    const task = this.#runDisposeAsyncNode(operation);
    operation.tasks.set(this, task);
    return task;
  }

  async #runDisposeAsyncNode(operation: DisposalOperation): Promise<void> {
    operation.stack.push(this);
    const children = [...this.#children];
    try {
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]!;
        if (operation.owned.has(child)) {
          await child.#disposeAsyncNode(operation);
        }
      }

      while (this.#owned.length > 0) {
        const resource = this.#owned.pop()!;
        try {
          const disposeAsync = checkedDisposalMethod(
            resource.disposeAsync,
            Symbol.asyncDispose,
          );
          if (disposeAsync) {
            await disposeAsync.call(resource.value);
          } else {
            const dispose = checkedDisposalMethod(
              resource.dispose,
              Symbol.dispose,
            );
            const result = dispose?.call(resource.value);
            if (isPromiseLike(result)) consumeRejectedPromise(result);
          }
        } catch (error) {
          appendDisposalError(operation.errors, error);
        }
      }
      this.#finishDisposal();
    } finally {
      const index = operation.stack.lastIndexOf(this);
      if (index !== -1) operation.stack.splice(index, 1);
    }
  }

  #finishDisposal(): void {
    this.#registrations.clear();
    this.#singletonCache.clear();
    this.#scopedCache.clear();
    this.#validatedSync.clear();
    this.#validatedAsync.clear();
    this.#validatedAllSync.clear();
    this.#validatedAllAsync.clear();
    this.#owned.length = 0;
    this.#inFlight.clear();
    for (const child of this.#children) {
      if (child.#parent === this) child.#parent = undefined;
    }
    this.#children.clear();
    const parent = this.#parent;
    this.#parent = undefined;
    if (parent) parent.#children.delete(this);
    this.#activeResolutions = 0;
    this.#lifecycle = "disposed";
    this.#disposePromise = undefined;
    this.#disposalOperation = undefined;
    this.#syncDisposalOperation = undefined;
  }

  #beginResolution(): readonly Container[] {
    this.#family.activeResolutions += 1;
    const locked: Container[] = [];
    for (let current: Container | undefined = this; current; current = current.#parent) {
      current.#activeResolutions += 1;
      locked.push(current);
    }
    return locked;
  }

  #endResolution(locked: readonly Container[]): void {
    for (const container of locked) container.#activeResolutions -= 1;
    this.#family.activeResolutions -= 1;
  }

  #assertCanResolve(token: AnyToken): void {
    if (this.#family.mutating) {
      throw resolutionError(
        "CONTAINER_BUSY",
        `Container registration is changing; cannot resolve ${tokenName(token)}.`,
        [token],
      );
    }
    if (this.#lifecycle === "active") return;
    if (this.#lifecycle === "disposing-async" && this.#activeContext()) return;
    throw resolutionError(
      "DISPOSED",
      `Container is disposed; cannot resolve ${tokenName(token)}.`,
      [token],
    );
  }

  #assertDynamicLookup(
    context: ResolutionContext | undefined,
    token: AnyToken,
  ): void {
    if (!context || this.#isAncestorOf(context.container)) return;
    throw resolutionError(
      "CAPTIVE_DEPENDENCY",
      `${tokenName(context.path.at(-1) ?? token)} cannot resolve ` +
        `${tokenName(token)} through a sibling or descendant container.`,
      [...context.path, token],
    );
  }

  #assertMutable(action: string, token?: AnyToken): void {
    if (this.#lifecycle !== "active") {
      throw registrationError(
        "CONTAINER_DISPOSED",
        `Cannot ${action} after container disposal has started.`,
        token,
      );
    }
    this.#assertNotBusy(action);
  }

  #runMutation<T>(operation: () => T): T {
    this.#family.mutating = true;
    try {
      return operation();
    } finally {
      this.#family.mutating = false;
    }
  }

  #assertNotBusy(action: string): void {
    if (
      this.#family.activeResolutions === 0 &&
      !this.#family.mutating
    ) {
      return;
    }
    throw registrationError(
      "CONTAINER_BUSY",
      `Cannot ${action} while the container is resolving a dependency graph.`,
    );
  }
}

function createResolutionSession(): ResolutionSession {
  return { caches: new Map() };
}

function isDependencyDescriptor(
  value: AnyDependency,
  kind?: "optional" | "all" | "lazy",
): value is OptionalDependency<any> | AllDependency<any> | LazyDependency<any> {
  return (
    typeof value === "object" &&
    value !== null &&
    dependencyDescriptorType in value &&
    (kind === undefined || value[dependencyDescriptorType] === kind)
  );
}

function dependencyKind(dependency: AnyDependency): DependencyKind {
  if (!isDependencyDescriptor(dependency)) return "required";
  return dependency[dependencyDescriptorType];
}

function createConstruction(
  token: AnyToken,
  path: readonly AnyToken[],
): Construction {
  return { token, path, waits: new Map() };
}

function recordDynamicDependency(
  dependencies: RuntimeDependencies | undefined,
  lookup: Container,
  token: AnyToken,
): void {
  for (
    let current = dependencies;
    current;
    current = runtimeDependencyParents.get(current)
  ) {
    let tokens = current.get(lookup);
    if (!tokens) {
      tokens = new Set();
      current.set(lookup, tokens);
    }
    tokens.add(token);
  }
}

function createRuntimeCollector(
  parent?: RuntimeDependencies,
): RuntimeDependencies {
  const collector: RuntimeDependencies = new Map();
  if (parent) runtimeDependencyParents.set(collector, parent);
  return collector;
}

function mergeRuntimeDependencies(
  target: RuntimeDependencies,
  source: ReadonlyMap<Container, ReadonlySet<AnyToken>>,
): void {
  for (const [lookup, dependencies] of source) {
    let tokens = target.get(lookup);
    if (!tokens) {
      tokens = new Set();
      target.set(lookup, tokens);
    }
    for (const token of dependencies) tokens.add(token);
  }
}

function waitForConstruction(
  current: Construction | undefined,
  producer: Construction,
  promise: Promise<unknown>,
): Promise<unknown> {
  if (!current) return promise;

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

  current.waits.set(producer, (current.waits.get(producer) ?? 0) + 1);
  return promise.finally(() => {
    const remaining = (current.waits.get(producer) ?? 1) - 1;
    if (remaining === 0) current.waits.delete(producer);
    else current.waits.set(producer, remaining);
  });
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

function providerScope(provider: NormalizedProvider): Scope | undefined {
  if (provider.kind === "value") return "singleton";
  if (provider.kind === "existing") return undefined;
  return provider.scope;
}

function nextLifetimeCaptor(
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

function strongerCaptor(
  first?: LifetimeCaptor,
  second?: LifetimeCaptor,
): LifetimeCaptor | undefined {
  if (!first) return second;
  if (!second) return first;
  return second.rank >= first.rank ? second : first;
}

function captorConstraints(
  first?: LifetimeCaptor,
  second?: LifetimeCaptor,
): readonly LifetimeCaptor[] {
  if (!first) return second ? [second] : [];
  if (!second) return [first];
  if (first.rank === second.rank && first.domain === second.domain) {
    return [second];
  }
  return [first, second];
}

function lifetimeRank(scope: "singleton" | "scoped" | "resolution"): number {
  if (scope === "singleton") return 3;
  if (scope === "scoped") return 2;
  return 1;
}

function normalizeProvider(
  provider: AnyProvider | undefined,
  registeredToken: AnyToken,
): NormalizedProvider {
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
    assertToken(provider.useExisting, registeredToken);
    return {
      kind: "existing",
      useExisting: provider.useExisting,
      inject: [provider.useExisting],
    };
  }

  if ("useValue" in provider) {
    if (isPromiseLike(provider.useValue)) {
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
    if (typeof provider.useClass !== "function") {
      throw registrationError(
        "INVALID_PROVIDER",
        `useClass for ${tokenName(registeredToken)} must be a class.`,
        registeredToken,
      );
    }
    const metadata = inheritedServiceMetadata(provider.useClass);
    return {
      kind: "class",
      useClass: provider.useClass,
      inject: injectionDependencies(
        provider.inject ?? metadata?.inject ?? provider.useClass.inject,
        provider.useClass,
      ),
      scope: checkedScope(
        provider.scope,
        metadata?.scope ?? "transient",
        registeredToken,
      ),
      onActivation: checkedActivationHook(
        provider.onActivation,
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

function inheritedServiceMetadata(
  useClass: InjectableClass<any>,
): ServiceMetadata | undefined {
  let current: object | null = useClass;
  while (typeof current === "function") {
    const options = serviceOptions.get(current as ClassToken<any>);
    if (options) return options;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function injectionDependencies(
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
  for (const dependency of inject) {
    assertDependency(dependency, owner);
  }
  return [...inject];
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

function assertToken(value: unknown, owner?: AnyToken): asserts value is AnyToken {
  if (typeof value !== "function" && typeof value !== "symbol") {
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
  if (typeof value === "function" || typeof value === "symbol") return;
  if (
    typeof value === "object" &&
    value !== null &&
    dependencyDescriptorType in value
  ) {
    const descriptor = value as {
      readonly [dependencyDescriptorType]: unknown;
      readonly token?: unknown;
    };
    if (
      (descriptor[dependencyDescriptorType] === "optional" ||
        descriptor[dependencyDescriptorType] === "all" ||
        descriptor[dependencyDescriptorType] === "lazy") &&
      (typeof descriptor.token === "function" || typeof descriptor.token === "symbol")
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

function enterPath(
  token: AnyToken,
  ancestry: readonly AnyToken[],
): readonly AnyToken[] {
  const cycleStart = ancestry.indexOf(token);
  if (cycleStart !== -1) {
    const cycle = [...ancestry.slice(cycleStart), token];
    throw resolutionError(
      "CIRCULAR",
      `Circular dependency detected: ${formatPath(cycle)}.`,
      [...ancestry, token],
      undefined,
      cycle,
    );
  }
  return [...ancestry, token];
}

function providerFailure(
  path: readonly AnyToken[],
  cause: unknown,
): ResolutionError {
  const current = path[path.length - 1];
  return resolutionError(
    "PROVIDER_FAILED",
    `Provider ${current ? tokenName(current) : "<unknown>"} failed.`,
    path,
    cause,
  );
}

function providerOrResolutionFailure(
  path: readonly AnyToken[],
  cause: unknown,
): ResolutionError {
  return cause instanceof ResolutionError ? cause : providerFailure(path, cause);
}

function rebasePendingError(
  error: unknown,
  sharedToken: AnyToken,
  callerPath: readonly AnyToken[],
): unknown {
  if (
    !(error instanceof ResolutionError) ||
    error.code === "CIRCULAR" ||
    error.code === "ASYNC_IN_SYNC"
  ) {
    return error;
  }

  const sharedIndex = error.path.indexOf(sharedToken);
  if (sharedIndex === -1) {
    return error;
  }

  const path = [...callerPath, ...error.path.slice(sharedIndex + 1)];
  const marker = "\nResolution path:";
  const markerIndex = error.message.lastIndexOf(marker);
  const summary = markerIndex === -1 ? error.message : error.message.slice(0, markerIndex);
  return resolutionError(error.code, summary, path, error.cause);
}

function resolutionError(
  code: ResolutionErrorCode,
  summary: string,
  path: readonly AnyToken[],
  cause?: unknown,
  cycle?: readonly AnyToken[],
): ResolutionError {
  return new ResolutionError(
    code,
    `${summary}\nResolution path: ${formatPath(path)}`,
    path,
    cause,
    cycle,
  );
}

function registrationError(
  code: RegistrationErrorCode,
  message: string,
  token?: AnyToken,
  cause?: unknown,
): RegistrationError {
  return new RegistrationError(code, message, token, cause);
}

function tokenName(value: AnyToken): string {
  return typeof value === "symbol"
    ? value.description || value.toString()
    : value.name || "<anonymous class>";
}

function formatPath(path: readonly AnyToken[]): string {
  return path.map(tokenName).join(" -> ");
}

function checkedDisposalMethod(
  value: unknown,
  key: typeof Symbol.dispose | typeof Symbol.asyncDispose,
): ((this: object) => unknown) | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "function") {
    throw new TypeError(`${String(key)} must be a function.`);
  }
  return value as (this: object) => unknown;
}

function hasPendingEntry(cache: ReadonlyMap<Registration, CacheEntry>): boolean {
  for (const entry of cache.values()) {
    if (entry.state === "pending") return true;
  }
  return false;
}

function appendDisposalError(errors: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) errors.push(nested);
  } else {
    errors.push(error);
  }
}

function waitForDisposal(
  current: DisposalOperation,
  target: DisposalOperation,
): Promise<void> {
  if (current === target) return Promise.resolve();
  if (hasDisposalPath(target, current, new Set())) {
    return Promise.reject(
      new TypeError("Circular container disposal was rejected."),
    );
  }
  current.waits.add(target);
  return target.promise.finally(() => current.waits.delete(target));
}

function hasDisposalPath(
  current: DisposalOperation,
  target: DisposalOperation,
  visited: Set<DisposalOperation>,
): boolean {
  if (current === target) return true;
  if (visited.has(current)) return false;
  visited.add(current);
  for (const dependency of current.waits) {
    if (hasDisposalPath(dependency, target, visited)) return true;
  }
  return false;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function consumeRejectedPromise(value: PromiseLike<unknown>): void {
  void Promise.resolve(value).catch(() => undefined);
}
