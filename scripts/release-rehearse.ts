import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as { name: string; version: string };
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "bunject-release-rehearsal-"),
);
const archive = join(temporaryDirectory, "bunject.tgz");
const childEnvironment = {
  ...Bun.env,
  BUN_INSTALL_CACHE_DIR: join(temporaryDirectory, "bun-cache"),
  GITHUB_REPOSITORY: "pythonstrup/bunject",
  NO_COLOR: "1",
  RELEASE_PRERELEASE: "false",
  RELEASE_TAG: `v${metadata.version}`,
  TMPDIR: temporaryDirectory,
  npm_config_cache: join(temporaryDirectory, "npm-cache"),
  npm_config_registry: "https://registry.npmjs.org/",
  npm_config_userconfig: join(temporaryDirectory, "npmrc"),
};
const npm = ["bun", "x", "npm@11.18.0"] as const;

async function run(command: readonly string[]): Promise<void> {
  const child = Bun.spawn([...command], {
    cwd: root,
    env: childEnvironment,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}.`);
  }
}

async function capture(command: readonly string[]): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd: root,
    env: childEnvironment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (stderr) process.stderr.write(stderr);
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed with exit code ${exitCode}.\n${stdout}`,
    );
  }
  return stdout;
}

try {
  await run(["bun", "run", "build"]);
  await run(["bun", "run", "scripts/project-check.ts", "--release"]);
  await run([
    "bun",
    "pm",
    "pack",
    "--ignore-scripts",
    "--filename",
    archive,
    "--quiet",
  ]);
  await run(["bun", "run", "scripts/package-lint.ts", archive]);
  await run(["bun", "run", "scripts/package-smoke.ts", archive]);
  const archiveBytes = await readFile(archive);
  const expectedIntegrity = `sha512-${createHash("sha512")
    .update(archiveBytes)
    .digest("base64")}`;

  const report = JSON.parse(
    await capture([
      ...npm,
      "publish",
      archive,
      "--dry-run",
      "--ignore-scripts",
      "--provenance",
      "--access",
      "public",
      "--json",
    ]),
  ) as Record<
    string,
    {
      id?: unknown;
      integrity?: unknown;
      entryCount?: unknown;
    }
  >;
  const result = report[metadata.name];
  const expectedId = `${metadata.name}@${metadata.version}`;
  if (
    result?.id !== expectedId ||
    result.integrity !== expectedIntegrity ||
    typeof result.entryCount !== "number" ||
    result.entryCount < 1
  ) {
    throw new Error(
      `npm publish --dry-run returned invalid metadata for ${expectedId}.`,
    );
  }

  const sha256 = createHash("sha256")
    .update(archiveBytes)
    .digest("hex");
  console.log(
    `Release rehearsal passed for ${expectedId}: ` +
      `${result.entryCount} files, sha256 ${sha256}.`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
