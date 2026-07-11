// @ts-self-types="./container.d.ts"

import { AsyncLocalStorage } from "node:async_hooks";

import {
  assertToken,
  isResolverDependency,
  isTokenDependencyDescriptor,
} from "./dependencies.js";
import {
  enterPath,
  providerFailure,
  providerOrResolutionFailure,
  rebasePendingError,
  registrationError,
  resolutionError,
  tokenName,
} from "./errors.js";
import {
  isPromiseLike,
  normalizeProvider,
  providerScope,
} from "./providers.js";
import type {
  AnyProviderInput,
  NormalizedProvider,
} from "./providers.js";
import {
  RUNTIME_DEPENDENCY_HAS,
  RUNTIME_DEPENDENCY_HAS_OWN,
  RUNTIME_DEPENDENCY_RESOLVE,
  RUNTIME_DEPENDENCY_RESOLVE_CHAINED,
  captorConstraints,
  clearRuntimeDependencyParent,
  consumeRejectedPromise,
  createConstruction,
  createResolutionSession,
  createRuntimeCollector,
  inspectGraph,
  mergeRuntimeDependencies,
  nextLifetimeCaptor,
  providerPromiseLike,
  recordDynamicDependency,
  resolutionContext,
  strongerCaptor,
  validateGraph,
  waitForConstruction,
  waitForConstructionStart,
} from "./resolution.js";
import type {
  CacheEntry,
  Construction,
  ContainerFamily,
  GraphAccess,
  LifetimeCaptor,
  Registration,
  ResolutionContext,
  ResolutionSession,
  RuntimeDependencies,
} from "./resolution.js";
import { dependencyDescriptorType } from "./types.js";
import type {
  AnyDependency,
  AnyToken,
  AsyncFactoryProvider,
  ClassProvider,
  DefinedProvider,
  DependencyGraph,
  ExistingProvider,
  FactoryProvider,
  InjectableClass,
  Lazy,
  MetadataClassProvider,
  MultiResolutionOptions,
  NormalizedDependency,
  NonPromise,
  Provider,
  ProviderMatchesDeclaration,
  RegistrationModule,
  RegistrationQueryOptions,
  RegistrationRegistry,
  Resolver,
  StaticInjectMatchesConstructor,
  Token,
  ValidationOptions,
  ValueProvider,
} from "./types.js";

interface BindingSet {
  readonly mode: "single" | "multi";
  readonly bindings: Registration[];
}

interface OwnedResource {
  readonly value: unknown;
  readonly dispose: unknown;
  readonly disposeAsync: unknown;
  readonly disposeIsHook: boolean;
  readonly disposeAsyncIsHook: boolean;
}

type LifecycleState = "active" | "disposing-async" | "disposed";

interface DisposalOperation {
  readonly owned: Set<Container>;
  readonly waits: Set<DisposalOperation>;
  readonly nodeWaits: Map<Container, Set<Container>>;
  readonly errors: unknown[];
  readonly tasks: Map<Container, Promise<void>>;
  readonly promise: Promise<void>;
}

interface DisposalExecutionContext {
  readonly operation: DisposalOperation;
  readonly path: readonly Container[];
}

interface SyncDisposalOperation {
  readonly owned: Set<Container>;
  readonly stack: Container[];
  readonly done: Set<Container>;
  readonly errors: unknown[];
}

const disposalContext = new AsyncLocalStorage<DisposalExecutionContext>();

/** Registration and ownership domain that may inherit from a parent container. */
export class Container implements Disposable, AsyncDisposable {
  static readonly #graphAccess: GraphAccess = {
    lookup: (container, token) => container.#lookup(token),
    lookupSets: (container, token, chained) =>
      container.#lookupSets(token, chained),
    lookupOne: (container, token, path) => container.#lookupOne(token, path),
    isAncestorOf: (ancestor, container) => ancestor.#isAncestorOf(container),
  };

  readonly #registrations = new Map<AnyToken, BindingSet>();
  readonly #singletonCache = new Map<Registration, CacheEntry>();
  readonly #scopedCache = new Map<Registration, CacheEntry>();
  readonly #validatedSync = new Set<AnyToken>();
  readonly #validatedAsync = new Set<AnyToken>();
  readonly #validatedAllSync = new Set<AnyToken>();
  readonly #validatedAllAsync = new Set<AnyToken>();
  readonly #validatedChainedAllSync = new Set<AnyToken>();
  readonly #validatedChainedAllAsync = new Set<AnyToken>();
  readonly #children = new Set<Container>();
  readonly #owned: OwnedResource[] = [];
  readonly #ownedValues = new WeakSet<object>();
  readonly #inFlight = new Set<Promise<unknown>>();
  #parent: Container | undefined;
  #family: ContainerFamily = { mutating: false };
  #activeResolutions = 0;
  #lifecycle: LifecycleState = "active";
  #disposePromise: Promise<void> | undefined;
  #disposalOperation: DisposalOperation | undefined;
  #syncDisposalOperation: SyncDisposalOperation | undefined;

  /** Adds one local single binding and returns this container. */
  register<const TClass extends InjectableClass<any>>(
    service: TClass & StaticInjectMatchesConstructor<NoInfer<TClass>>,
  ): this;
  register<T, const TClass extends InjectableClass<NonPromise<T>>>(
    token: Token<T>,
    provider: MetadataClassProvider<NoInfer<T>, TClass>,
  ): this;
  register<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  register<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  register<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  register<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: FactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  register<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  register<T>(token: Token<T>, provider: DefinedProvider<NoInfer<T>>): this;
  register<T, const TProvider extends Provider<NoInfer<T>>>(
    token: Token<T>,
    provider: TProvider & ProviderMatchesDeclaration<NoInfer<TProvider>>,
  ): this;
  register(token: AnyToken, provider?: AnyProviderInput): this {
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

  /** Appends one local multi-binding in registration order. */
  registerMulti<T, const TClass extends InjectableClass<NonPromise<T>>>(
    token: Token<T>,
    provider: MetadataClassProvider<NoInfer<T>, TClass>,
  ): this;
  registerMulti<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  registerMulti<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  registerMulti<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  registerMulti<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: FactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  registerMulti<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  registerMulti<T>(
    token: Token<T>,
    provider: DefinedProvider<NoInfer<T>>,
  ): this;
  registerMulti<T, const TProvider extends Provider<NoInfer<T>>>(
    token: Token<T>,
    provider: TProvider & ProviderMatchesDeclaration<NoInfer<TProvider>>,
  ): this;
  registerMulti(token: AnyToken, provider: AnyProviderInput): this {
    this.#assertMutable("register providers", token);
    assertToken(token);
    return this.#runMutation(() =>
      this.#addRegistration(token, provider, "multi"),
    );
  }

  /** Replaces an existing local binding set with one single binding. */
  rebind<const TClass extends InjectableClass<any>>(
    service: TClass & StaticInjectMatchesConstructor<NoInfer<TClass>>,
  ): this;
  rebind<T, const TClass extends InjectableClass<NonPromise<T>>>(
    token: Token<T>,
    provider: MetadataClassProvider<NoInfer<T>, TClass>,
  ): this;
  rebind<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: ClassProvider<NoInfer<T>, TDependencies>,
  ): this;
  rebind<T>(token: Token<T>, provider: ValueProvider<NoInfer<T>>): this;
  rebind<T>(token: Token<T>, provider: ExistingProvider<NoInfer<T>>): this;
  rebind<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: FactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  rebind<
    T,
    const TDependencies extends readonly AnyDependency[],
  >(
    token: Token<T>,
    provider: AsyncFactoryProvider<NoInfer<T>, TDependencies>,
  ): this;
  rebind<T>(token: Token<T>, provider: DefinedProvider<NoInfer<T>>): this;
  rebind<T, const TProvider extends Provider<NoInfer<T>>>(
    token: Token<T>,
    provider: TProvider & ProviderMatchesDeclaration<NoInfer<TProvider>>,
  ): this;
  rebind(token: AnyToken, provider?: AnyProviderInput): this {
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
      this.#invalidateForToken(token, true, true);
      return this;
    });
  }

  /** Removes the complete local binding set and reports whether it existed. */
  unregister<T>(token: Token<T>): boolean {
    this.#assertMutable("unregister providers", token);
    assertToken(token);
    return this.#runMutation(() => {
      if (!this.#registrations.delete(token)) return false;
      this.#invalidateForToken(token, true, true);
      return true;
    });
  }

  /** Atomically stages and commits synchronous registration modules. */
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
        if (result !== undefined) {
          throw registrationError(
            "INVALID_MODULE",
            "Registration modules must return undefined.",
          );
        }
      }
      if (staging.#registrations.size === 0) return this;

      const previousLocalTokens = new Set(this.#registrations.keys());
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
        this.#invalidateForToken(
          token,
          false,
          previousLocalTokens.has(token),
        );
      }
      return this;
    });
  }

  /** Creates a child container inheriting this container's registrations. */
  createScope(): Container {
    this.#assertMutable("create a scope", undefined, true);
    return this.#runMutation(() => {
      const child = new Container();
      child.#parent = this;
      child.#family = this.#family;
      this.#children.add(child);
      return child;
    });
  }

  /** Resolves one provider synchronously after eager-graph preflight. */
  resolve<T>(token: Token<T>): T {
    return this.#resolvePublicSync(token);
  }

  /** Returns `undefined` when absent; otherwise resolves synchronously. */
  resolveOptional<T>(token: Token<T>): T | undefined {
    return this.#resolvePublicSync(token, undefined, true);
  }

  #resolvePublicSync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
  ): T;
  #resolvePublicSync<T>(
    token: Token<T>,
    capturedCaptor: LifetimeCaptor | undefined,
    optional: true,
  ): T | undefined;
  #resolvePublicSync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
    optional = false,
  ): T | undefined {
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
      if (optional && !this.#lookup(token)) return undefined;
      if (captors.length === 0) {
        if (!this.#validatedSync.has(token)) {
          this.#validateGraph(token, true, false, undefined, ancestry);
        }
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

  /** Resolves one sync or async provider and coalesces cached construction. */
  resolveAsync<T>(token: Token<T>): Promise<T> {
    return this.#resolvePublicAsync(token);
  }

  /** Returns `undefined` when absent; otherwise resolves asynchronously. */
  resolveOptionalAsync<T>(token: Token<T>): Promise<T | undefined> {
    return this.#resolvePublicAsync(token, undefined, true);
  }

  #resolvePublicAsync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
  ): Promise<T>;
  #resolvePublicAsync<T>(
    token: Token<T>,
    capturedCaptor: LifetimeCaptor | undefined,
    optional: true,
  ): Promise<T | undefined>;
  #resolvePublicAsync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
    optional = false,
  ): Promise<T | undefined> {
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
      this.#resolveAsyncPublic(
        token,
        captor,
        captors,
        context?.collector,
        optional,
      ),
    );
  }

  async #resolveAsyncPublic<T>(
    token: Token<T>,
    captor?: LifetimeCaptor,
    captors: readonly LifetimeCaptor[] = captor ? [captor] : [],
    collector?: RuntimeDependencies,
    optional = false,
  ): Promise<T | undefined> {
    const context = this.#activeContext();
    const session = context?.session ?? createResolutionSession();
    const ancestry = context?.path ?? [];
    const locked = this.#beginResolution();
    try {
      if (optional && !this.#lookup(token)) return undefined;
      if (captors.length === 0) {
        if (!this.#validatedAsync.has(token)) {
          this.#validateGraph(token, false, false, undefined, ancestry);
        }
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

  /** Resolves the selected complete binding sets synchronously. */
  resolveAll<T>(
    token: Token<T>,
    options: MultiResolutionOptions = {},
  ): readonly T[] {
    return this.#resolveAllPublicSync(token, undefined, options);
  }

  #resolveAllPublicSync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
    options: MultiResolutionOptions = {},
  ): readonly T[] {
    assertToken(token);
    this.#assertCanResolve(token);
    const chained = options.chained === true;
    const context = this.#activeContext();
    this.#assertDynamicLookup(context, token);
    recordDynamicDependency(
      context?.collector,
      this,
      token,
      chained
        ? RUNTIME_DEPENDENCY_RESOLVE | RUNTIME_DEPENDENCY_RESOLVE_CHAINED
        : RUNTIME_DEPENDENCY_RESOLVE,
    );
    const captor = strongerCaptor(context?.captor, capturedCaptor);
    const captors = captorConstraints(context?.captor, capturedCaptor);
    const session = context?.session ?? createResolutionSession();
    const ancestry = context?.path ?? [];
    const locked = this.#beginResolution();
    try {
      if (captors.length === 0) {
        const validated = chained
          ? this.#validatedChainedAllSync
          : this.#validatedAllSync;
        if (!validated.has(token)) {
          this.#validateGraph(token, true, true, undefined, ancestry, chained);
        }
      } else {
        for (const constraint of captors) {
          this.#validateGraph(token, true, true, constraint, ancestry, chained);
        }
      }
      return this.#resolveAllSync(
        token,
        ancestry,
        session,
        captor,
        context?.collector,
        chained,
      );
    } finally {
      this.#endResolution(locked);
    }
  }

  /** Resolves the selected complete binding sets asynchronously. */
  resolveAllAsync<T>(
    token: Token<T>,
    options: MultiResolutionOptions = {},
  ): Promise<readonly T[]> {
    return this.#resolveAllPublicAsync(token, undefined, options);
  }

  #resolveAllPublicAsync<T>(
    token: Token<T>,
    capturedCaptor?: LifetimeCaptor,
    options: MultiResolutionOptions = {},
  ): Promise<readonly T[]> {
    let context: ResolutionContext | undefined;
    let chained: boolean;
    try {
      assertToken(token);
      this.#assertCanResolve(token);
      context = this.#activeContext();
      this.#assertDynamicLookup(context, token);
      chained = options.chained === true;
    } catch (error) {
      return Promise.reject(error);
    }

    recordDynamicDependency(
      context?.collector,
      this,
      token,
      chained
        ? RUNTIME_DEPENDENCY_RESOLVE | RUNTIME_DEPENDENCY_RESOLVE_CHAINED
        : RUNTIME_DEPENDENCY_RESOLVE,
    );
    const captor = strongerCaptor(context?.captor, capturedCaptor);
    const captors = captorConstraints(context?.captor, capturedCaptor);
    return this.#trackInFlight(
      this.#resolveAllAsyncPublic(
        token,
        captor,
        captors,
        context?.collector,
        chained,
      ),
    );
  }

  async #resolveAllAsyncPublic<T>(
    token: Token<T>,
    captor?: LifetimeCaptor,
    captors: readonly LifetimeCaptor[] = captor ? [captor] : [],
    collector?: RuntimeDependencies,
    chained = false,
  ): Promise<readonly T[]> {
    const context = this.#activeContext();
    const session = context?.session ?? createResolutionSession();
    const ancestry = context?.path ?? [];
    const locked = this.#beginResolution();
    try {
      if (captors.length === 0) {
        const validated = chained
          ? this.#validatedChainedAllAsync
          : this.#validatedAllAsync;
        if (!validated.has(token)) {
          this.#validateGraph(token, false, true, undefined, ancestry, chained);
        }
      } else {
        for (const constraint of captors) {
          this.#validateGraph(token, false, true, constraint, ancestry, chained);
        }
      }
      return await this.#resolveAllAsync(
        token,
        ancestry,
        session,
        captor,
        collector,
        chained,
      );
    } finally {
      this.#endResolution(locked);
    }
  }

  /** Tests visible or own registration availability without construction. */
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
    recordDynamicDependency(
      context?.collector,
      this,
      token,
      options.own === true
        ? RUNTIME_DEPENDENCY_HAS_OWN
        : RUNTIME_DEPENDENCY_HAS,
    );
    return options.own === true
      ? this.#registrations.has(token)
      : this.#lookup(token) !== undefined;
  }

  /** Preflights a graph without constructing providers. */
  validate<T>(token: Token<T>, options: ValidationOptions = {}): void {
    assertToken(token);
    this.#assertCanResolve(token);
    if (options.chained === true && options.all !== true) {
      throw new TypeError("`chained` requires `all: true` in validate().");
    }
    this.#validateGraph(
      token,
      options.async !== true,
      options.all === true,
      this.#activeContext()?.captor,
      this.#activeContext()?.path ?? [],
      options.chained === true,
    );
  }

  /** Returns a frozen, side-effect-free view of the declared graph. */
  inspect<T>(
    token: Token<T>,
    options: MultiResolutionOptions = {},
  ): DependencyGraph {
    assertToken(token);
    this.#assertCanResolve(token);
    return inspectGraph(
      token,
      this,
      options.chained === true,
      Container.#graphAccess,
    );
  }

  /** Whether disposal has started. */
  get disposed(): boolean {
    return this.#lifecycle !== "active";
  }

  /** Disposes a fully synchronous container tree in ownership order. */
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

  /** Waits for in-flight work and disposes the container tree asynchronously. */
  disposeAsync(): Promise<void> {
    const activeDisposalContext = disposalContext.getStore();
    const activeDisposal = activeDisposalContext?.operation;
    const providerContext = resolutionContext.getStore();
    const providerDisposal =
      providerContext?.active === true
        ? providerContext.container.#disposalOperation
        : undefined;
    if (
      activeDisposal &&
      activeDisposalContext &&
      activeDisposal.owned.has(this)
    ) {
      const current = activeDisposalContext.path.at(-1);
      if (
        current === this ||
        (current !== undefined && this.#isAncestorOf(current))
      ) {
        return Promise.resolve();
      }
      if (activeDisposalContext.path.includes(this)) {
        return Promise.reject(
          new TypeError("Circular disposal within one container tree."),
        );
      }
      if (!current) return this.#disposeAsyncNode(activeDisposal);
      return waitForDisposalNode(
        activeDisposal,
        current,
        this,
        () => this.#disposeAsyncNode(activeDisposal),
      );
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
      nodeWaits: new Map(),
      errors: [],
      tasks: new Map(),
      promise,
    };
    const foreign = new Set<DisposalOperation>();
    this.#freezeAsyncTree(operation, foreign);

    const cleanup = disposalContext.run({ operation, path: [] }, async () => {
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

  /** Delegates explicit resource management to `dispose()`. */
  [Symbol.dispose](): void {
    this.dispose();
  }

  /** Delegates async explicit resource management to `disposeAsync()`. */
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
    chained = false,
  ): void {
    const validated = all
      ? chained
        ? synchronous
          ? this.#validatedChainedAllSync
          : this.#validatedChainedAllAsync
        : synchronous
          ? this.#validatedAllSync
          : this.#validatedAllAsync
      : synchronous
        ? this.#validatedSync
        : this.#validatedAsync;
    const cacheable = initialCaptor === undefined;
    if (cacheable && validated.has(root)) return;
    const validatedAsync = synchronous
      ? all
        ? chained
          ? this.#validatedChainedAllAsync
          : this.#validatedAllAsync
        : this.#validatedAsync
      : undefined;
    validateGraph({
      root,
      lookup: this,
      synchronous,
      all,
      initialCaptor,
      prefix,
      chained,
      access: Container.#graphAccess,
    });
    if (cacheable) validated.add(root);
    if (cacheable) validatedAsync?.add(root);
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

    if (providerPromiseLike(instance, path)) {
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
      activation.#throwActivationFailure(
        provider,
        token,
        instance,
        path,
        cause,
      );
    }
    try {
      activation.#trackOwned(provider, token, instance);
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
    if (cache) clearRuntimeDependencyParent(collector);
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
    const waitingConstruction = this.#activeContext()?.construction;
    if (!cache) {
      return waitForConstructionStart(
        waitingConstruction,
        construction,
        () =>
          activation.#createOwnedAsync(
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
          }),
      );
    }

    return waitForConstructionStart(
      waitingConstruction,
      construction,
      () => {
        let entry!: CacheEntry;
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
            clearRuntimeDependencyParent(collector);
            if (
              cache.get(registration) === entry &&
              entry.state === "pending"
            ) {
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
      },
    );
  }

  #resolveDependencySync(
    dependency: NormalizedDependency,
    path: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): unknown {
    if (isResolverDependency(dependency)) {
      return this.#createResolver(captor);
    }
    if (!isTokenDependencyDescriptor(dependency)) {
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
        dependency.chained,
      );
    }
    return this.#createLazyResolver(dependency.token, captor);
  }

  async #resolveDependencyAsync(
    dependency: NormalizedDependency,
    path: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
  ): Promise<unknown> {
    if (isResolverDependency(dependency)) {
      return this.#createResolver(captor);
    }
    if (!isTokenDependencyDescriptor(dependency)) {
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
        dependency.chained,
      );
    }
    return this.#createLazyResolver(dependency.token, captor);
  }

  #createResolver(captor?: LifetimeCaptor): Resolver {
    return Object.freeze({
      has: <T>(
        target: Token<T>,
        options?: RegistrationQueryOptions,
      ) => {
        assertToken(target);
        this.#assertCanResolve(target);
        return this.has(target, options);
      },
      resolve: <T>(target: Token<T>) => this.#resolvePublicSync(target, captor),
      resolveOptional: <T>(target: Token<T>) =>
        this.#resolvePublicSync(target, captor, true),
      resolveAsync: <T>(target: Token<T>) =>
        this.#resolvePublicAsync(target, captor),
      resolveOptionalAsync: <T>(target: Token<T>) =>
        this.#resolvePublicAsync(target, captor, true),
      resolveAll: <T>(
        target: Token<T>,
        options?: MultiResolutionOptions,
      ) => this.#resolveAllPublicSync(target, captor, options),
      resolveAllAsync: <T>(
        target: Token<T>,
        options?: MultiResolutionOptions,
      ) => this.#resolveAllPublicAsync(target, captor, options),
    });
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
    chained = false,
  ): readonly T[] {
    const path = enterPath(token, ancestry);
    const values: T[] = [];
    for (const bindings of this.#lookupSets(token, chained)) {
      for (const registration of bindings.bindings) {
        values.push(
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
    }
    return values;
  }

  async #resolveAllAsync<T>(
    token: Token<T>,
    ancestry: readonly AnyToken[],
    session: ResolutionSession,
    captor?: LifetimeCaptor,
    collector?: RuntimeDependencies,
    chained = false,
  ): Promise<readonly T[]> {
    const path = enterPath(token, ancestry);
    const values: T[] = [];
    for (const bindings of this.#lookupSets(token, chained)) {
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
      if (providerPromiseLike(instance, path)) {
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
      if (providerPromiseLike(instance, path)) {
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

  #createOwnedAsync(
    provider: NormalizedProvider,
    path: readonly AnyToken[],
    session: ResolutionSession,
    construction: Construction,
    captor?: LifetimeCaptor,
    collector: RuntimeDependencies = new Map(),
  ): Promise<unknown> {
    return this.#runAsyncProvider(
      path,
      session,
      construction,
      captor,
      collector,
      async () => {
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
          this.#throwActivationFailure(
            provider,
            token,
            instance,
            path,
            cause,
          );
        }
        try {
          this.#trackOwned(provider, token, instance);
        } catch (cause) {
          throw providerFailure(path, cause);
        }
        return instance;
      },
    );
  }

  #throwActivationFailure(
    provider: NormalizedProvider,
    token: AnyToken,
    value: unknown,
    path: readonly AnyToken[],
    cause: unknown,
  ): never {
    try {
      this.#trackOwned(provider, token, value);
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
    if (result !== undefined) {
      throw new TypeError("onActivation must return undefined.");
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
    provider: AnyProviderInput | undefined,
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
    this.#invalidateForToken(token, false, existing !== undefined);
    return this;
  }

  #lookup(token: AnyToken): BindingSet | undefined {
    for (let current: Container | undefined = this; current; current = current.#parent) {
      const bindings = current.#registrations.get(token);
      if (bindings) return bindings;
    }
    return undefined;
  }

  #lookupSets(token: AnyToken, chained: boolean): readonly BindingSet[] {
    if (!chained) {
      const bindings = this.#lookup(token);
      return bindings ? [bindings] : [];
    }
    const sets: BindingSet[] = [];
    for (let current: Container | undefined = this; current; current = current.#parent) {
      const bindings = current.#registrations.get(token);
      if (bindings) sets.push(bindings);
    }
    return sets;
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

  #invalidateForToken(
    token: AnyToken,
    retireOwnBindings: boolean,
    previousLocalAvailable: boolean,
  ): void {
    const mutationOwner = this;
    const inheritedAvailable = this.#parent
      ? this.#parent.#lookup(token) !== undefined
      : false;
    const currentLocalAvailable = this.#registrations.has(token);
    const availabilityChanged =
      (previousLocalAvailable || inheritedAvailable) !==
      (currentLocalAvailable || inheritedAvailable);
    const ownAvailabilityChanged =
      previousLocalAvailable !== currentLocalAvailable;
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
              availabilityChanged,
              ownAvailabilityChanged,
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
    availabilityChanged: boolean,
    ownAvailabilityChanged: boolean,
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
      registration.owner === mutationOwner
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
      if (
        isResolverDependency(dependency) ||
        isTokenDependencyDescriptor(dependency, "lazy")
      ) {
        continue;
      }
      const dependencyToken = isTokenDependencyDescriptor(dependency)
        ? dependency.token
        : dependency;
      const chainedDependency =
        isTokenDependencyDescriptor(dependency, "all") &&
        dependency.chained;
      if (
        dependencyToken === token &&
        (chainedDependency
          ? mutationOwner.#isAncestorOf(effectiveLookup)
          : mutationOwner.#mutationVisibleFrom(effectiveLookup, token))
      ) {
        return true;
      }
      for (const bindings of effectiveLookup.#lookupSets(
        dependencyToken,
        chainedDependency,
      )) {
        for (const dependencyRegistration of bindings.bindings) {
          if (
            this.#registrationAffectedBy(
              dependencyRegistration,
              effectiveLookup,
              token,
              mutationOwner,
              retireOwnBindings,
              availabilityChanged,
              ownAvailabilityChanged,
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
    }
    for (const [dynamicLookup, dependencies] of runtimeDependencies ?? []) {
      for (const [dependencyToken, modes] of dependencies) {
        const mutationVisible = mutationOwner.#mutationVisibleFrom(
          dynamicLookup,
          token,
        );
        const chainedResolve =
          (modes & RUNTIME_DEPENDENCY_RESOLVE_CHAINED) !== 0;
        if (dependencyToken === token) {
          if (
            (modes & RUNTIME_DEPENDENCY_RESOLVE) !== 0 &&
            (chainedResolve
              ? mutationOwner.#isAncestorOf(dynamicLookup)
              : mutationVisible)
          ) {
            return true;
          }
          if (
            (modes & RUNTIME_DEPENDENCY_HAS) !== 0 &&
            availabilityChanged &&
            mutationVisible
          ) {
            return true;
          }
          if (
            (modes & RUNTIME_DEPENDENCY_HAS_OWN) !== 0 &&
            ownAvailabilityChanged &&
            mutationOwner === dynamicLookup
          ) {
            return true;
          }
        }
        if ((modes & RUNTIME_DEPENDENCY_RESOLVE) === 0) continue;
        for (const bindings of dynamicLookup.#lookupSets(
          dependencyToken,
          chainedResolve,
        )) {
          for (const dependencyRegistration of bindings.bindings) {
            if (
              this.#registrationAffectedBy(
                dependencyRegistration,
                dynamicLookup,
                token,
                mutationOwner,
                retireOwnBindings,
                availabilityChanged,
                ownAvailabilityChanged,
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
    this.#validatedChainedAllSync.clear();
    this.#validatedChainedAllAsync.clear();
  }

  #trackInFlight<T>(operation: Promise<T>): Promise<T> {
    this.#inFlight.add(operation);
    void operation.then(
      () => this.#inFlight.delete(operation),
      () => this.#inFlight.delete(operation),
    );
    return operation;
  }

  #trackOwned(
    provider: NormalizedProvider,
    token: AnyToken,
    value: unknown,
  ): void {
    const resource =
      value !== null &&
      (typeof value === "object" || typeof value === "function")
        ? (value as object)
        : undefined;
    if (resource && this.#ownedValues.has(resource)) return;

    const onDisposal =
      provider.kind === "value" || provider.kind === "existing"
        ? undefined
        : provider.onDisposal;
    const onDisposalAsync =
      provider.kind === "value" || provider.kind === "existing"
        ? undefined
        : provider.onDisposalAsync;
    let dispose: unknown;
    let disposeAsync: unknown;
    const explicit = onDisposal !== undefined || onDisposalAsync !== undefined;
    if (explicit) {
      const context = Object.freeze({ container: this, token });
      dispose = onDisposal
        ? () => onDisposal(value, context)
        : undefined;
      disposeAsync = onDisposalAsync
        ? () => onDisposalAsync(value, context)
        : undefined;
    } else {
      if (!resource) return;
      dispose = Reflect.get(resource, Symbol.dispose);
      disposeAsync = Reflect.get(resource, Symbol.asyncDispose);
    }
    if (
      (dispose !== undefined && dispose !== null) ||
      (disposeAsync !== undefined && disposeAsync !== null)
    ) {
      if (resource) this.#ownedValues.add(resource);
      this.#owned.push({
        value,
        dispose,
        disposeAsync,
        disposeIsHook: onDisposal !== undefined,
        disposeAsyncIsHook: onDisposalAsync !== undefined,
      });
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
          if (isPromiseLike(result)) {
            consumeRejectedPromise(result);
            if (resource.disposeIsHook) {
              throw new TypeError("onDisposal must be synchronous.");
            }
          } else if (resource.disposeIsHook && result !== undefined) {
            throw new TypeError("onDisposal must return undefined.");
          }
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
    const activeContext = disposalContext.getStore();
    const path =
      activeContext?.operation === operation ? activeContext.path : [];
    const task = disposalContext.run(
      { operation, path: [...path, this] },
      () => this.#runDisposeAsyncNode(operation),
    );
    operation.tasks.set(this, task);
    return task;
  }

  async #runDisposeAsyncNode(operation: DisposalOperation): Promise<void> {
    const children = [...this.#children];
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
          const result = disposeAsync.call(resource.value);
          if (resource.disposeAsyncIsHook && !isPromiseLike(result)) {
            throw new TypeError(
              "onDisposalAsync must return a Promise-like value.",
            );
          }
          const outcome = await result;
          if (resource.disposeAsyncIsHook && outcome !== undefined) {
            throw new TypeError("onDisposalAsync must resolve to undefined.");
          }
        } else {
          const dispose = checkedDisposalMethod(
            resource.dispose,
            Symbol.dispose,
          );
          const result = dispose?.call(resource.value);
          if (isPromiseLike(result)) {
            if (resource.disposeIsHook) {
              try {
                await result;
              } catch (cause) {
                throw new AggregateError(
                  [
                    new TypeError("onDisposal must be synchronous."),
                    cause,
                  ],
                  "Synchronous disposal callback returned a rejected Promise.",
                );
              }
              throw new TypeError("onDisposal must be synchronous.");
            }
            consumeRejectedPromise(result);
          } else if (resource.disposeIsHook && result !== undefined) {
            throw new TypeError("onDisposal must return undefined.");
          }
        }
      } catch (error) {
        appendDisposalError(operation.errors, error);
      }
    }
    this.#finishDisposal();
  }

  #finishDisposal(): void {
    this.#registrations.clear();
    this.#singletonCache.clear();
    this.#scopedCache.clear();
    this.#clearValidation();
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
    const locked: Container[] = [];
    for (let current: Container | undefined = this; current; current = current.#parent) {
      current.#activeResolutions += 1;
      locked.push(current);
    }
    return locked;
  }

  #endResolution(locked: readonly Container[]): void {
    for (const container of locked) container.#activeResolutions -= 1;
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

  #assertMutable(
    action: string,
    token?: AnyToken,
    allowActiveResolutions = false,
  ): void {
    if (this.#lifecycle !== "active") {
      throw registrationError(
        "CONTAINER_DISPOSED",
        `Cannot ${action} after container disposal has started.`,
        token,
      );
    }
    this.#assertNotBusy(action, allowActiveResolutions);
  }

  #runMutation<T>(operation: () => T): T {
    this.#family.mutating = true;
    try {
      return operation();
    } finally {
      this.#family.mutating = false;
    }
  }

  #assertNotBusy(action: string, allowActiveResolutions = false): void {
    if (
      (allowActiveResolutions || this.#activeResolutions === 0) &&
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

function checkedDisposalMethod(
  value: unknown,
  key: typeof Symbol.dispose | typeof Symbol.asyncDispose,
): ((this: unknown) => unknown) | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "function") {
    throw new TypeError(`${String(key)} must be a function.`);
  }
  return value as (this: unknown) => unknown;
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

function waitForDisposalNode(
  operation: DisposalOperation,
  current: Container,
  target: Container,
  start: () => Promise<void>,
): Promise<void> {
  if (hasDisposalNodePath(operation, target, current, new Set())) {
    return Promise.reject(
      new TypeError("Circular disposal within one container tree."),
    );
  }
  let waits = operation.nodeWaits.get(current);
  if (!waits) {
    waits = new Set();
    operation.nodeWaits.set(current, waits);
  }
  waits.add(target);
  let pending: Promise<void>;
  try {
    pending = start();
  } catch (error) {
    waits.delete(target);
    if (waits.size === 0) operation.nodeWaits.delete(current);
    return Promise.reject(error);
  }
  return pending.finally(() => {
    waits.delete(target);
    if (waits.size === 0) operation.nodeWaits.delete(current);
  });
}

function hasDisposalNodePath(
  operation: DisposalOperation,
  current: Container,
  target: Container,
  visited: Set<Container>,
): boolean {
  if (current === target) return true;
  if (visited.has(current)) return false;
  visited.add(current);
  for (const dependency of operation.nodeWaits.get(current) ?? []) {
    if (hasDisposalNodePath(operation, dependency, target, visited)) return true;
  }
  return false;
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
