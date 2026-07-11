import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(join(root, ".package-lint-"));
const suppliedTarball = process.argv[2]
  ? resolve(root, process.argv[2])
  : undefined;
const tarball = suppliedTarball ?? join(temporaryDirectory, "bunject.tgz");

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...Bun.env, NO_COLOR: "1", TMPDIR: temporaryDirectory },
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}.`);
  }
}

try {
  if (!suppliedTarball) {
    await run([
      "bun",
      "pm",
      "pack",
      "--filename",
      tarball,
      "--quiet",
    ]);
  }
  await run([join(root, "node_modules/.bin/publint"), tarball, "--strict"]);
  await run([
    join(root, "node_modules/.bin/attw"),
    tarball,
    "--profile",
    "esm-only",
  ]);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
