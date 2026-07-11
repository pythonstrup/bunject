import {
  Container,
  Service,
  all,
  lazy,
  optional,
  token,
  type ClassProvider,
  type InjectionToken,
  type Provider,
  type Lazy,
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
container.register(NEEDS_DATABASE, {
  inject: [DATABASE],
  useClass: NeedsDatabase,
});

container.register(NEEDS_DATABASE, {
  inject: [CACHE],
  // @ts-expect-error explicit dependency tuples must match the constructor
  useClass: NeedsDatabase,
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

container.rebind(DATABASE, {
  useFactory: () => new Database(),
  onActivation: (value, context) => {
    value.query();
    const resolved: Database = context.container.resolve(context.token);
    void resolved;
  },
});

// @ts-expect-error activation receives the registered service type
container.rebind(DATABASE, { useValue: new Database(), onActivation: () => {} });

container.load((registry) => {
  registry.registerMulti(CACHE, { useValue: new Cache() });
  // @ts-expect-error registration modules cannot escape to resolution APIs
  registry.resolve(CACHE);
});

// @ts-expect-error typed decorator dependencies must match the constructor
@Service({ inject: [DATABASE] })
class WrongDecoratedDependencies {
  constructor(_cache: Cache) {}
}
void WrongDecoratedDependencies;
