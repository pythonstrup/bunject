import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "bunject-package-smoke-"));
const consumerDirectory = join(temporaryDirectory, "consumer");

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd,
    env: {
      ...Bun.env,
      BUN_INSTALL_CACHE_DIR: join(temporaryDirectory, "cache"),
      NO_COLOR: "1",
      TMPDIR: temporaryDirectory,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed with exit code ${exitCode}.\n${stdout}${stderr}`,
    );
  }
}

try {
  await run(
    [
      "bun",
      "pm",
      "pack",
      "--filename",
      join(temporaryDirectory, "bunject.tgz"),
      "--quiet",
    ],
    root,
  );
  await mkdir(consumerDirectory);
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: { bunject: "file:../bunject.tgz" },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumerDirectory, "bun-consumer.ts"),
    `import { Container, Service, token } from "bunject";

const VALUE = token<number>("VALUE");

@Service({ scope: "singleton" })
class Application {
  static inject = [VALUE] as const;
  constructor(readonly value: number) {}
}

const container = new Container();
container.register(VALUE, { useValue: 42 });
container.register(Application);
const first = container.resolve(Application);
if (first.value !== 42 || first !== container.resolve(Application)) {
  throw new Error("Bun package consumer smoke test failed");
}
`,
  );
  await writeFile(
    join(consumerDirectory, "node-consumer.mjs"),
    `import { Container, token } from "bunject";

const VALUE = token("VALUE");
class Application {
  static inject = [VALUE];
  constructor(value) { this.value = value; }
}

const container = new Container();
container.register(VALUE, { useValue: 42 });
container.register(Application);
if (container.resolve(Application).value !== 42) {
  throw new Error("Node package consumer smoke test failed");
}
`,
  );
  await writeFile(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "ESNext.Decorators", "ESNext.Disposable"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
          types: [],
        },
        include: ["bun-consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );

  await run(["bun", "install", "--silent"], consumerDirectory);
  await run(
    ["bun", join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    consumerDirectory,
  );
  await run(["bun", "run", "bun-consumer.ts"], consumerDirectory);
  await run(["node", "node-consumer.mjs"], consumerDirectory);
  console.log("Package smoke test passed in Bun and Node.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
