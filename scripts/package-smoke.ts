import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "bunject-package-smoke-"));
const consumerDirectory = join(temporaryDirectory, "consumer");
const packageRoot = join(consumerDirectory, "node_modules", "bunject");
const suppliedArchive = process.argv[2]
  ? resolve(root, process.argv[2])
  : undefined;
const { version } = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as { version: string };
const archiveName = `bunject-${version}.tgz`;

async function run(command: string[], cwd: string): Promise<void> {
  const spawnCommand =
    process.platform === "win32" && command[0] === "npm"
      ? ["cmd.exe", "/d", "/s", "/c", "npm.cmd", ...command.slice(1)]
      : command;
  const child = Bun.spawn(spawnCommand, {
    cwd,
    env: {
      ...Bun.env,
      BUN_INSTALL_CACHE_DIR: join(temporaryDirectory, "cache"),
      NO_COLOR: "1",
      npm_config_cache: join(temporaryDirectory, "npm-cache"),
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

async function assertPackedMarkdownLinks(): Promise<void> {
  const markdownFiles: string[] = [];
  const collect = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.name.endsWith(".md")) markdownFiles.push(path);
    }
  };
  await collect(packageRoot);

  for (const file of markdownFiles) {
    const markdown = await readFile(file, "utf8");
    const targets: string[] = [];
    Bun.markdown.render(markdown, {
      link: (children, { href }) => {
        targets.push(href);
        return children;
      },
      image: (children, { src }) => {
        targets.push(src);
        return children;
      },
    });
    for (const target of targets) {
      if (
        target.startsWith("//") ||
        /^[A-Za-z][A-Za-z+.-]*:/.test(target)
      ) {
        continue;
      }
      const hash = target.indexOf("#");
      const beforeHash = hash === -1 ? target : target.slice(0, hash);
      const query = beforeHash.indexOf("?");
      const rawPath = query === -1 ? beforeHash : beforeHash.slice(0, query);
      if (!rawPath) continue;
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        throw new Error(
          `${relative(packageRoot, file)} has an invalid local link: ${target}`,
        );
      }
      const destination = resolve(dirname(file), decodedPath);
      const packagePath = relative(packageRoot, destination);
      if (
        packagePath === ".." ||
        packagePath.startsWith(`..${sep}`) ||
        isAbsolute(packagePath)
      ) {
        throw new Error(
          `${relative(packageRoot, file)} links outside the package: ${target}`,
        );
      }
      try {
        await access(destination);
      } catch {
        throw new Error(
          `${relative(packageRoot, file)} has a broken local link: ${target}`,
        );
      }
    }
  }
}

async function assertPackedPayload(): Promise<void> {
  const files = [
    ...new Bun.Glob("**/*").scanSync({
      cwd: packageRoot,
      dot: true,
      onlyFiles: true,
    }),
  ].map((file) => file.split(sep).join("/")).sort();
  const expected = [
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docs/api.md",
    "docs/bun-http.md",
    "docs/harness.md",
    "docs/maturity.md",
    "docs/migrations.md",
    "docs/support.md",
    "examples/bun-http.ts",
    "package.json",
    ...[
      "container",
      "dependencies",
      "errors",
      "index",
      "providers",
      "resolution",
      "types",
    ].flatMap((module) => [
      `dist/${module}.d.ts`,
      `dist/${module}.js`,
      `dist/${module}.js.map`,
    ]),
  ].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    throw new Error(
      `Packed payload files differ. Expected ${expected.join(", ")}; ` +
        `received ${files.join(", ")}.`,
    );
  }
}

try {
  if (suppliedArchive) {
    await copyFile(suppliedArchive, join(temporaryDirectory, archiveName));
  } else {
    await run(
      ["npm", "pack", "--pack-destination", temporaryDirectory, "--silent"],
      root,
    );
  }
  await mkdir(consumerDirectory);
  await copyFile(
    join(root, "scripts/runtime-smoke.mjs"),
    join(consumerDirectory, "runtime-smoke.mjs"),
  );
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: { bunject: `file:../${archiveName}` },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumerDirectory, "bun-consumer.ts"),
    `import { Container, Injectable, defineProvider, forwardRef, token, type DefinedProvider } from "bunject";

const VALUE = token<number>("VALUE");
const DOUBLE = token<number>("DOUBLE");
const MISSING = token<number>("MISSING");
const OBJECT = token<object>("OBJECT");
const ANY = token<any>("ANY");

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

class NoDependencies {}
class LooseThenService { then(): void {} }
const NO_DEPENDENCIES = token<NoDependencies>("NO_DEPENDENCIES");
const PROMISE_VALUE = token<Promise<number>>("PROMISE_VALUE");
interface OverloadedFactory {
  (value: number): number;
  (value: number, extra: number): number;
}
interface RiskyOverloadedFactory {
  (value: number): Promise<number>;
  (value?: number): object;
}
interface RiskyOverloadedConstructor {
  readonly prototype: object;
  new (value: number): PromiseLike<number>;
  new (value?: number): object;
}
declare const overloadedFactory: OverloadedFactory;
declare const riskyOverloadedFactory: RiskyOverloadedFactory;
declare const riskyOverloadedConstructor: RiskyOverloadedConstructor;
declare const forbiddenDefinedProvider: DefinedProvider<Promise<number>>;
const widenedValues: readonly (typeof VALUE)[] = [VALUE];

// @ts-expect-error decorator tuples cannot exceed constructor arity
@Injectable({ inject: [VALUE] })
class InvalidDecoratedDependencies {}

if (false) {
  // @ts-expect-error factory tuples cannot exceed callback arity
  new Container().register(VALUE, { inject: [VALUE], useFactory: () => 1 });
  // @ts-expect-error class tuples cannot exceed constructor arity
  new Container().register(NO_DEPENDENCIES, { inject: [VALUE], useClass: NoDependencies });
  // @ts-expect-error stored tuples cannot exceed callback arity
  defineProvider<number>()({ inject: [VALUE], useFactory: () => 1 });
  // @ts-expect-error overloaded factories use their final declared signature
  new Container().register(DOUBLE, { inject: [VALUE], useFactory: overloadedFactory });
  new Container().register(DOUBLE, { inject: [VALUE], useFactory: (value) => overloadedFactory(value) });
  new Container().register(DOUBLE, { inject: widenedValues, useFactory: (...values: number[]) => (values[0] ?? 0) * 2 });
  defineProvider<number>()({ inject: widenedValues, useFactory: (...values: number[]) => (values[0] ?? 0) * 2 });
  // @ts-expect-error widened arrays may be empty, so required parameters are unsafe
  new Container().register(DOUBLE, { inject: widenedValues, useFactory: (value: number) => value * 2 });
  // @ts-expect-error inferred synchronous providers cannot use async factories
  defineProvider({ inject: [VALUE], useFactory: async (value) => value * 2 });
  // @ts-expect-error defined providers cannot bypass Promise service rejection
  new Container().register(PROMISE_VALUE, forbiddenDefinedProvider);
  // @ts-expect-error any-typed tokens cannot hide Promise defined providers
  new Container().register(ANY, forbiddenDefinedProvider);
  // @ts-expect-error overlapping overloads require a single-signature wrapper
  new Container().register(OBJECT, { inject: [VALUE], useFactory: riskyOverloadedFactory });
  // @ts-expect-error inferred overloaded providers cannot misbrand their result
  defineProvider({ inject: [VALUE], useFactory: riskyOverloadedFactory });
  // @ts-expect-error structural constructor overloads require an adapter
  new Container().register(OBJECT, { inject: [VALUE], useClass: riskyOverloadedConstructor });
  // @ts-expect-error broad tokens still reject actual Promise values
  new Container().register(OBJECT, { useValue: Promise.resolve({}) });
  // @ts-expect-error broad tokens still reject actual async sync-factories
  new Container().register(OBJECT, { useFactory: async () => ({}) });
  // @ts-expect-error runtime-thenable values are rejected even without PromiseLike's full signature
  new Container().register(OBJECT, { useValue: new LooseThenService() });
  // @ts-expect-error runtime-thenable factories are rejected under broad tokens
  new Container().register(OBJECT, { useFactory: () => new LooseThenService() });
  // @ts-expect-error explicit builders retain actual async return types
  defineProvider<object>()({ inject: [], useFactory: async () => ({}) });
}

const container = new Container();
container.register(VALUE, { useValue: 42 });
container.register(DOUBLE, defineProvider<number>()({
  inject: [VALUE],
  useFactory: (value) => value * 2,
}));
container.register(ForwardDependency);
container.register(Application);
const first = container.resolve(Application);
if (
  first.value !== 42 ||
  !(first.dependency instanceof ForwardDependency) ||
  first !== container.resolve(Application) ||
  container.resolve(DOUBLE) !== 84 ||
  container.resolveOptional(MISSING) !== undefined ||
  await container.resolveOptionalAsync(MISSING) !== undefined
) {
  throw new Error("Bun package consumer smoke test failed");
}
`,
  );
  await writeFile(
    join(consumerDirectory, "node-consumer.mjs"),
    `import * as bunject from "bunject";
import { runRuntimeSmoke } from "./runtime-smoke.mjs";

await runRuntimeSmoke(bunject);
`,
  );
  await writeFile(
    join(consumerDirectory, "deep-import.mjs"),
    `let blocked = false;
try {
  await import("bunject/dist/container.js");
} catch (error) {
  blocked = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
}
if (!blocked) throw new Error("Package deep import was not blocked");
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
          outDir: "out",
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

  await run(
    ["npm", "install", "--silent", "--ignore-scripts", "--no-audit", "--no-fund"],
    consumerDirectory,
  );
  await assertPackedMarkdownLinks();
  await assertPackedPayload();
  await run(
    [
      "bun",
      join(root, "node_modules/typescript-5-4/bin/tsc"),
      "--noEmit",
      "-p",
      "tsconfig.json",
    ],
    consumerDirectory,
  );
  await run(
    ["bun", join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    consumerDirectory,
  );
  await run(["bun", "run", "bun-consumer.ts"], consumerDirectory);
  await run(["bun", "run", "node-consumer.mjs"], consumerDirectory);
  await run(["node", "out/bun-consumer.js"], consumerDirectory);
  await run(["node", "node-consumer.mjs"], consumerDirectory);
  await run(["node", "deep-import.mjs"], consumerDirectory);
  console.log(
    "npm-packed sync/async consumer smoke passed in Bun and Node.",
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
