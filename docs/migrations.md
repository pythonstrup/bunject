# Migration guides

Bunject does not read `design:paramtypes`. Every migration therefore starts by
making constructor dependencies explicit. Migrate one composition root at a
time; application classes do not need to change beyond their injection
metadata.

## From InversifyJS

```ts
// InversifyJS
container.bind(DATABASE).toConstantValue(database);
container.bind(UserRepository).toSelf().inSingletonScope();
container.get(UserRepository);

// Bunject
container.register(DATABASE, { useValue: database });
container.register(UserRepository, {
  inject: [DATABASE],
  useClass: UserRepository,
  scope: "singleton",
});
container.resolve(UserRepository);
```

Replace `@injectable()` and parameter `@inject()` with one of:

```ts
@Injectable({ inject: [DATABASE], scope: "singleton" })
class UserRepository {
  constructor(readonly database: Database) {}
}
```

or `static inject = [DATABASE] as const`. Replace named/tagged binding patterns
with typed symbol tokens, and `getAll()` with `resolveAll()`. `createChild()`
maps to `createScope()`. Use `lazy()` for an intentionally deferred edge;
Bunject does not create circular proxies. Inversify's `{ optional: true }`
maps to `resolveOptional()` or `resolveOptionalAsync()`.
Inversify autobind creates a lasting binding. Use `build(Class)` for a one-off
unregistered root, or `register(Class)` when later resolutions should see the
binding and preserve its configured scope. Bunject bypasses registration only
for the build root. Dependencies keep their declared lookup semantics, and a
required class token is not recursively autobound.

## From TSyringe

```ts
// TSyringe
container.register(DATABASE, { useValue: database });
container.registerSingleton(UserRepository);
container.resolve(UserRepository);

// Bunject
container.register(DATABASE, { useValue: database });
container.register(UserRepository, {
  inject: [DATABASE],
  useClass: UserRepository,
  scope: "singleton",
});
container.resolve(UserRepository);
```

Remove the `reflect-metadata` import and legacy decorator compiler flags.
Replace constructor parameter decorators with explicit tuples. TSyringe child
containers map to `createScope()`, `injectAll()` maps to `all()`, and
`isRegistered(token, true)` maps to `has(token)` (`{ own: true }` disables the
parent lookup).
TSyringe can resolve an unregistered class directly; the explicit Bunject
equivalent is `build(Class)` or `buildAsync(Class)`. Only that root may be
unregistered in Bunject. Dependencies keep their declared lookup semantics,
and a required class token is not recursively constructed.

TSyringe's conventional `dispose()` interface can use the standard resource
protocol:

```ts
class Connection implements AsyncDisposable {
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
```

For an external client that cannot implement the protocol, adapt cleanup on the
provider instead:

```ts
container.register(CONNECTION, {
  useFactory: () => thirdPartyConnection,
  onDisposalAsync: (connection) => connection.close(),
});
```

Awilix `.disposer()` maps to the same provider callback. `useValue` remains
borrowed; use a factory when Bunject should own an existing external resource.

## From Awilix

```ts
// Awilix
container.register({
  database: asValue(database),
  users: asClass(UserRepository).singleton(),
});
container.resolve("users");

// Bunject
const DATABASE = token<Database>("DATABASE");
container.register(DATABASE, { useValue: database });
container.register(UserRepository, {
  inject: [DATABASE],
  useClass: UserRepository,
  scope: "singleton",
});
container.resolve(UserRepository);
```

Replace string cradle keys with invariant typed tokens. Awilix `singleton`,
`scoped`, and `transient` map directly. Bunject additionally distinguishes
`resolution`, which is shared only within one top-level graph. Awilix scopes map
to `createScope()`. Awilix `{ allowUnregistered: true }` maps to
`resolveOptional()` or `resolveOptionalAsync()`.
Awilix `container.build(MyClass)` maps directly to Bunject
`container.build(MyClass)`; Bunject's form is class-only and owns a disposable
built root until its invoking container is disposed.

Awilix factories receive a cradle; Bunject factories receive their declared
dependencies in tuple order. This keeps missing dependencies and async
boundaries statically inspectable:

```ts
container.register(USER_SERVICE, {
  inject: [DATABASE, CACHE],
  useFactory: (database, cache) => new UserService(database, cache),
});
```

## Behavioral differences to verify

| Concern | Bunject behavior |
| --- | --- |
| Decorators | Standard decorators only; no parameter decorators |
| Metadata | Explicit tuples; no emitted design metadata |
| Async | `useFactoryAsync` and `resolveAsync` are explicit |
| Values | Borrowed and never disposed |
| Class/factory results | Owned through explicit callbacks or standard symbols |
| Mutation | Local `rebind`/`unregister`; retired generations live to scope end |
| Dynamic lookup | Same activation container or an ancestor only |
| Cycles | Structured error; `forwardRef()` avoids class TDZ, while `lazy()` or an injected Resolver defers resolution |

Run `container.validate(ROOT)` for every migrated root before starting the
application, then close integration tests with `await using` or an explicit
`disposeAsync()`.
