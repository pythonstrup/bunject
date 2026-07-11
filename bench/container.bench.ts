import "reflect-metadata";
import { asClass, createContainer as createAwilixContainer } from "awilix";
import { Container as InversifyContainer } from "inversify";
import { bench, run, summary } from "mitata";
import { container as tsyringeRoot } from "tsyringe";
import { Container } from "../src/index";

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
  bench("bunject / warm singleton", () => bunject.resolve(Singleton));
  bench("inversify / warm singleton", () => inversify.get(Singleton));
  bench("tsyringe / warm singleton", () => tsyringe.resolve(Singleton));
  bench("awilix / warm singleton", () =>
    awilix.resolve<Singleton>("singleton"),
  );
});

summary(() => {
  bench("bunject / transient class", () => bunject.resolve(Transient));
  bench("inversify / transient class", () => inversify.get(Transient));
  bench("tsyringe / transient class", () => tsyringe.resolve(Transient));
  bench("awilix / transient class", () =>
    awilix.resolve<Transient>("transient"),
  );
});

await run({ throw: true });
