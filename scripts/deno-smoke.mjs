import {
  Container,
  defineProvider,
  resolver,
  token,
} from "bunject";

const VALUE = token("VALUE");
const ASYNC_VALUE = token("ASYNC_VALUE");
const ASYNC_CONTEXT = token("ASYNC_CONTEXT");
const READER = token("READER");
const RESOLUTION_VALUE = token("RESOLUTION_VALUE");
const RESOURCE = token("RESOURCE");
let asyncCreations = 0;
let disposals = 0;
const container = new Container();
container.register(VALUE, { useValue: 42 });
container.register(ASYNC_VALUE, defineProvider()({
  inject: [],
  scope: "singleton",
  useFactoryAsync: async () => {
    await Promise.resolve();
    asyncCreations += 1;
    return { value: 84 };
  },
}));
container.register(RESOLUTION_VALUE, {
  scope: "resolution",
  useFactory: () => ({}),
});
container.register(ASYNC_CONTEXT, defineProvider()({
  inject: [resolver()],
  useFactoryAsync: async (activeResolver) => {
    await Promise.resolve();
    const first = activeResolver.resolve(RESOLUTION_VALUE);
    const second = activeResolver.resolve(RESOLUTION_VALUE);
    return { preserved: first === second };
  },
}));
container.register(READER, {
  inject: [resolver()],
  scope: "scoped",
  useFactory: (activeResolver) => ({
    hasValue: () => activeResolver.has(VALUE),
    read: () => activeResolver.resolve(VALUE),
    readAsync: () => activeResolver.resolveAsync(ASYNC_VALUE),
  }),
});
container.register(RESOURCE, {
  scope: "scoped",
  useFactory: () => ({}),
  onDisposalAsync: async () => {
    disposals += 1;
  },
});

const scope = container.createScope();
scope.register(VALUE, { useValue: 21 });
const reader = scope.resolve(READER);
const [first, second, contextResult] = await Promise.all([
  reader.readAsync(),
  reader.readAsync(),
  scope.resolveAsync(ASYNC_CONTEXT),
]);
scope.resolve(RESOURCE);

if (
  !reader.hasValue() ||
  reader.read() !== 21 ||
  first !== second ||
  first.value !== 84 ||
  !contextResult.preserved ||
  asyncCreations !== 1
) {
  throw new Error("Deno async resolution smoke test failed");
}

await scope.disposeAsync();
if (disposals !== 1) throw new Error("Deno disposal smoke test failed");
await container.disposeAsync();
