import "reflect-metadata";
import { asClass, createContainer as createAwilixContainer } from "awilix";
import { Container as InversifyContainer } from "inversify";
import { bench, do_not_optimize, run, summary } from "mitata";
import { container as tsyringeRoot } from "tsyringe";
import { Container, token } from "../src/index";

class Singleton {}
class Transient {}

const bunject = new Container();
bunject.register(Singleton, {
  inject: [],
  useClass: Singleton,
  scope: "singleton",
});
bunject.register(Transient, { inject: [], useClass: Transient });
bunject.resolve(Singleton);

const DEEP_LEAF = token<object>("DEEP_LEAF");
const DEEP_MIDDLE = token<object>("DEEP_MIDDLE");
const DEEP_ROOT = token<object>("DEEP_ROOT");
const REQUEST_VALUE = token<object>("REQUEST_VALUE");
bunject.register(DEEP_LEAF, { useFactory: () => ({}) });
bunject.register(DEEP_MIDDLE, {
  inject: [DEEP_LEAF],
  useFactory: (leaf) => ({ leaf }),
});
bunject.register(DEEP_ROOT, {
  inject: [DEEP_MIDDLE],
  useFactory: (middle) => ({ middle }),
});
bunject.register(REQUEST_VALUE, {
  scope: "scoped",
  useFactory: () => ({}),
});

const inversify = new InversifyContainer();
inversify.bind(Singleton).toSelf().inSingletonScope();
inversify.bind(Transient).toSelf().inTransientScope();
inversify.get(Singleton);

const tsyringe = tsyringeRoot.createChildContainer();
tsyringe.registerSingleton(Singleton, Singleton);
tsyringe.register(Transient, { useClass: Transient });
tsyringe.resolve(Singleton);

const awilix = createAwilixContainer();
awilix.register({
  singleton: asClass(Singleton).singleton(),
  transient: asClass(Transient).transient(),
});
awilix.resolve<Singleton>("singleton");

summary(() => {
  bench("bunject / warm singleton", () =>
    do_not_optimize(bunject.resolve(Singleton)),
  );
  bench("inversify / warm singleton", () =>
    do_not_optimize(inversify.get(Singleton)),
  );
  bench("tsyringe / warm singleton", () =>
    do_not_optimize(tsyringe.resolve(Singleton)),
  );
  bench("awilix / warm singleton", () =>
    do_not_optimize(awilix.resolve<Singleton>("singleton")),
  );
});

summary(() => {
  bench("bunject / transient class", () =>
    do_not_optimize(bunject.resolve(Transient)),
  );
  bench("inversify / transient class", () =>
    do_not_optimize(inversify.get(Transient)),
  );
  bench("tsyringe / transient class", () =>
    do_not_optimize(tsyringe.resolve(Transient)),
  );
  bench("awilix / transient class", () =>
    do_not_optimize(awilix.resolve<Transient>("transient")),
  );
});

summary(() => {
  bench("bunject / three-provider transient graph", () =>
    do_not_optimize(bunject.resolve(DEEP_ROOT)),
  );
  bench("bunject / request scope lifecycle", () => {
    const scope = bunject.createScope();
    do_not_optimize(scope.resolve(REQUEST_VALUE));
    scope.dispose();
  });
});

await run({ throw: true });
