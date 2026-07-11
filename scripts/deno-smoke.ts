import * as bunject from "bunject";
import { Container, Injectable, forwardRef, token } from "bunject";
import { runRuntimeSmoke } from "./runtime-smoke.mjs";

const VALUE = token<number>("DENO_DECORATOR_VALUE");

@Injectable({
  inject: [VALUE, forwardRef(() => ForwardDependency)],
  scope: "singleton",
})
class Application {
  constructor(
    readonly value: number,
    readonly dependency: ForwardDependency,
  ) {}
}

@Injectable()
class ForwardDependency {}

const container = new Container();
container.register(VALUE, { useValue: 42 });
container.register(ForwardDependency);
container.register(Application);
const application = container.resolve(Application);
if (
  application.value !== 42 ||
  !(application.dependency instanceof ForwardDependency) ||
  application !== container.resolve(Application)
) {
  throw new Error("Deno standard decorator smoke test failed");
}
await container.disposeAsync();

await runRuntimeSmoke(bunject);
