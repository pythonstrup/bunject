import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertStableRelease,
  isCalendarDate,
  parseProjectVersion,
} from "./project-metadata";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as { version?: unknown };
const projectVersion = parseProjectVersion(packageJson.version);
const version = projectVersion.value;

const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
const headingPrefix = `## ${version} - `;
const headings = changelog
  .split("\n")
  .filter((line) => line.startsWith(headingPrefix));

if (headings.length !== 1) {
  throw new Error(
    `CHANGELOG.md must contain exactly one heading for version ${version}.`,
  );
}

const release = process.argv.includes("--release");
const releaseDate = headings[0].slice(headingPrefix.length);
const validReleaseDate = isCalendarDate(releaseDate);
if (releaseDate !== "Unreleased" && !validReleaseDate) {
  throw new Error(
    `The ${version} changelog heading must end with Unreleased or YYYY-MM-DD.`,
  );
}

if (release) {
  assertStableRelease(projectVersion);
  const expectedTag = `v${version}`;
  if (process.env.RELEASE_TAG !== expectedTag) {
    throw new Error(
      `Release tag must be ${expectedTag}, received ${process.env.RELEASE_TAG ?? "nothing"}.`,
    );
  }
  if (releaseDate === "Unreleased") {
    throw new Error(`Finalize the ${version} changelog date before publishing.`);
  }
}

const declarations = [
  ...new Bun.Glob("**/*.d.ts").scanSync({
    absolute: true,
    cwd: dist,
    dot: true,
    onlyFiles: true,
  }),
].sort();
if (declarations.length === 0) {
  throw new Error("No emitted declarations were built.");
}
const actual = createHash("sha256");
for (const file of declarations) {
  actual
    .update(relative(dist, file).split(sep).join("/"))
    .update("\0")
    .update((await readFile(file, "utf8")).replaceAll("\r\n", "\n"))
    .update("\0");
}
const baseline = await readFile(join(root, "api/index.d.ts.sha256"), "utf8");
const expectedHash = baseline.trim();
const actualHash = actual.digest("hex");

if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
  throw new Error("api/index.d.ts.sha256 is not a SHA-256 hash.");
}
if (actualHash !== expectedHash) {
  throw new Error(
    `Emitted declarations changed (${expectedHash} -> ${actualHash}). Review the SemVer impact, update CHANGELOG.md, and refresh api/index.d.ts.sha256.`,
  );
}

console.log(`Project metadata and public API baseline match ${version}.`);
