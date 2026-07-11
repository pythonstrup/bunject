import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as { version?: unknown };
const version = packageJson.version;
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

if (typeof version !== "string" || !semverPattern.test(version)) {
  throw new Error(`package.json contains an invalid SemVer version: ${version}`);
}

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
const parsedReleaseDate = new Date(`${releaseDate}T00:00:00.000Z`);
const validReleaseDate =
  !Number.isNaN(parsedReleaseDate.valueOf()) &&
  parsedReleaseDate.toISOString().slice(0, 10) === releaseDate;
if (releaseDate !== "Unreleased" && !validReleaseDate) {
  throw new Error(
    `The ${version} changelog heading must end with Unreleased or YYYY-MM-DD.`,
  );
}

if (release) {
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

const [declaration, baseline] = await Promise.all([
  readFile(join(root, "dist/index.d.ts")),
  readFile(join(root, "api/index.d.ts.sha256"), "utf8"),
]);
const expectedHash = baseline.trim();
const actualHash = createHash("sha256").update(declaration).digest("hex");

if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
  throw new Error("api/index.d.ts.sha256 is not a SHA-256 hash.");
}
if (actualHash !== expectedHash) {
  throw new Error(
    `Public declarations changed (${expectedHash} -> ${actualHash}). Review the SemVer impact, update CHANGELOG.md, and refresh api/index.d.ts.sha256.`,
  );
}

console.log(`Project metadata and public API baseline match ${version}.`);
