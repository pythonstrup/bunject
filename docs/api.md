# Public API reference

This page describes the exports from `bunject`. Start with the
[README](../README.md) for installation and a short example; use this page for
signatures, return values, and runtime boundaries.

```ts
import {
  Container,
  Injectable,
  all,
  defineProvider,
  lazy,
  optional,
  resolver,
  token,
} from "bunject";
```

## Tokens and dependency descriptors

A service token is either a class or a typed symbol created by `token()`.
String tokens are not supported.

| Export | Meaning |
| --- | --- |
| `ClassToken<T>` | An abstract or concrete class whose instances are `T`. |
| `InjectionToken<T>` | A symbol branded with the service type `T`. |
| `Token<T>` | `ClassToken<T> \| InjectionToken<T>`. |
| `token<T>(description)` | Creates a new typed symbol. Each call creates a distinct token. |

```ts
interface Clock {
  now(): Date;
}

const CLOCK = token<Clock>("CLOCK");
```

An `inject` tuple accepts direct tokens and the following frozen descriptors:

| Helper | Injected value | Resolution behavior |
| --- | --- | --- |
| `TOKEN` | `T` | Requires exactly one provider. |
| `optional(TOKEN)` | `T \| undefined` | Absence yields `undefined`; an ambiguous or failing provider still fails. |
| `all(TOKEN)` | `readonly T[]` | Resolves the nearest complete binding set in registration order; returns `[]` when absent. |
| `lazy(TOKEN)` | `Lazy<T>` | Injects frozen `resolve()` and `resolveAsync()` functions and defers target construction and missing-token validation. |
| `resolver()` | `Resolver` | Injects a frozen token-agnostic resolver with single and multi, sync and async methods. |

```ts
interface Lazy<T> {
  readonly resolve: () => T;
  readonly resolveAsync: () => Promise<T>;
}

interface Resolver {
  readonly has: <T>(
    token: Token<T>,
    options?: RegistrationQueryOptions,
  ) => boolean;
  readonly resolve: <T>(token: Token<T>) => T;
  readonly resolveOptional: <T>(token: Token<T>) => T | undefined;
  readonly resolveAsync: <T>(token: Token<T>) => Promise<T>;
  readonly resolveOptionalAsync: <T>(
    token: Token<T>,
  ) => Promise<T | undefined>;
  readonly resolveAll: <T>(token: Token<T>) => readonly T[];
  readonly resolveAllAsync: <T>(token: Token<T>) => Promise<readonly T[]>;
}
```

Lazy handles and injected resolvers are bound to the provider's activation
container and retain its lifetime constraints. Calls made during activation
join that resolution path; deferred calls read the current registry while
preserving the holder's ownership limits.

The exported descriptor types are `OptionalDependency<T>`, `AllDependency<T>`,
`LazyDependency<T>`, and `ResolverDependency`. Their union with `Token<T>` is
`Dependency<T>`.

### Type utilities

| Export | Result |
| --- | --- |
| `Constructor<T>` | A concrete constructor for `T`. |
| `InjectableClass<T>` | A concrete constructor with an optional static `inject` tuple. |
| `NonPromise<T>` | Excludes `PromiseLike` service values. |
| `TokenValue<TToken>` | Gets the service type carried by a token. |
| `DependencyValue<TDependency>` | Gets the injected type for one token or descriptor. |
| `DependencyValues<TDependencies>` | Maps an injection tuple to a mutable constructor/factory parameter tuple. |
| `TokenValues<TTokens>` | `DependencyValues` specialized to a token tuple. |

## `@Injectable()`

`Injectable` is a standard class decorator. It stores class metadata and does
not register the class or touch a global container.

```ts
@Injectable({
  inject: [CLOCK],
  scope: "singleton",
})
class Scheduler {
  constructor(readonly clock: Clock) {}
}

const container = new Container();
container.register(Scheduler);
```

`InjectableOptions` accepts `scope`. `InjectableOptionsWithInject<T>` accepts
both `scope` and an exact dependency tuple. A class provider must explicitly
declare its constructor contract in one of three ways:

```ts
@Injectable({ inject: [CLOCK] })
class DecoratedScheduler {
  constructor(clock: Clock) {}
}

class StaticScheduler {
  static inject = [CLOCK] as const;
  constructor(clock: Clock) {}
}

class UndecoratedScheduler {
  constructor(clock: Clock) {}
}

container.register(SCHEDULER, {
  inject: [CLOCK],
  useClass: UndecoratedScheduler,
});
```

Use `@Injectable()`, `static inject = [] as const`, or provider `inject: []`
even for an undecorated zero-argument class. Provider `inject` takes precedence
over class metadata; an explicit provider `scope` takes precedence over the
decorator scope. Decorator scope metadata may be inherited, but decorator
dependency tuples are not: a subclass with constructor parameters must
redeclare them.

## Providers

`Provider<T>` is the union of five provider forms:

| Type | Required key | Dependency declaration | Ownership |
| --- | --- | --- | --- |
| `ClassProvider<T, D>` | `useClass` | Provider `inject`, decorator metadata, or static `inject` | Created value is owned when it has a disposal protocol or provider disposal hook. |
| `ValueProvider<T>` | `useValue` | None | Borrowed; never disposed by Bunject. Promise-like values are rejected. |
| `FactoryProvider<T, D>` | `useFactory` | Optional `inject`, default `[]` | Returned value follows class/factory ownership rules. A Promise result is rejected by sync resolution. |
| `AsyncFactoryProvider<T, D>` | `useFactoryAsync` | Optional `inject`, default `[]` | Returned value follows class/factory ownership rules and requires async resolution. |
| `ExistingProvider<T>` | `useExisting` | Alias target | Borrowed alias retaining the target identity and lifetime. |

Exactly one provider key must be present. `ValueProvider` and
`ExistingProvider` cannot declare scope or lifecycle hooks.

```ts
container.register(CONFIG, { useValue: config });

container.register(CACHE, {
  inject: [CONFIG],
  scope: "singleton",
  useFactory: (config) => new Cache(config),
});

container.register(DATABASE, {
  scope: "singleton",
  useFactoryAsync: () => Database.connect(),
});

container.register(PRIMARY_DATABASE, { useExisting: DATABASE });
```

### Reusable provider definitions

TypeScript cannot express “a provider with some hidden dependency tuple” as a
plain `Provider<T>` union. Use `defineProvider<T>()` to type-check and then erase
that tuple safely for storage:

```ts
const cacheProvider: DefinedProvider<Cache> = defineProvider<Cache>()({
  inject: [CONFIG],
  scope: "singleton",
  useFactory: (config) => new Cache(config),
});

container.register(CACHE, cacheProvider);
```

The direct `defineProvider({...})` form infers the result type, and both forms
preserve the selected class, sync-factory, or async-factory provider surface.
The helper is an identity function at runtime; its opaque `DefinedProvider<T>`
brand prevents a stored definition from being registered under an incompatible
token. It is for dependency-bearing providers. Values and aliases can use
`Provider<T>` directly.

### Lifetimes

`Scope` is `"singleton" | "scoped" | "resolution" | "transient"`. Class and
factory providers default to `transient`; decorator metadata can change the
default for a class.

| Scope | Cache and activation domain |
| --- | --- |
| `singleton` | One value in the container that owns the registration. Parent singletons use that owner's dependency view. |
| `scoped` | One value per resolving container. |
| `resolution` | One value per top-level dependency graph. |
| `transient` | No cache; the provider runs for each binding resolution. |

Local registrations shadow the nearest parent binding set. Parent scoped,
resolution, and transient providers activate through the resolving child;
parent singletons remain owner-affine. Cached providers cannot capture scoped
or resolution values with shorter lifetimes, or transient values resolved
through a descendant-owned container. Unsafe captures fail with
`CAPTIVE_DEPENDENCY`.

### Activation and disposal hooks

Class, sync-factory, and async-factory providers accept:

| Field | Type | Contract |
| --- | --- | --- |
| `onActivation` | `ActivationHook<T>` | Runs synchronously once after successful creation and before caching; must return `undefined`. |
| `onDisposal` | `DisposalHook<T>` | Synchronous cleanup; must return `undefined`. |
| `onDisposalAsync` | `AsyncDisposalHook<T>` | Async cleanup; must return `PromiseLike<void>`. |

Both hook contexts are frozen and contain the activation/ownership `container`
and registered `token`:

```ts
interface ActivationContext<T> {
  readonly container: Container;
  readonly token: Token<T>;
}

interface DisposalContext<T> {
  readonly container: Container;
  readonly token: Token<T>;
}
```

`ActivationHook<T>`, `DisposalHook<T>`, and `AsyncDisposalHook<T>` are exported
for reusable provider definitions. If either explicit disposal hook is
present, that hook pair replaces the value's `Symbol.dispose` and
`Symbol.asyncDispose` protocol. `disposeAsync()` prefers `onDisposalAsync` and
falls back to `onDisposal`; `dispose()` uses only synchronous cleanup.

## `Container`

`new Container()` takes no options. A root container owns its registrations;
`createScope()` creates a child that inherits lookup through its parent.

### Registration and hierarchy

| Method | Result | Behavior |
| --- | --- | --- |
| `register(service)` | `this` | Adds a single self-binding for an explicitly injectable class. |
| `register(token, provider)` | `this` | Adds one local single binding. A second local single binding is rejected. |
| `registerMulti(token, provider)` | `this` | Appends a local multi-binding in registration order. |
| `rebind(service)` / `rebind(token, provider)` | `this` | Replaces an existing local binding set with one single binding. Fails when the token is not locally registered. |
| `unregister(token)` | `boolean` | Deletes the complete local binding set and reports whether it existed. |
| `load(...modules)` | `this` | Stages synchronous registration modules and commits the complete batch atomically. |
| `createScope()` | `Container` | Creates and attaches a child scope. |

Single and multi modes cannot be mixed for one token in one container. A
child may shadow the complete parent set with its own local set. `rebind()` and
`unregister()` never modify an ancestor.

`RegistrationModule` is a synchronous `(registry: RegistrationRegistry) =>
undefined` callback. Its frozen registry exposes only chainable `register()`
and `registerMulti()` methods:

```ts
const coreModule: RegistrationModule = (registry) => {
  registry
    .register(Config, { inject: [], useClass: Config })
    .register(Logger, { inject: [], useClass: Logger });
};

container.load(coreModule);
```

Provider registration mutation is rejected while the affected container is
resolving a dependency graph or its container family is already mutating.
Changed dependencies invalidate affected caches; retired owned resources stay
valid for existing callers and are cleaned up with their owning scope.
For live reconfiguration, rotate to a freshly built root and dispose the old
root after its callers drain; mutation is not an immediate deactivation API.

### Resolution, queries, and inspection

| Method or property | Result | Notes |
| --- | --- | --- |
| `resolve<T>(token)` | `T` | Validates and resolves one provider synchronously. |
| `resolveOptional<T>(token)` | `T \| undefined` | Absence yields `undefined`; a visible provider resolves normally. |
| `resolveAsync<T>(token)` | `Promise<T>` | Resolves sync or async providers. Concurrent requests coalesce each cached provider. |
| `resolveOptionalAsync<T>(token)` | `Promise<T \| undefined>` | Async optional resolution; registered-provider errors are preserved. |
| `resolveAll<T>(token)` | `readonly T[]` | Resolves the nearest binding set synchronously; absent means `[]`. |
| `resolveAllAsync<T>(token)` | `Promise<readonly T[]>` | Async form of `resolveAll`. |
| `has<T>(token, { own? })` | `boolean` | Searches the visible hierarchy by default; `{ own: true }` checks only local registrations. The injected `Resolver` exposes the same read-only query. |
| `validate<T>(token, { async?, all? })` | `void` | Checks the graph without construction. Defaults to sync/single semantics. |
| `inspect<T>(token)` | `DependencyGraph` | Returns a frozen, construction-free graph description. |
| `disposed` | `boolean` | `true` once sync or async disposal has started. |

`ValidationOptions.async: true` permits async providers. `all: true` validates
every binding in the nearest set and gives absent tokens the same valid-empty
semantics as `resolveAll()`.

`RegistrationQueryOptions` is `{ own?: boolean }`. `ValidationOptions` is
`{ async?: boolean; all?: boolean }`.

Sync validation and resolution reject the complete eager graph before
construction when it contains an async provider. Deferred lazy/resolver targets
are checked when invoked. A synchronous provider that
returns a Promise also fails. Use `useFactoryAsync` and `resolveAsync()` for
that graph. Optional resolution changes only the absent-provider result;
ambiguity, async/sync mismatch, cycles, captive lifetimes, and provider failures
remain errors. A registered provider may itself produce `undefined`; use
`has()` when `T` includes `undefined` and presence must be distinguished.
Dynamic calls made during activation retain cycle, lifetime,
ownership, and registry-mutation tracking, including an absent optional edge.
Deferred lazy and resolver calls re-read the latest registry while retaining
lifetime and ownership checks.

### Inspection results

```ts
interface DependencyGraph {
  readonly root: Token<any>;
  readonly providers: readonly InspectedProvider[];
  readonly missing: readonly Token<any>[];
}

interface InspectedProvider {
  readonly token: Token<any>;
  readonly binding: number;
  readonly mode: "single" | "multi";
  readonly kind: ProviderKind;
  readonly scope: Scope | undefined;
  readonly owner: Container;
  readonly dependencies: readonly InspectedDependency[];
}
```

`ProviderKind` is `"class" | "value" | "factory" | "asyncFactory" |
"existing"`. `DependencyKind` is `"required" | "optional" | "all" | "lazy" |
"resolver"`. Every inspected dependency except `resolver` includes its
`token`; a resolver dependency is `{ kind: "resolver" }`.

Inspection traverses required, optional, and all dependencies without running
providers. It records missing required tokens, does not report absent optional
or all targets as missing, and does not traverse deferred `lazy` or dynamic
`resolver` targets.

## Errors

### `ResolutionError`

`ResolutionError` extends `Error` and exposes:

- `code: ResolutionErrorCode`
- `path: readonly Token<any>[]`, frozen and ordered from requested root to the
  failing token
- `cycle: readonly Token<any>[] | undefined`, the frozen minimal cycle when available
- the original provider `cause` when one exists

Its public constructor is `new ResolutionError(code, message, path, cause?,
cycle?)`.

| Code | Meaning |
| --- | --- |
| `NOT_FOUND` | A required provider is absent. |
| `MULTIPLE_PROVIDERS` | Single resolution encountered multiple bindings; use a `resolveAll` form. |
| `CIRCULAR` | An eager or immediate dynamic dependency cycle was detected. |
| `ASYNC_IN_SYNC` | Sync resolution encountered an async provider, pending async cache, or Promise result. |
| `CAPTIVE_DEPENDENCY` | A lookup would violate lifetime or container ownership. |
| `CONTAINER_BUSY` | Resolution began while registry mutation was active. |
| `DISPOSED` | Resolution was attempted after disposal started. |
| `PROVIDER_FAILED` | Provider creation, activation, or owned-resource tracking failed. |

### `RegistrationError`

`RegistrationError` extends `TypeError` and exposes
`code: RegistrationErrorCode` plus the offending `token` when available. Its
public constructor is `new RegistrationError(code, message, token?, cause?)`.

| Code | Meaning |
| --- | --- |
| `INVALID_TOKEN` | A public token or dependency declaration is invalid. |
| `INVALID_PROVIDER` | The provider shape, class declaration, scope, hook, or value is invalid. |
| `INVALID_MODULE` | A registration module is invalid or asynchronous. |
| `CONTAINER_BUSY` | Mutation conflicts with active resolution or mutation. |
| `CONTAINER_DISPOSED` | Mutation or scope creation was attempted after disposal started. |
| `BINDING_MODE_CONFLICT` | Local single and multi modes were mixed. |
| `DUPLICATE_PROVIDER` | A local single provider already exists. |
| `NOT_REGISTERED` | `rebind()` targeted a token with no local binding. |

Disposal protocol violations use `TypeError`; multiple cleanup failures are
reported together as `AggregateError`.

## Disposal and ownership

`Container` implements both `Disposable` and `AsyncDisposable`:

| API | Behavior |
| --- | --- |
| `dispose()` / `[Symbol.dispose]()` | Synchronous cleanup. Preflights the container tree and refuses an in-flight or async-only tree before cleanup starts. |
| `disposeAsync()` / `[Symbol.asyncDispose]()` | Waits for in-flight resolution, then performs async cleanup. Concurrent calls share the disposal operation. |

Children are disposed before parents. Owned resources within each container
are disposed in reverse acquisition order. Cleanup continues after individual
failures and throws one `AggregateError` after the remaining work completes.

Class and factory results are owned by their activation container when an
explicit disposal hook or `Symbol.dispose`/`Symbol.asyncDispose` method is
present. Values and aliases are borrowed. The same object identity is captured
only once per owning container, so its first captured ownership contract wins.
An object whose activation hook fails is not cached, but remains owned for
later cleanup.

```ts
{
  using scope = root.createScope();
  const service = scope.resolve(Service);
}

await using scope = root.createScope();
const service = await scope.resolveAsync(AsyncService);
```

Choose `await using`/`disposeAsync()` when the graph can contain asynchronous
providers, active resolution, or async-only resources.

## Boundary summary

- `resolve()`, `resolveOptional()`, and `resolveAll()` are strictly synchronous;
  their async forms can resolve both sync and async providers.
- A local binding set shadows the complete parent set; hierarchy lookup never
  merges parent and child multi-bindings.
- Singleton activation is registration-owner-affine. Other lifetimes use the
  active resolving container and may see child overrides.
- Dynamic provider lookup may target the activation container or an ancestor,
  never a sibling or descendant.
- `lazy()` and `resolver()` defer only the chosen edge; they do not bypass
  lifetime, ownership, cycle, or disposed-container checks.
- Bunject does not create circular proxies. Use an intentional deferred edge
  when the design requires one.

See [Bun HTTP request scopes](./bun-http.md) for a complete child-scope example,
[migration guides](./migrations.md) for other DI styles, and the
[support policy](./support.md) for the compatibility contract.
