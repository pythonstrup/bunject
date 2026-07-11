import {
  Container,
  Injectable,
  all,
  lazy,
  optional,
  resolver,
  token,
  type ClassProvider,
  type InjectionToken,
  type Lazy,
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
void database;

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

container.register(NEEDS_DATABASE, {
  inject: [DATABASE],
  useClass: NeedsDatabase,
});

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
container.register(DESCRIPTORS, {
  inject: [optional(DATABASE), all(CACHE), lazy(DATABASE)],
  useFactory: (database, caches, deferredDatabase) => {
    database?.query();
    caches[0]?.get();
    deferredDatabase.resolve().query();
    return [database, caches, deferredDatabase] as const;
  },
});

const ACTIVE_RESOLVER = token<Resolver>("ACTIVE_RESOLVER");
container.register(ACTIVE_RESOLVER, {
  inject: [resolver()],
  useFactory: (activeResolver) => {
    const resolved: Database = activeResolver.resolve(DATABASE);
    const allCaches: readonly Cache[] = activeResolver.resolveAll(CACHE);
    const pending: Promise<Database> = activeResolver.resolveAsync(DATABASE);
    const pendingAll: Promise<readonly Cache[]> =
      activeResolver.resolveAllAsync(CACHE);
    void resolved;
    void allCaches;
    void pending;
    void pendingAll;
    // @ts-expect-error a Resolver cannot mutate its container
    activeResolver.register(DATABASE, { useValue: new Database() });
    return activeResolver;
  },
});

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
  registry.register(NEEDS_DATABASE, {
    inject: [CACHE],
    // @ts-expect-error module factory parameters must match the dependency tuple
    useFactory: (database: Database) => new NeedsDatabase(database),
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
