import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "bunject-release-rehearsal-"),
);
const archive = join(temporaryDirectory, "bunject.tgz");
const metadata = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as { name: string; version: string };

function commandForPlatform(command: readonly string[]): string[] {
  return process.platform === "win32" && command[0] === "npm"
    ? ["cmd.exe", "/d", "/s", "/c", "npm.cmd", ...command.slice(1)]
    : [...command];
}

async function run(command: readonly string[]): Promise<void> {
  const child = Bun.spawn(commandForPlatform(command), {
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

async function capture(command: readonly string[]): Promise<string> {
  const child = Bun.spawn(commandForPlatform(command), {
    cwd: root,
    env: { ...Bun.env, NO_COLOR: "1", TMPDIR: temporaryDirectory },
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
  await run(["bun", "run", "scripts/project-check.ts"]);
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

  const result = JSON.parse(
    await capture([
      "npm",
      "publish",
      archive,
      "--dry-run",
      "--ignore-scripts",
      "--provenance",
      "--access",
      "public",
      "--json",
    ]),
  ) as {
    id?: unknown;
    integrity?: unknown;
    entryCount?: unknown;
  };
  const expectedId = `${metadata.name}@${metadata.version}`;
  if (
    result.id !== expectedId ||
    typeof result.integrity !== "string" ||
    !result.integrity.startsWith("sha512-") ||
    typeof result.entryCount !== "number" ||
    result.entryCount < 1
  ) {
    throw new Error(`npm publish --dry-run returned invalid metadata for ${expectedId}.`);
  }

  const sha256 = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  console.log(
    `Release rehearsal passed for ${expectedId}: ` +
      `${result.entryCount} files, sha256 ${sha256}.`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
