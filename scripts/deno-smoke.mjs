import { Container, token } from "../dist/index.js";

const VALUE = token("VALUE");
const APPLICATION = token("APPLICATION");
const container = new Container();
container.register(VALUE, { useValue: 42 });
container.register(APPLICATION, {
  inject: [VALUE],
  useFactory: (value) => ({ value }),
});

if (container.resolve(APPLICATION).value !== 42) {
  throw new Error("Deno package smoke test failed");
}

await container.disposeAsync();
