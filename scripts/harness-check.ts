import { access, readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
const requiredFiles = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "README.md",
  "SECURITY.md",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  "docs/index.md",
  "docs/api.md",
  "docs/harness.md",
  "docs/maturity.md",
  "docs/exec-plans/README.md",
  "examples/bun-http.ts",
  "examples/tsconfig.json",
  "package.json",
  "tsconfig.json",
  "src/index.ts",
  "scripts/deno-smoke.ts",
  "scripts/runtime-smoke.mjs",
] as const;

for (const file of requiredFiles) {
  try {
    await access(join(root, file));
  } catch {
    failures.push(`Missing required harness input: ${file}`);
  }
}
if (failures.length > 0) throwHarnessFailure();

const agentMap = await readFile(join(root, "AGENTS.md"), "utf8");
if (agentMap.split("\n").length > 120) {
  failures.push("AGENTS.md must stay a short map of at most 120 lines.");
}
for (const target of [
  "ARCHITECTURE.md",
  "docs/index.md",
  "docs/exec-plans/README.md",
]) {
  if (!agentMap.includes(target)) {
    failures.push(`AGENTS.md must point to ${target}.`);
  }
}

const activePlanDirectory = join(root, "docs/exec-plans/active");
const activePlans = (await readDirectoryIfPresent(activePlanDirectory))
  .filter((file) => file.endsWith(".md"))
  .sort();
for (const file of activePlans) {
  const plan = await readFile(join(activePlanDirectory, file), "utf8");
  if (!plan.includes("Status: active")) {
    failures.push(`${file} must declare \`Status: active\`.`);
  }
  for (const heading of [
    "## Objective",
    "## Decisions",
    "## Remaining work",
    "## Exit criteria",
    "## Progress",
  ]) {
    if (!plan.includes(heading)) {
      failures.push(`${file} is missing ${heading}.`);
    }
  }
  if (!/^## (?:Current )?[Ee]vidence$/m.test(plan)) {
    failures.push(`${file} is missing an evidence section.`);
  }
}

const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  sideEffects?: unknown;
};
if (
  Object.keys(packageJson.dependencies ?? {}).length !== 0 ||
  Object.keys(packageJson.optionalDependencies ?? {}).length !== 0 ||
  Object.keys(packageJson.peerDependencies ?? {}).length !== 0
) {
  failures.push("Bunject must keep zero runtime dependencies.");
}
if (packageJson.sideEffects !== false) {
  failures.push("package.json must declare `sideEffects: false`.");
}
for (const script of [
  "check",
  "harness:check",
  "package:check",
  "release:check",
  "test:deno",
  "typecheck:min",
  "example:check",
]) {
  if (!packageJson.scripts?.[script]) {
    failures.push(`package.json is missing the ${script} script.`);
  }
}
const checkSteps = (packageJson.scripts?.check ?? "")
  .split("&&")
  .map((step) => step.trim());
for (const script of [
  "harness:check",
  "typecheck",
  "typecheck:min",
  "example:check",
  "test:coverage",
  "test:stress",
  "package:lint",
  "package:check",
  "size",
  "api:check",
]) {
  if (!checkSteps.includes(`bun run ${script}`)) {
    failures.push(`The complete check must run ${script}.`);
  }
}

const ciWorkflow = (
  await readFile(join(root, ".github/workflows/ci.yml"), "utf8")
).replaceAll("\r\n", "\n");
const releaseWorkflow = (
  await readFile(join(root, ".github/workflows/release.yml"), "utf8")
).replaceAll("\r\n", "\n");
const compatibilityJobs = [
  "quality",
  "minimum-bun",
  "node-runtime",
  "windows-package",
  "deno-runtime",
] as const;
for (const job of compatibilityJobs) {
  if (!ciWorkflow.includes(`\n  ${job}:\n`)) {
    failures.push(`CI workflow is missing the ${job} job.`);
  }
  if (!releaseWorkflow.includes(`\n  ${job}:\n`)) {
    failures.push(`Release workflow is missing the ${job} compatibility job.`);
  }
}
for (const marker of [
  "bun-version: 1.3.10",
  "node: [22, 24, 26]",
  "runs-on: windows-latest",
  "deno: [v2.0.0, v2.x]",
  "deno-version: ${{ matrix.deno }}",
  "bun run check",
  "bun run package:check",
  "bun run test:deno",
]) {
  if (!ciWorkflow.includes(marker)) {
    failures.push(`CI workflow is missing: ${marker}.`);
  }
  if (!releaseWorkflow.includes(marker)) {
    failures.push(`Release compatibility gates are missing: ${marker}.`);
  }
}
const publishIndex = releaseWorkflow.indexOf("\n  publish:\n");
const publishJob = publishIndex === -1
  ? ""
  : releaseWorkflow.slice(publishIndex);
if (!publishJob.includes("    needs:\n")) {
  failures.push("Release publish must depend on compatibility jobs.");
}
for (const job of compatibilityJobs) {
  if (!publishJob.includes(`      - ${job}\n`)) {
    failures.push(`Release publish must wait for ${job}.`);
  }
}
for (const marker of [
  "id-token: write",
  "bun run release:check",
  "npm publish --provenance --access public",
]) {
  if (!publishJob.includes(marker)) {
    failures.push(`Release publish is missing: ${marker}.`);
  }
}

const tsconfig = JSON.parse(
  await readFile(join(root, "tsconfig.json"), "utf8"),
) as { compilerOptions?: Record<string, unknown> };
if (tsconfig.compilerOptions?.experimentalDecorators === true) {
  failures.push("Legacy experimentalDecorators must remain disabled.");
}
if (tsconfig.compilerOptions?.emitDecoratorMetadata === true) {
  failures.push("emitDecoratorMetadata must remain disabled.");
}

const sourceFiles: string[] = [];
async function collectSource(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectSource(path);
    else if (entry.name.endsWith(".ts")) sourceFiles.push(path);
  }
}
await collectSource(join(root, "src"));
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  for (const banned of ["reflect-metadata", "design:paramtypes"]) {
    if (source.includes(banned)) {
      failures.push(`${relative(root, file)} must not contain ${banned}.`);
    }
  }
}

const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);
const markdownFiles: string[] = [];
async function collectMarkdown(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (
        ignoredDirectories.has(entry.name) ||
        entry.name.startsWith(".package-")
      ) {
        continue;
      }
      await collectMarkdown(join(directory, entry.name));
    } else if (entry.name.endsWith(".md")) {
      markdownFiles.push(join(directory, entry.name));
    }
  }
}
await collectMarkdown(root);

const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;
for (const file of markdownFiles) {
  const markdown = await readFile(file, "utf8");
  for (const match of markdown.matchAll(markdownLink)) {
    let target = match[1]!.trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    if (
      target.startsWith("#") ||
      /^[A-Za-z][A-Za-z+.-]*:/.test(target)
    ) {
      continue;
    }
    target = target.split("#", 1)[0]!;
    if (!target) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      failures.push(`${relative(root, file)} has an invalid link: ${target}`);
      continue;
    }
    const destination = resolve(dirname(file), decoded);
    const repositoryPath = relative(root, destination);
    if (
      repositoryPath === ".." ||
      repositoryPath.startsWith(`..${sep}`) ||
      isAbsolute(repositoryPath)
    ) {
      failures.push(`${relative(root, file)} links outside the repository: ${target}`);
      continue;
    }
    try {
      await access(destination);
    } catch {
      failures.push(`${relative(root, file)} has a broken link: ${target}`);
    }
  }
}

if (failures.length > 0) {
  throwHarnessFailure();
}

console.log(
  `Harness check passed: ${requiredFiles.length} required files and ` +
    `${markdownFiles.length} Markdown files verified.`,
);

function throwHarnessFailure(): never {
  throw new Error(`Harness check failed:\n- ${failures.join("\n- ")}`);
}

async function readDirectoryIfPresent(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
