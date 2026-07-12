import {
  Container,
  Injectable,
  all,
  defineProvider,
  forwardRef,
  lazy,
  optional,
  resolver,
  token,
  type ClassProvider,
  type DefinedProvider,
  type ForwardRefDependency,
  type InjectionToken,
  type Lazy,
  type MultiResolutionOptions,
  type Provider,
  type Resolver,
  type Token,
} from "../src/index";

class Database {
  query() {}
}

class Cache {
  get() {}
}

const DATABASE = token<Database>("DATABASE");
const CACHE = token<Cache>("CACHE");
const container = new Container();

container.register(DATABASE, { useValue: new Database() });
container.register(CACHE, {
  inject: [DATABASE],
  useFactory: (database) => {
    database.query();
    return new Cache();
  },
});

const database: Database = container.resolve(DATABASE);
const optionalDatabase: Database | undefined =
  container.resolveOptional(DATABASE);
const pendingOptionalDatabase: Promise<Database | undefined> =
  container.resolveOptionalAsync(DATABASE);
void database;
void optionalDatabase;
void pendingOptionalDatabase;

// @ts-expect-error token type controls the value provider type
container.register(DATABASE, { useValue: new Cache() });

// @ts-expect-error a sync factory cannot return a Promise
container.register(DATABASE, { useFactory: async () => new Database() });

// @ts-expect-error raw symbols are not typed injection tokens
container.resolve(Symbol("RAW"));

declare const typedToken: InjectionToken<Database>;
const typedResult: Database = container.resolve(typedToken);
void typedResult;

function registerDatabase(provider: Provider<Database>) {
  container.register(DATABASE, provider);
}
registerDatabase({ useValue: new Database() });

// @ts-expect-error async factories must return a Promise-like value
container.register(DATABASE, { useFactoryAsync: () => new Database() });

abstract class Storage {}
class FileStorage extends Storage {}
const storageProvider: ClassProvider<Storage> = { useClass: FileStorage };
void storageProvider;

// @ts-expect-error Cache is not a Database implementation
const wrongClassProvider: ClassProvider<Database> = { useClass: Cache };
void wrongClassProvider;

// @ts-expect-error provider variants are mutually exclusive
container.register(DATABASE, {
  useFactory: () => new Database(),
  useFactoryAsync: async () => new Database(),
});

class Animal {}
class Dog extends Animal {
  bark() {}
}
const DOG = token<Dog>("DOG");
// @ts-expect-error injection tokens are invariant in their value type
const ANIMAL: InjectionToken<Animal> = DOG;
void ANIMAL;

class NeedsDatabase {
  constructor(readonly database: Database) {}
}
const NEEDS_DATABASE = token<NeedsDatabase>("NEEDS_DATABASE");

class StaticDependenciesMatch {
  static inject = [DATABASE] as const;

  constructor(readonly database: Database) {}
}

class StaticDependenciesMismatch {
  static inject = [CACHE] as const;

  constructor(readonly database: Database) {}
}

@Injectable({ inject: [DATABASE] })
class DecoratedNeedsDatabase {
  constructor(readonly database: Database) {}
}

// @ts-expect-error decorator dependency tuples cannot exceed constructor arity
@Injectable({ inject: [DATABASE] })
class DecoratedSurplusDependency {}
void DecoratedSurplusDependency;

class StaticSurplusDependency {
  static inject = [DATABASE] as const;
}

class OptionalConstructor {
  constructor(readonly database?: Database) {}
}

@Injectable()
class DefaultConstructor {
  constructor(readonly database = new Database()) {}
}

@Injectable()
class RestConstructor {
  constructor(...databases: Database[]) {
    void databases;
  }
}

const DECORATED_NEEDS_DATABASE = token<DecoratedNeedsDatabase>(
  "DECORATED_NEEDS_DATABASE",
);

container.register(StaticDependenciesMatch);
container.register(NEEDS_DATABASE, { useClass: StaticDependenciesMatch });
container.register(DECORATED_NEEDS_DATABASE, {
  scope: "singleton",
  useClass: DecoratedNeedsDatabase,
});

// @ts-expect-error static inject must match constructor parameters
container.register(StaticDependenciesMismatch);
// @ts-expect-error metadata class providers validate static inject
container.register(NEEDS_DATABASE, { useClass: StaticDependenciesMismatch });
// @ts-expect-error multi metadata class providers validate static inject
container.registerMulti(NEEDS_DATABASE, {
  useClass: StaticDependenciesMismatch,
});
// @ts-expect-error rebind metadata class providers validate static inject
container.rebind(NEEDS_DATABASE, { useClass: StaticDependenciesMismatch });
// @ts-expect-error static dependency tuples cannot exceed constructor arity
container.register(StaticSurplusDependency);

container.register(NEEDS_DATABASE, {
  inject: [DATABASE],
  useClass: NeedsDatabase,
});

const OPTIONAL_CONSTRUCTOR = token<OptionalConstructor>("OPTIONAL_CONSTRUCTOR");
container.register(OPTIONAL_CONSTRUCTOR, {
  inject: [],
  useClass: OptionalConstructor,
});
container.registerMulti(OPTIONAL_CONSTRUCTOR, {
  inject: [DATABASE],
  useClass: OptionalConstructor,
});
container.register(DefaultConstructor);
container.register(RestConstructor);

const SURPLUS = token<StaticSurplusDependency>("SURPLUS");
container.register(SURPLUS, { useValue: new StaticSurplusDependency() });
// @ts-expect-error explicit class tuples cannot exceed constructor arity
container.register(SURPLUS, {
  inject: [DATABASE],
  useClass: StaticSurplusDependency,
});
// @ts-expect-error multi class tuples cannot exceed constructor arity
container.registerMulti(SURPLUS, {
  inject: [DATABASE],
  useClass: StaticSurplusDependency,
});
// @ts-expect-error rebound class tuples cannot exceed constructor arity
container.rebind(SURPLUS, {
  inject: [DATABASE],
  useClass: StaticSurplusDependency,
});
// @ts-expect-error factory tuples cannot exceed callback arity
container.register(SURPLUS, {
  inject: [DATABASE],
  useFactory: () => new StaticSurplusDependency(),
});
// @ts-expect-error multi factory tuples cannot exceed callback arity
container.registerMulti(SURPLUS, {
  inject: [DATABASE],
  useFactory: () => new StaticSurplusDependency(),
});
// @ts-expect-error rebound async tuples cannot exceed callback arity
container.rebind(SURPLUS, {
  inject: [DATABASE],
  useFactoryAsync: async () => new StaticSurplusDependency(),
});

container.register(SURPLUS, {
  inject: [],
  useFactory: (_database?: Database) => new StaticSurplusDependency(),
});
container.registerMulti(SURPLUS, {
  inject: [DATABASE],
  useFactory: (_database?: Database) => new StaticSurplusDependency(),
});
container.registerMulti(SURPLUS, {
  inject: [DATABASE, DATABASE],
  useFactory: (..._databases: Database[]) => new StaticSurplusDependency(),
});

const reusableFactory = defineProvider<NeedsDatabase>()({
  inject: [DATABASE, optional(CACHE)],
  useFactory: (database, cache) => {
    database.query();
    cache?.get();
    return new NeedsDatabase(database);
  },
});
const reusableAsync = defineProvider<NeedsDatabase>()({
  inject: [DATABASE],
  useFactoryAsync: async (database) => new NeedsDatabase(database),
});
const reusableClass = defineProvider<NeedsDatabase>()({
  inject: [DATABASE],
  useClass: NeedsDatabase,
});
// @ts-expect-error stored factory tuples cannot exceed callback arity
defineProvider<NeedsDatabase>()({ inject: [DATABASE], useFactory: () => new NeedsDatabase(new Database()) });
// @ts-expect-error stored async tuples cannot exceed callback arity
defineProvider<NeedsDatabase>()({ inject: [DATABASE], useFactoryAsync: async () => new NeedsDatabase(new Database()) });
// @ts-expect-error stored class tuples cannot exceed constructor arity
defineProvider<StaticSurplusDependency>()({ inject: [DATABASE], useClass: StaticSurplusDependency });
const reusableFactoryResult: NeedsDatabase = reusableFactory.useFactory(
  new Database(),
  undefined,
);
const reusableClassConstructor: typeof NeedsDatabase = reusableClass.useClass;
void reusableFactoryResult;
void reusableClassConstructor;
const storedProvider: DefinedProvider<NeedsDatabase> = reusableFactory;
container.register(NEEDS_DATABASE, storedProvider);
container.registerMulti(NEEDS_DATABASE, storedProvider);
container.rebind(NEEDS_DATABASE, storedProvider);
container.register(NEEDS_DATABASE, reusableAsync);
container.registerMulti(NEEDS_DATABASE, reusableClass);
const MAYBE_NEEDS_DATABASE = token<
  NeedsDatabase | Promise<NeedsDatabase>
>("MAYBE_NEEDS_DATABASE");
container.register(MAYBE_NEEDS_DATABASE, storedProvider);
declare const unsafeMaybeDefined: DefinedProvider<
  NeedsDatabase | Promise<NeedsDatabase>
>;
// @ts-expect-error reusable providers cannot retain a Promise-like union branch
container.register(MAYBE_NEEDS_DATABASE, unsafeMaybeDefined);
const ANY_SERVICE = token<any>("ANY_SERVICE");
declare const unsafePromiseDefined: DefinedProvider<Promise<NeedsDatabase>>;
// @ts-expect-error any-typed tokens cannot hide a Promise-like defined provider
container.register(ANY_SERVICE, unsafePromiseDefined);

const inferredProvider = defineProvider({
  inject: [DATABASE],
  useFactory: (database) => new NeedsDatabase(database),
  onActivation: (value) => {
    value.database.query();
  },
});
const inferredStored: DefinedProvider<NeedsDatabase> = inferredProvider;
const inferredResult: NeedsDatabase = inferredProvider.useFactory(new Database());
void inferredStored;
void inferredResult;

interface OverloadedFactory {
  (database: Database): NeedsDatabase;
  (database: Database, cache: Cache): NeedsDatabase;
}
declare const overloadedFactory: OverloadedFactory;
container.register(NEEDS_DATABASE, {
  inject: [DATABASE],
  // @ts-expect-error overloaded factories use their final declared signature
  useFactory: overloadedFactory,
});
container.registerMulti(NEEDS_DATABASE, {
  inject: [DATABASE, CACHE],
  useFactory: (database, cache) => overloadedFactory(database, cache),
});
defineProvider({
  inject: [DATABASE],
  useFactory: (database) => overloadedFactory(database),
});
function identityFactory<T>(value: T): T {
  return value;
}
container.register(DATABASE, {
  inject: [DATABASE],
  useFactory: identityFactory,
});
container.register(DATABASE, {
  inject: [DATABASE],
  useFactory: (database) => identityFactory(database),
});

interface RiskyOverloadedFactory {
  (database: Database): Promise<NeedsDatabase>;
  (database?: Database): Cache;
}
declare const riskyOverloadedFactory: RiskyOverloadedFactory;
container.register(CACHE, {
  inject: [DATABASE],
  // @ts-expect-error overlapping overloads require a single-signature wrapper
  useFactory: riskyOverloadedFactory,
});
// @ts-expect-error inferred overloaded factories cannot misbrand their return
defineProvider({ inject: [DATABASE], useFactory: riskyOverloadedFactory });
// @ts-expect-error explicit builders also require a safe single signature
defineProvider<Cache>()({ inject: [DATABASE], useFactory: riskyOverloadedFactory });

interface RiskyOverloadedConstructor {
  readonly prototype: Cache;
  new (database: Database): PromiseLike<NeedsDatabase>;
  new (database?: Database): Cache;
}
declare const riskyOverloadedConstructor: RiskyOverloadedConstructor;
// @ts-expect-error structural constructors cannot use overlapping overloads
container.register(CACHE, {
  inject: [DATABASE],
  useClass: riskyOverloadedConstructor,
});
// @ts-expect-error inferred constructors cannot misbrand their instance type
defineProvider({ inject: [DATABASE], useClass: riskyOverloadedConstructor });

// @ts-expect-error overloaded constructors require an adapter class
@Injectable({ inject: [DATABASE] })
class OverloadedConstructor {
  constructor(database: Database, cache: Cache);
  constructor(database: Database);
  constructor(
    readonly database: Database,
    readonly cache?: Cache,
  ) {}
}
// @ts-expect-error overloaded constructors cannot self-register directly
container.register(OverloadedConstructor);
// @ts-expect-error overloaded constructors require an adapter class
container.register(NEEDS_DATABASE, { inject: [DATABASE], useClass: OverloadedConstructor });

// @ts-expect-error overloaded constructors require an adapter class
@Injectable()
class ZeroOverloadedConstructor {
  constructor(database: Database);
  constructor();
  constructor(readonly database?: Database) {}
}
// @ts-expect-error overloaded constructors cannot self-register directly
container.register(ZeroOverloadedConstructor);

@Injectable({ inject: [DATABASE] })
class OverloadedConstructorAdapter {
  constructor(readonly database: Database) {}
}
container.register(OverloadedConstructorAdapter);

@Injectable()
class PrivateStaticService {
  private static marker = 1;

  static markerValue(): number {
    return this.marker;
  }
}
container.register(PrivateStaticService);
defineProvider({ inject: [], useClass: PrivateStaticService });
void PrivateStaticService.markerValue();

class StaticOverloadedConstructor {
  static readonly inject = [DATABASE] as const;
  constructor(database: Database, cache: Cache);
  constructor(database: Database);
  constructor(
    readonly database: Database,
    readonly cache?: Cache,
  ) {}
}
// @ts-expect-error static overloaded constructors require an adapter class
container.register(StaticOverloadedConstructor);

const widenedDependencies: readonly (typeof DATABASE)[] = [DATABASE];
container.register(NEEDS_DATABASE, {
  inject: widenedDependencies,
  useFactory: (...databases: Database[]) =>
    new NeedsDatabase(databases[0] ?? new Database()),
});
defineProvider<NeedsDatabase>()({
  inject: widenedDependencies,
  useFactory: (...databases: Database[]) =>
    new NeedsDatabase(databases[0] ?? new Database()),
});
defineProvider({
  inject: widenedDependencies,
  useFactory: (...databases: Database[]) =>
    new NeedsDatabase(databases[0] ?? new Database()),
});
container.register(NEEDS_DATABASE, {
  inject: widenedDependencies,
  // @ts-expect-error widened arrays may be empty, so required parameters are unsafe
  useFactory: (database: Database) => new NeedsDatabase(database),
});
const possiblyEmptyProvider = {
  inject: [] as readonly (typeof DATABASE)[],
  useFactory: (database: Database) => new NeedsDatabase(database),
};
// @ts-expect-error stored widened arrays may also be empty
container.register(NEEDS_DATABASE, possiblyEmptyProvider);
container.register(NEEDS_DATABASE, {
  inject: [CACHE] as readonly (typeof CACHE)[],
  // @ts-expect-error widened dependency element types must match callback parameters
  useFactory: (database: Database) => new NeedsDatabase(database),
});

// @ts-expect-error inferred synchronous providers cannot use an async factory
defineProvider({ inject: [DATABASE], useFactory: async (database) => new NeedsDatabase(database) });
declare const maybeAsyncNeedsDatabase:
  | NeedsDatabase
  | Promise<NeedsDatabase>;
// @ts-expect-error inferred synchronous providers cannot return Promise unions
defineProvider({ inject: [DATABASE], useFactory: () => maybeAsyncNeedsDatabase });

declare class ThenableService implements PromiseLike<ThenableService> {
  then<TResult1 = ThenableService, TResult2 = never>(
    onfulfilled?:
      | ((value: ThenableService) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}
// @ts-expect-error inferred class providers cannot construct Promise-like services
defineProvider({ inject: [], useClass: ThenableService });
// @ts-expect-error self-registration cannot construct a Promise-like service
container.register(ThenableService);

const BROAD_OBJECT = token<object>("BROAD_OBJECT");
class LooseThenService {
  then(): void {}
}
// @ts-expect-error actual Promise values remain rejected under broad service tokens
container.register(BROAD_OBJECT, { useValue: Promise.resolve({}) });
// @ts-expect-error actual Promise values remain rejected for multi-bindings
container.registerMulti(BROAD_OBJECT, { useValue: Promise.resolve({}) });
// @ts-expect-error actual async callbacks cannot masquerade as broad sync factories
container.register(BROAD_OBJECT, { useFactory: async () => ({}) });
// @ts-expect-error rebind keeps the actual async callback boundary
container.rebind(BROAD_OBJECT, { useFactory: async () => ({}) });
// @ts-expect-error actual Promise-like classes cannot masquerade as broad services
container.register(BROAD_OBJECT, { inject: [], useClass: ThenableService });
// @ts-expect-error callable-then values follow the runtime thenable boundary
container.register(BROAD_OBJECT, { useValue: new LooseThenService() });
// @ts-expect-error callable-then factories follow the runtime thenable boundary
container.register(BROAD_OBJECT, { useFactory: () => new LooseThenService() });
// @ts-expect-error callable-then classes follow the runtime thenable boundary
container.register(BROAD_OBJECT, { inject: [], useClass: LooseThenService });
// @ts-expect-error callable-then classes cannot self-register
container.register(LooseThenService);
// @ts-expect-error explicit builders retain the actual async callback boundary
defineProvider<object>()({ inject: [], useFactory: async () => ({}) });
container.register(BROAD_OBJECT, { useFactoryAsync: async () => ({}) });

const PROMISE_NEEDS_DATABASE = token<Promise<NeedsDatabase>>(
  "PROMISE_NEEDS_DATABASE",
);
declare const forbiddenDefinedProvider: DefinedProvider<Promise<NeedsDatabase>>;
// @ts-expect-error defined providers cannot bypass the Promise-service boundary
container.register(PROMISE_NEEDS_DATABASE, forbiddenDefinedProvider);

// @ts-expect-error the defined provider service type is invariant
container.register(CACHE, storedProvider);

defineProvider<NeedsDatabase>()({
  inject: [CACHE],
  // @ts-expect-error callback parameters must match the dependency tuple
  useFactory: (database: Database) => new NeedsDatabase(database),
});

defineProvider<NeedsDatabase>()({
  inject: [CACHE],
  // @ts-expect-error class constructors must match the dependency tuple
  useClass: NeedsDatabase,
});

// @ts-expect-error factory results must match the declared service type
defineProvider<NeedsDatabase>()({ inject: [DATABASE], useFactory: () => new Cache() });

// @ts-expect-error synchronous factories cannot return Promises
defineProvider<NeedsDatabase>()({ inject: [DATABASE], useFactory: async (database) => new NeedsDatabase(database) });

// @ts-expect-error async factories must return Promise-like values
defineProvider<NeedsDatabase>()({ inject: [DATABASE], useFactoryAsync: (database) => new NeedsDatabase(database) });

// @ts-expect-error explicit dependency tuples must match the constructor
container.register(NEEDS_DATABASE, {
  inject: [CACHE],
  useClass: NeedsDatabase,
});

container.register(NEEDS_DATABASE, {
  inject: [CACHE],
  // @ts-expect-error factory parameters must match the dependency tuple
  useFactory: (database: Database) => new NeedsDatabase(database),
});

container.register(NEEDS_DATABASE, {
  inject: [CACHE],
  // @ts-expect-error async factory parameters must match the dependency tuple
  useFactoryAsync: async (database: Database) => new NeedsDatabase(database),
});

container.registerMulti(NEEDS_DATABASE, {
  inject: [CACHE],
  // @ts-expect-error multi factory parameters must match the dependency tuple
  useFactory: (database: Database) => new NeedsDatabase(database),
});

container.rebind(NEEDS_DATABASE, {
  inject: [CACHE],
  // @ts-expect-error rebound factory parameters must match the dependency tuple
  useFactory: (database: Database) => new NeedsDatabase(database),
});

const PROMISE = token<Promise<number>>("PROMISE");
// @ts-expect-error Promise-like service values are not supported
container.register(PROMISE, { useValue: Promise.resolve(1) });

const NUMBER = token<number>("NUMBER");
// @ts-expect-error aliases must target the same service type
container.register(NUMBER, { useExisting: DATABASE });

container.registerMulti(CACHE, {
  inject: [DATABASE],
  useFactory: (database) => {
    database.query();
    return new Cache();
  },
});

// @ts-expect-error multi factory results must match the registered token
container.registerMulti(CACHE, { useFactory: () => new Database() });

const DESCRIPTORS = token<
  readonly [Database | undefined, readonly Cache[], Lazy<Database>]
>("DESCRIPTORS");
const chainedOptions: MultiResolutionOptions = { chained: true };
const chainedCaches = all(CACHE, chainedOptions);
const chainedFlag: boolean = chainedCaches.chained;
void chainedFlag;
container.register(DESCRIPTORS, {
  inject: [optional(DATABASE), chainedCaches, lazy(DATABASE)],
  useFactory: (database, caches, deferredDatabase) => {
    database?.query();
    caches[0]?.get();
    deferredDatabase.resolve().query();
    return [database, caches, deferredDatabase] as const;
  },
});

const forwardDatabase: ForwardRefDependency<typeof DATABASE> = forwardRef(
  () => DATABASE,
);
void forwardDatabase;

@Injectable({
  inject: [
    forwardRef(() => ForwardDatabase),
    forwardRef(() => optional(ForwardDatabase)),
    forwardRef(() => all(ForwardDatabase)),
    forwardRef(() => lazy(ForwardDatabase)),
    forwardRef(() => resolver()),
  ],
})
class ForwardConsumer {
  constructor(
    readonly database: ForwardDatabase,
    readonly optionalDatabase: ForwardDatabase | undefined,
    readonly databases: readonly ForwardDatabase[],
    readonly lazyDatabase: Lazy<ForwardDatabase>,
    readonly activeResolver: Resolver,
  ) {}
}

@Injectable()
class ForwardDatabase extends Database {}

container.register(ForwardDatabase);
container.register(ForwardConsumer);

// @ts-expect-error forward callbacks must return a dependency declaration
forwardRef(() => 42);
// @ts-expect-error nested forward references are not supported
forwardRef(() => forwardRef(() => DATABASE));

// @ts-expect-error forwarded dependencies must match the constructor
@Injectable({ inject: [forwardRef(() => ForwardDatabase)] })
class WrongForwardConsumer {
  constructor(_cache: Cache) {}
}
void WrongForwardConsumer;

const ACTIVE_RESOLVER = token<Resolver>("ACTIVE_RESOLVER");
container.register(ACTIVE_RESOLVER, {
  inject: [resolver()],
  useFactory: (activeResolver) => {
    const available: boolean = activeResolver.has(DATABASE);
    const own: boolean = activeResolver.has(DATABASE, { own: true });
    const resolved: Database = activeResolver.resolve(DATABASE);
    const optionalDatabase: Database | undefined =
      activeResolver.resolveOptional(DATABASE);
    const allCaches: readonly Cache[] = activeResolver.resolveAll(CACHE);
    const chainedCaches: readonly Cache[] = activeResolver.resolveAll(
      CACHE,
      chainedOptions,
    );
    const pending: Promise<Database> = activeResolver.resolveAsync(DATABASE);
    const pendingOptional: Promise<Database | undefined> =
      activeResolver.resolveOptionalAsync(DATABASE);
    const pendingAll: Promise<readonly Cache[]> =
      activeResolver.resolveAllAsync(CACHE);
    const pendingChained: Promise<readonly Cache[]> =
      activeResolver.resolveAllAsync(CACHE, chainedOptions);
    void resolved;
    void optionalDatabase;
    void available;
    void own;
    void allCaches;
    void chainedCaches;
    void pending;
    void pendingOptional;
    void pendingAll;
    void pendingChained;
    // @ts-expect-error a Resolver cannot mutate its container
    activeResolver.register(DATABASE, { useValue: new Database() });
    return activeResolver;
  },
});

const directChained: readonly Cache[] = container.resolveAll(
  CACHE,
  chainedOptions,
);
const directChainedAsync: Promise<readonly Cache[]> =
  container.resolveAllAsync(CACHE, chainedOptions);
container.validate(CACHE, { all: true, chained: true });
container.inspect(CACHE, chainedOptions);
void directChained;
void directChainedAsync;

// @ts-expect-error chained must be boolean
all(CACHE, { chained: "yes" });
// @ts-expect-error resolveAll accepts only multi-resolution options
container.resolveAll(CACHE, { own: true });
// @ts-expect-error validate chained must be boolean
container.validate(CACHE, { all: true, chained: "yes" });

@Injectable({ inject: [resolver()] })
class ResolverConsumer {
  constructor(readonly activeResolver: Resolver) {}
}
container.register(ResolverConsumer);

class StaticResolverConsumer {
  static readonly inject = [resolver()] as const;
  constructor(readonly activeResolver: Resolver) {}
}
container.register(StaticResolverConsumer);

declare const readonlyResolver: Resolver;
declare const readonlyLazy: Lazy<Database>;
// @ts-expect-error resolver handles are read-only
readonlyResolver.resolve = () => new Database();
// @ts-expect-error lazy handles are read-only
readonlyLazy.resolve = () => new Database();

container.register(ACTIVE_RESOLVER, {
  inject: [resolver()],
  // @ts-expect-error resolver dependencies must match the factory parameter
  useFactory: (_activeResolver: Database) => ({}) as Resolver,
});

// @ts-expect-error typed resolver metadata must match the constructor
@Injectable({ inject: [resolver()] })
class WrongResolverConsumer {
  constructor(_database: Database) {}
}
void WrongResolverConsumer;

container.rebind(DATABASE, {
  useFactory: () => new Database(),
  onActivation: (value, context) => {
    value.query();
    const resolved: Database = context.container.resolve(context.token);
    void resolved;
  },
  onDisposal: (value, context) => {
    value.query();
    const token: Token<Database> = context.token;
    const owner: Container = context.container;
    void token;
    void owner;
  },
  onDisposalAsync: async (value, context) => {
    value.query();
    void context.container;
  },
});

// @ts-expect-error activation receives the registered service type
container.rebind(DATABASE, { useValue: new Database(), onActivation: () => {} });

// @ts-expect-error borrowed values cannot own a disposal callback
container.rebind(DATABASE, { useValue: new Database(), onDisposal: () => {} });

// @ts-expect-error aliases cannot own a disposal callback
container.register(DATABASE, {
  useExisting: DATABASE,
  onDisposal: () => {},
});

container.rebind(DATABASE, {
  useFactory: () => new Database(),
  // @ts-expect-error disposal receives the registered service type
  onDisposal: (_value: Cache) => {},
});

container.rebind(DATABASE, {
  useFactory: () => new Database(),
  // @ts-expect-error async disposal must return a Promise-like value
  onDisposalAsync: () => {},
});

container.rebind(DATABASE, {
  useFactory: () => new Database(),
  // @ts-expect-error synchronous disposal cannot return a Promise
  onDisposal: async () => {},
});

container.rebind(DATABASE, {
  useFactory: () => new Database(),
  // @ts-expect-error activation must be synchronous
  onActivation: async () => {},
});

container.load((registry) => {
  registry.registerMulti(CACHE, { useValue: new Cache() });
  // @ts-expect-error modules keep the actual async callback boundary
  registry.register(BROAD_OBJECT, { useFactory: async () => ({}) });
  registry.register(NEEDS_DATABASE, {
    inject: [CACHE],
    // @ts-expect-error module factory parameters must match the dependency tuple
    useFactory: (database: Database) => new NeedsDatabase(database),
  });
  // @ts-expect-error module factory tuples cannot exceed callback arity
  registry.register(SURPLUS, {
    inject: [DATABASE],
    useFactory: () => new StaticSurplusDependency(),
  });
  // @ts-expect-error module class tuples cannot exceed constructor arity
  registry.registerMulti(SURPLUS, {
    inject: [DATABASE],
    useClass: StaticSurplusDependency,
  });
  // @ts-expect-error registration modules cannot escape to resolution APIs
  registry.resolve(CACHE);
});

// @ts-expect-error registration modules must be synchronous
container.load(async () => {});

// @ts-expect-error typed decorator dependencies must match the constructor
@Injectable({ inject: [DATABASE] })
class WrongDecoratedDependencies {
  constructor(_cache: Cache) {}
}
void WrongDecoratedDependencies;

// @ts-expect-error required constructors need an injection declaration
@Injectable()
class MissingDecoratedDependencies {
  constructor(_database: Database) {}
}
void MissingDecoratedDependencies;
