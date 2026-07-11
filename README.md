# Bunject

Bun-first dependency injection for standard TypeScript decorators. Bunject has
no runtime dependencies, global container, legacy decorator requirement, or
`reflect-metadata` dependency.

It provides explicit typed tokens, four lifetimes, child scopes, multi-binding,
sync/async graph validation, deterministic resource disposal, and structured
dependency errors. The runtime surface is Bun-first and Node-compatible; the
compiled package also runs on modern Node.js and Deno.

## Install

```sh
bun add bunject
```

Requirements:

- Bun 1.3.10 or newer
- Node.js 22 or newer when using the compiled package outside Bun
- TypeScript 5.4 or newer
- standard decorators; do not enable `experimentalDecorators` or
  `emitDecoratorMetadata`
- `ESNext.Disposable` in `compilerOptions.lib` when the project does not use
  the complete `ESNext` library

```json
{
  "compilerOptions": {
    "lib": ["ES2022", "ESNext.Decorators", "ESNext.Disposable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022"
  }
}
```

## Quick start

```ts
import { Container, Injectable, token } from "bunject";

interface Database {
  query(sql: string): unknown;
}

const DATABASE = token<Database>("DATABASE");

@Injectable({ inject: [DATABASE], scope: "singleton" })
class UserRepository {
  constructor(readonly database: Database) {}
}

@Injectable({ inject: [UserRepository] })
class UserService {
  constructor(readonly users: UserRepository) {}
}

const container = new Container();
container.register(DATABASE, {
  useValue: { query: (_sql) => undefined },
});
container.register(UserRepository);
container.register(UserService);

const users = container.resolve(UserService);
```

`@Injectable()` stores metadata only. Registration remains explicit and imports
have no global side effects. Every class provider declares its constructor
contract through `@Injectable()`, provider `inject`, or
`static inject = [...] as const`; use `@Injectable()` or `inject: []` for an
undecorated zero-argument class.

## Providers and lifetimes

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

Class and factory providers support `singleton`, `scoped`, `resolution`, and
`transient` lifetimes. They default to `transient`; values are always borrowed
singletons and aliases retain the target's identity.

- `singleton`: one value in the registration owner
- `scoped`: one value in each resolving container
- `resolution`: one value in a top-level dependency graph
- `transient`: a new owned value each time that binding is resolved

Cached providers cannot capture scoped or resolution values with shorter
lifetimes, or transient values resolved through a descendant-owned container.
Bunject checks declared, lazy, and dynamic resolution paths before an unsafe
value becomes cached.

## Child and request scopes

```ts
await using requestScope = application.createScope();
requestScope.register(REQUEST, { useValue: request });

const handler = await requestScope.resolveAsync(RequestHandler);
return handler.handle();
```

Local registrations shadow the nearest parent set. Parent singletons keep
owner-affine dependencies, while parent scoped and transient providers use the
active child and its overrides. Disposing a parent disposes descendants first.
See the complete [Bun HTTP request-scope example](./docs/bun-http.md).

## Multi, optional, all, lazy, and resolver dependencies

```ts
container.registerMulti(HOOK, { inject: [], useClass: AuditHook });
container.registerMulti(HOOK, { inject: [], useClass: MetricsHook });

container.register(APPLICATION, {
  inject: [optional(CACHE), all(HOOK), lazy(REPORTER)],
  useFactory: (cache, hooks, reporter) =>
    new Application(cache, hooks, reporter),
});

const hooks = container.resolveAll(HOOK);
```

`optional(T)` returns `undefined` only when `T` is absent. `all(T)` returns the
nearest complete binding set, including an empty array. `lazy(T)` returns a
frozen `{ resolve, resolveAsync }` handle, defers construction and missing-token
validation, and retains the lifetime constraints of its owner.

Use `resolver()` when a provider must choose tokens dynamically or resolve a
complete multi-binding set:

```ts
container.register(REPORT_FACTORY, {
  inject: [resolver()],
  scope: "scoped",
  useFactory: (activeResolver) => () => activeResolver.resolve(REPORTER),
});
```

The injected `Resolver` is a frozen, read-only surface with `resolve`,
`resolveAsync`, `resolveAll`, and `resolveAllAsync`. It is bound to the
provider's activation container: a scoped provider activated in a child sees
that child, while a parent singleton remains owner-affine.

Calls made during provider activation join the active resolution path and are
tracked for cycles, lifetimes, and later registry mutation. Calls made after
activation re-read the latest registry without making their holder depend on a
future target, but retain the holder's captured lifetime and ownership limits.

Single and multi registration modes cannot be mixed for one token in the same
container. A local set shadows the complete parent set.

## Sync and async resolution

```ts
const service = container.resolve(SYNC_SERVICE);
const application = await container.resolveAsync(APPLICATION);
```

The APIs are deliberately separate. `resolve()` preflights the complete
declared graph and rejects an async provider before construction starts.
Concurrent async requests coalesce each cached provider. Dynamic calls made by
factories retain the active path, lifetime constraint, cycle detection, and
mutation dependency tracking.

## Activation and disposal

```ts
container.register(CLIENT, {
  useFactory: () => new Client(),
  onActivation: (client, { container, token }) => {
    const name =
      typeof token === "symbol"
        ? token.description ?? token.toString()
        : token.name;
    client.attach(container.resolve(LOGGER), name);
  },
  onDisposalAsync: async (client) => client.close(),
});

await using container = new Container();
```

`onActivation` is synchronous and runs once for each successfully created
class or factory value, before caching. Class and factory results that implement
`Symbol.dispose` or `Symbol.asyncDispose` are owned by the activation scope and
disposed in reverse acquisition order. For third-party resources, providers may
declare `onDisposal` and/or `onDisposalAsync`; when present, that explicit pair
replaces the resource's Symbol protocol. `disposeAsync()` prefers the async
callback and falls back to the sync callback. `onDisposal` must not return a
Promise; use `onDisposalAsync` for asynchronous work. `dispose()` rejects an
async-only tree before cleanup begins. `useValue` and alias results are borrowed
and never own cleanup. Disposal continues after failures and reports an
`AggregateError`. When providers return the same object, the first captured
ownership contract wins. A value whose activation hook fails is not cached, but
remains owned and is cleaned when its activation container is disposed.

## Modules, inspection, and controlled mutation

```ts
container.load(
  (registry) => {
    registry
      .register(Config, { inject: [], useClass: Config })
      .register(Logger, { inject: [], useClass: Logger });
  },
  (registry) => {
    registry.registerMulti(HOOK, { inject: [], useClass: AuditHook });
  },
);

container.validate(Application);
const graph = container.inspect(Application);

container.rebind(CONFIG, { useValue: testConfig });
container.unregister(CONFIG);
```

`load()` stages all registrations and commits them atomically. Its restricted
registry cannot resolve services or escape to lifecycle APIs. `inspect()`
returns a frozen graph without construction; `validate()` performs the same
sync/async, missing, cycle, ambiguity, and lifetime checks used by resolution.

`rebind()` and `unregister()` affect only local registrations. Cached values
that captured the changed token through declared dependencies or dynamic
`resolve*`/`has` calls are retired and rebuilt on the next request. Retired
owned resources stay valid for existing callers and are disposed with their
scope. For parallel tests, a child scope or a fresh root container is usually
simpler than mutating a shared root.

## Errors

`ResolutionError` exposes a stable `code`, the complete `path`, an optional
minimal `cycle`, and the original provider `cause`. `RegistrationError`
exposes a stable `code` and offending `token`.

```text
Provider not found for DATABASE.
Resolution path: UserController -> UserService -> UserRepository -> DATABASE
```

## Design boundaries

- TypeScript does not emit constructor parameter types for standard
  decorators. Dependencies are therefore explicit and checked through
  decorator metadata, provider `inject`, or `static inject`.
- Decorator dependency tuples are not inherited. A subclass with constructor
  dependencies must redeclare them; decorator scope metadata may be inherited.
- Keep dependency-bearing provider objects inline. For a reusable definition,
  preserve its exact tuple with `FactoryProvider<T, typeof dependencies>` or
  `ClassProvider<T, typeof dependencies>`; the broad `Provider<T>` storage type
  cannot preserve an existential dependency tuple.
- Parameter decorators and automatic class registration are intentionally not
  provided.
- Promise-like values are not service values. Wrap a Promise in an object or
  use `useFactoryAsync`.
- Synchronous activation, disposal, and module callbacks use block bodies with
  no returned expression. Their `undefined` return contract prevents TypeScript's
  `void` assignability rule from silently accepting an `async` function.
- Dynamic provider resolution may target its activation container or an
  ancestor, not a sibling or descendant. This prevents lifetime and ownership
  leaks.
- Circular proxies are not created; eager and immediate dynamic cycles fail
  with a structured error. Use `lazy()` or an injected `Resolver` for an
  intentional deferred edge.

## Project status

The repository defines type, coverage, property, generated-graph, concurrency,
packed-consumer, package-lint, public-API, size, and runtime-matrix checks.
Its [agent harness](./docs/harness.md) keeps architecture, execution state,
documentation links, and core repository invariants machine-readable.
The exact [production maturity criteria](./docs/maturity.md),
[migration guides](./docs/migrations.md), [security policy](./SECURITY.md),
and [support policy](./docs/support.md) are public. Passing those gates is not a
claim of ecosystem adoption or battle-testing; those require real users and
time.
