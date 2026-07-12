import { access, readdir, readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { isCalendarDate } from "./project-metadata";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
const sourceModules = [
  "src/index.ts",
  "src/types.ts",
  "src/dependencies.ts",
  "src/providers.ts",
  "src/errors.ts",
  "src/resolution.ts",
  "src/container.ts",
] as const;
const requiredFiles = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/ISSUE_TEMPLATE/bug.yml",
  "docs/index.md",
  "docs/api.md",
  "docs/harness.md",
  "docs/maturity.md",
  "docs/exec-plans/README.md",
  "examples/bun-http.ts",
  "examples/tsconfig.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.build.json",
  ...sourceModules,
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

const bugForm = Bun.YAML.parse(
  await readFile(join(root, ".github/ISSUE_TEMPLATE/bug.yml"), "utf8"),
) as {
  name?: unknown;
  description?: unknown;
  body?: Array<{
    id?: unknown;
    validations?: { required?: unknown };
  }>;
};
if (
  typeof bugForm.name !== "string" ||
  typeof bugForm.description !== "string"
) {
  failures.push("The bug issue form must have a name and description.");
}
for (const id of [
  "runtime",
  "runtime_version",
  "typescript_version",
  "reproduction",
  "error",
  "expected",
]) {
  const field = bugForm.body?.find((item) => item.id === id);
  if (field?.validations?.required !== true) {
    failures.push(`The bug issue form must require ${id}.`);
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

const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  files?: unknown;
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
if (JSON.stringify(Object.keys(packageJson.exports ?? {})) !== '["."]') {
  failures.push("package.json must expose only the root package entrypoint.");
}
const expectedPackageFiles = [
  "dist",
  "examples/bun-http.ts",
  "docs/api.md",
  "docs/bun-http.md",
  "docs/harness.md",
  "docs/maturity.md",
  "docs/migrations.md",
  "docs/support.md",
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
];
const packageFiles = Array.isArray(packageJson.files)
  ? [...packageJson.files].sort()
  : [];
if (
  JSON.stringify(packageFiles) !==
  JSON.stringify([...expectedPackageFiles].sort())
) {
  failures.push("package.json files must match the reviewed package allowlist.");
}
for (const script of [
  "bench:bunject",
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
const checkSteps = (packageJson.scripts?.["check"] ?? "")
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

interface WorkflowStep {
  readonly uses?: unknown;
  readonly run?: unknown;
  readonly with?: Record<string, unknown>;
  readonly env?: Record<string, unknown>;
  readonly if?: unknown;
  readonly "continue-on-error"?: unknown;
  readonly "working-directory"?: unknown;
  readonly shell?: unknown;
}

interface WorkflowJob {
  readonly uses?: unknown;
  readonly "runs-on"?: unknown;
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
  readonly steps?: readonly WorkflowStep[];
  readonly needs?: unknown;
  readonly if?: unknown;
  readonly environment?: unknown;
  readonly permissions?: Record<string, unknown>;
  readonly "continue-on-error"?: unknown;
  readonly defaults?: { readonly run?: unknown };
}

interface WorkflowDocument {
  readonly defaults?: { readonly run?: unknown };
  readonly jobs?: Record<string, WorkflowJob>;
}

const ciWorkflow = parseWorkflow(
  await readFile(join(root, ".github/workflows/ci.yml"), "utf8"),
);
const releaseWorkflow = parseWorkflow(
  await readFile(join(root, ".github/workflows/release.yml"), "utf8"),
);
for (const [name, workflow] of [
  ["CI", ciWorkflow],
  ["release", releaseWorkflow],
] as const) {
  if (workflow.defaults?.run !== undefined) {
    failures.push(`${name} workflow must not override run defaults.`);
  }
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const reference of [
      job.uses,
      ...(job.steps ?? []).map((step) => step.uses),
    ]) {
      if (reference === undefined) continue;
      if (
        typeof reference !== "string" ||
        !/^[^@\s]+@[0-9a-f]{40}$/.test(reference)
      ) {
        failures.push(
          `${name} ${jobName} action must use a full commit SHA: ${String(reference)}.`,
        );
      }
    }
  }
}
const compatibilityJobs = [
  "quality",
  "minimum-bun",
  "node-runtime",
  "windows-package",
  "deno-runtime",
] as const;
interface CompatibilityRequirement {
  readonly runsOn: string;
  readonly bunVersion: string;
  readonly nodeVersion?: string;
  readonly nodeMatrix?: readonly string[];
  readonly denoVersion?: string;
  readonly denoMatrix?: readonly string[];
  readonly commands: readonly string[];
}

const compatibilityRequirements = {
  quality: {
    runsOn: "ubuntu-latest",
    bunVersion: "latest",
    nodeVersion: "22",
    commands: ["bun ci", "bun run check"],
  },
  "minimum-bun": {
    runsOn: "ubuntu-latest",
    bunVersion: "1.3.10",
    nodeVersion: "22",
    commands: [
      "bun ci",
      "bun run typecheck",
      "bun test",
      "bun run package:check",
    ],
  },
  "node-runtime": {
    runsOn: "ubuntu-latest",
    bunVersion: "latest",
    nodeVersion: "${{ matrix.node }}",
    nodeMatrix: ["22", "24", "26"],
    commands: ["bun ci", "bun run package:check"],
  },
  "windows-package": {
    runsOn: "windows-latest",
    bunVersion: "latest",
    nodeVersion: "22",
    commands: ["bun ci", "bun run package:check"],
  },
  "deno-runtime": {
    runsOn: "ubuntu-latest",
    bunVersion: "latest",
    denoVersion: "${{ matrix.deno }}",
    denoMatrix: ["v2.0.0", "v2.x"],
    commands: ["bun ci", "bun run test:deno"],
  },
} as const satisfies Record<
  (typeof compatibilityJobs)[number],
  CompatibilityRequirement
>;
for (const [name, workflow] of [
  ["CI", ciWorkflow],
  ["release", releaseWorkflow],
] as const) {
  for (const jobName of compatibilityJobs) {
    const job = workflow.jobs?.[jobName];
    if (!job) {
      failures.push(`${name} workflow is missing the ${jobName} job.`);
      continue;
    }
    const requirement: CompatibilityRequirement =
      compatibilityRequirements[jobName];
    if (job["runs-on"] !== requirement.runsOn) {
      failures.push(
        `${name} ${jobName} must run on ${requirement.runsOn}.`,
      );
    }
    requireSafeJob(name, jobName, job);
    requireExactActions(
      name,
      jobName,
      job,
      requirement.denoVersion === undefined
        ? ["actions/checkout@", "oven-sh/setup-bun@", "actions/setup-node@"]
        : ["actions/checkout@", "oven-sh/setup-bun@", "denoland/setup-deno@"],
    );
    requireRunSteps(name, jobName, job, requirement.commands);
    requireExactActionInputs(name, jobName, job, "actions/checkout@", {});
    requireExactActionInputs(
      name,
      jobName,
      job,
      "oven-sh/setup-bun@",
      { "bun-version": requirement.bunVersion },
    );
    if (requirement.nodeVersion !== undefined) {
      requireExactActionInputs(
        name,
        jobName,
        job,
        "actions/setup-node@",
        { "node-version": requirement.nodeVersion },
      );
    }
    if (requirement.denoVersion !== undefined) {
      requireExactActionInputs(
        name,
        jobName,
        job,
        "denoland/setup-deno@",
        { "deno-version": requirement.denoVersion },
      );
    }
    if (requirement.nodeMatrix !== undefined) {
      requireMatrix(name, jobName, job, "node", requirement.nodeMatrix);
    }
    if (requirement.denoMatrix !== undefined) {
      requireMatrix(name, jobName, job, "deno", requirement.denoMatrix);
    }
  }
}
const publishJob = releaseWorkflow.jobs?.["publish"];
if (!publishJob) {
  failures.push("Release workflow is missing the publish job.");
} else {
  if (publishJob.if !== "github.event.release.prerelease == false") {
    failures.push("Release publish must reject GitHub prereleases at job level.");
  }
  if (publishJob.environment !== "npm") {
    failures.push("Release publish must use the npm environment.");
  }
  if (publishJob["runs-on"] !== "ubuntu-latest") {
    failures.push("Release publish must run on ubuntu-latest.");
  }
  if (
    publishJob["continue-on-error"] !== undefined &&
    publishJob["continue-on-error"] !== false
  ) {
    failures.push("Release publish must not suppress job failures.");
  }
  if (publishJob.defaults?.run !== undefined) {
    failures.push("Release publish must not override run defaults.");
  }
  if (publishJob.permissions?.["id-token"] !== "write") {
    failures.push("Release publish must grant id-token: write.");
  }
  if (!Array.isArray(publishJob.needs)) {
    failures.push("Release publish must list every compatibility dependency.");
  }
  for (const job of compatibilityJobs) {
    if (!Array.isArray(publishJob.needs) || !publishJob.needs.includes(job)) {
      failures.push(`Release publish must wait for ${job}.`);
    }
  }
  const releaseCheckStep = (publishJob.steps ?? []).find(
    (step) => normalizedRun(step) === "bun run release:check",
  );
  for (const [key, value] of [
    ["RELEASE_TAG", "${{ github.event.release.tag_name }}"],
    ["RELEASE_PRERELEASE", "${{ github.event.release.prerelease }}"],
    ["GITHUB_REPOSITORY", "${{ github.repository }}"],
  ] as const) {
    if (releaseCheckStep?.env?.[key] !== value) {
      failures.push(`Release publish is missing environment value ${key}.`);
    }
  }
  requireExactActions("release", "publish", publishJob, [
    "actions/checkout@",
    "oven-sh/setup-bun@",
    "actions/setup-node@",
  ]);
  requireExactActionInputs(
    "release",
    "publish",
    publishJob,
    "actions/checkout@",
    {},
  );
  requireExactActionInputs(
    "release",
    "publish",
    publishJob,
    "oven-sh/setup-bun@",
    { "bun-version": "1.3.14" },
  );
  requireExactActionInputs(
    "release",
    "publish",
    publishJob,
    "actions/setup-node@",
    {
      "node-version": "24",
      "registry-url": "https://registry.npmjs.org",
      "package-manager-cache": "false",
    },
  );
  requireRunSteps("release", "publish", publishJob, [
    "npm install --global npm@11.18.0",
    "bun ci",
    "bun run release:check",
    "bun pm pack --ignore-scripts --filename bunject.tgz --quiet",
    "bun run scripts/package-lint.ts bunject.tgz\n" +
      "bun run scripts/package-smoke.ts bunject.tgz",
    "npm publish ./bunject.tgz --provenance --access public",
  ]);
}

const tsconfig = JSON.parse(
  await readFile(join(root, "tsconfig.json"), "utf8"),
) as {
  compilerOptions?: Record<string, unknown>;
  exclude?: unknown;
  include?: unknown;
};
const buildTsconfig = JSON.parse(
  await readFile(join(root, "tsconfig.build.json"), "utf8"),
) as { compilerOptions?: Record<string, unknown> };
const exampleTsconfig = JSON.parse(
  await readFile(join(root, "examples/tsconfig.json"), "utf8"),
) as { include?: unknown };
if (tsconfig.compilerOptions?.["experimentalDecorators"] === true) {
  failures.push("Legacy experimentalDecorators must remain disabled.");
}
if (tsconfig.compilerOptions?.["emitDecoratorMetadata"] === true) {
  failures.push("emitDecoratorMetadata must remain disabled.");
}
if (buildTsconfig.compilerOptions?.["stripInternal"] !== true) {
  failures.push("Internal kernel declarations must be stripped from the build.");
}
for (const directory of ["src", "test", "scripts", "bench"]) {
  if (!Array.isArray(tsconfig.include) || !tsconfig.include.includes(directory)) {
    failures.push(`The main typecheck must include ${directory}.`);
  }
}
if (
  !Array.isArray(tsconfig.exclude) ||
  !tsconfig.exclude.includes("scripts/deno-smoke.ts")
) {
  failures.push("The Deno smoke must remain isolated under Deno's typechecker.");
}
if (
  !Array.isArray(exampleTsconfig.include) ||
  !exampleTsconfig.include.includes("./**/*")
) {
  failures.push("The example typecheck must include every TypeScript example.");
}

const sourceFiles: string[] = [];
async function collectSource(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectSource(path);
    else sourceFiles.push(path);
  }
}
await collectSource(join(root, "src"));
const actualSourceModules = sourceFiles
  .map((file) => relative(root, file).split(sep).join("/"))
  .sort();
if (
  JSON.stringify(actualSourceModules) !==
  JSON.stringify([...sourceModules].sort())
) {
  failures.push(
    `Source modules must be exactly: ${sourceModules.join(", ")}.`,
  );
}
for (const file of sourceFiles) {
  if (!file.endsWith(".ts")) continue;
  const source = await readFile(file, "utf8");
  const sourcePath = relative(root, file);
  const selfTypes =
    `// @ts-self-types="./${basename(file, ".ts")}.d.ts"`;
  if (!source.startsWith(`${selfTypes}\n`)) {
    failures.push(`${sourcePath} must start with ${selfTypes}.`);
  }
  for (const banned of ["reflect-metadata", "design:paramtypes"]) {
    if (source.includes(banned)) {
      failures.push(`${sourcePath} must not contain ${banned}.`);
    }
  }
  if (sourcePath !== "src/index.ts" && /["']\.\/index(?:\.js)?["']/.test(source)) {
    failures.push(`${sourcePath} must not import the public index barrel.`);
  }
  for (const match of source.matchAll(
    /(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g,
  )) {
    if (!match[1]!.endsWith(".js")) {
      failures.push(
        `${sourcePath} must use a .js extension for ${match[1]}.`,
      );
    }
  }
}
const publicIndex = await readFile(join(root, "src/index.ts"), "utf8");
if (/\bexport\s+(?:type\s+)?\*/.test(publicIndex)) {
  failures.push("src/index.ts must explicitly export the public surface.");
}

const ignoredDirectories = new Set([
  ".git",
  ".idea",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const markdownFiles: string[] = [];
const typeScriptFiles: string[] = [];
async function collectRepositoryFiles(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (
        ignoredDirectories.has(entry.name) ||
        entry.name.startsWith(".package-")
      ) {
        continue;
      }
      await collectRepositoryFiles(join(directory, entry.name));
    } else if (entry.name.endsWith(".md")) {
      markdownFiles.push(join(directory, entry.name));
    } else if (/\.(?:[cm]?ts|tsx)$/.test(entry.name)) {
      typeScriptFiles.push(join(directory, entry.name));
    }
  }
}
await collectRepositoryFiles(root);

for (const file of typeScriptFiles) {
  const repositoryPath = relative(root, file).split(sep).join("/");
  const coveredByMain = ["src", "test", "scripts", "bench"].some(
    (directory) =>
      repositoryPath !== "scripts/deno-smoke.ts" &&
      repositoryPath.startsWith(`${directory}/`),
  );
  const coveredByExamples = repositoryPath.startsWith("examples/");
  const coveredByDeno = repositoryPath === "scripts/deno-smoke.ts";
  if (!coveredByMain && !coveredByExamples && !coveredByDeno) {
    failures.push(
      `${repositoryPath} is outside the repository TypeScript checkers.`,
    );
  }
}

const markdownByFile = new Map(
  await Promise.all(
    markdownFiles.map(
      async (file) => [file, await readFile(file, "utf8")] as const,
    ),
  ),
);
const markdownEdges = new Map<string, Set<string>>();
const markdownFacts = new Map(
  [...markdownByFile].map(([file, markdown]) => [
    file,
    inspectMarkdown(markdown, file),
  ]),
);
const anchorsByFile = new Map(
  [...markdownFacts].map(([file, facts]) => [file, facts.anchors]),
);

for (const file of markdownFiles) {
  for (const { target, navigable } of markdownFacts.get(file)!.links) {
    await validateMarkdownTarget(file, target, navigable);
  }
}

const knowledgeRoots = [join(root, "AGENTS.md")];
const reachableMarkdown = new Set(knowledgeRoots);
const pendingMarkdown = [...knowledgeRoots];
while (pendingMarkdown.length > 0) {
  const file = pendingMarkdown.pop()!;
  for (const destination of markdownEdges.get(file) ?? []) {
    if (reachableMarkdown.has(destination)) continue;
    reachableMarkdown.add(destination);
    pendingMarkdown.push(destination);
  }
}
for (const file of markdownFiles) {
  if (!reachableMarkdown.has(file)) {
    failures.push(
      `${relative(root, file)} is not reachable from a repository knowledge root.`,
    );
  }
}

const planIndex = join(root, "docs/exec-plans/README.md");
const indexedPlans = markdownEdges.get(planIndex) ?? new Set<string>();
for (const [folder, status] of [
  ["active", "active"],
  ["completed", "complete"],
] as const) {
  const directory = join(root, "docs/exec-plans", folder);
  const plans = (await readDirectoryIfPresent(directory))
    .filter((file) => file.endsWith(".md"))
    .sort();
  for (const file of plans) {
    const path = join(directory, file);
    const repositoryPath = relative(root, path);
    const facts = markdownFacts.get(path)!;
    const planStructure = facts.structure;
    const planHeadings = [...planStructure.matchAll(/\0H([1-6]):([^\0]+)\0/g)].map(
      (match) => ({ level: Number(match[1]), text: match[2]! }),
    );
    if (!indexedPlans.has(path)) {
      failures.push(
        `${repositoryPath} must be linked from docs/exec-plans/README.md.`,
      );
    }
    const statuses = [...planStructure.matchAll(/^Status:\s*(\S+)\s*$/gm)];
    if (statuses.length !== 1 || statuses[0]![1] !== status) {
      failures.push(
        `${repositoryPath} must declare exactly one \`Status: ${status}\`.`,
      );
    }
    const sections = [
      "Objective",
      "Decisions",
      "Remaining work",
      "Exit criteria",
      "Progress",
    ];
    for (const heading of sections) {
      const matches = planHeadings.filter(
        (candidate) => candidate.level === 2 && candidate.text === heading,
      );
      if (matches.length !== 1 || !readSection(planStructure, heading)) {
        failures.push(`${repositoryPath} must contain one non-empty ## ${heading}.`);
      }
    }
    const evidenceHeadings = planHeadings.filter(
      (candidate) =>
        candidate.level === 2 && /^(?:Current )?[Ee]vidence$/.test(candidate.text),
    );
    const evidenceHeading = evidenceHeadings[0]?.text;
    if (
      evidenceHeadings.length !== 1 ||
      evidenceHeading === undefined ||
      !readSection(planStructure, evidenceHeading)
    ) {
      failures.push(`${repositoryPath} must contain one non-empty evidence section.`);
    }
    const progress = readSection(planStructure, "Progress");
    const entries = [...(progress?.matchAll(/\0I:([\s\S]*?)\0/g) ?? [])].map(
      (match) => match[1]!.trim(),
    );
    if (entries.length === 0) {
      failures.push(`${repositoryPath} must contain at least one progress entry.`);
    }
    for (const entry of entries) {
      const date = /^(\d{4}-\d{2}-\d{2}):\s+\S/.exec(entry)?.[1];
      if (date === undefined || !isCalendarDate(date)) {
        failures.push(
          `${repositoryPath} has an invalid progress entry; use \`- YYYY-MM-DD: ...\`.`,
        );
      }
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
  const uniqueFailures = [...new Set(failures)];
  throw new Error(`Harness check failed:\n- ${uniqueFailures.join("\n- ")}`);
}

function parseWorkflow(source: string): WorkflowDocument {
  const parsed: unknown = Bun.YAML.parse(source);
  return typeof parsed === "object" && parsed !== null
    ? (parsed as WorkflowDocument)
    : {};
}

function requireSafeJob(
  workflowName: string,
  jobName: string,
  job: WorkflowJob,
): void {
  if (job.if !== undefined) {
    failures.push(`${workflowName} ${jobName} must not be conditional.`);
  }
  if (
    job["continue-on-error"] !== undefined &&
    job["continue-on-error"] !== false
  ) {
    failures.push(`${workflowName} ${jobName} must not suppress failures.`);
  }
  if (job.defaults?.run !== undefined) {
    failures.push(`${workflowName} ${jobName} must not override run defaults.`);
  }
}

function requireSafeStep(
  workflowName: string,
  jobName: string,
  step: WorkflowStep,
  label: string,
): void {
  if (step.if !== undefined) {
    failures.push(`${workflowName} ${jobName} ${label} must not be conditional.`);
  }
  if (
    step["continue-on-error"] !== undefined &&
    step["continue-on-error"] !== false
  ) {
    failures.push(`${workflowName} ${jobName} ${label} must not suppress failures.`);
  }
  if (step["working-directory"] !== undefined || step.shell !== undefined) {
    failures.push(
      `${workflowName} ${jobName} ${label} must use the default execution context.`,
    );
  }
}

function requireAction(
  workflowName: string,
  jobName: string,
  job: WorkflowJob,
  action: string,
): WorkflowStep | undefined {
  const matches = (job.steps ?? []).filter(
    (candidate) =>
      typeof candidate.uses === "string" && candidate.uses.startsWith(action),
  );
  const step = matches[0];
  if (matches.length > 1) {
    failures.push(
      `${workflowName} ${jobName} must use action ${action} exactly once.`,
    );
  }
  if (!step) {
    failures.push(`${workflowName} ${jobName} is missing action ${action}.`);
    return undefined;
  }
  requireSafeStep(workflowName, jobName, step, action);
  return step;
}

function requireExactActions(
  workflowName: string,
  jobName: string,
  job: WorkflowJob,
  expected: readonly string[],
): void {
  const steps = (job.steps ?? []).filter(
    (step): step is WorkflowStep & { readonly uses: string } =>
      typeof step.uses === "string",
  );
  const exact =
    steps.length === expected.length &&
    steps.every((step, index) => step.uses.startsWith(expected[index]!));
  if (!exact) {
    failures.push(
      `${workflowName} ${jobName} actions must be exactly: ${expected.join(", ")}.`,
    );
  }
  for (const step of steps) {
    requireSafeStep(workflowName, jobName, step, `action ${step.uses}`);
  }
}

function normalizedRun(step: WorkflowStep): string | undefined {
  return typeof step.run === "string"
    ? step.run.replaceAll("\r\n", "\n").trim()
    : undefined;
}

function requireRunSteps(
  workflowName: string,
  jobName: string,
  job: WorkflowJob,
  commands: readonly string[],
): void {
  const steps = (job.steps ?? [])
    .map((step) => ({ command: normalizedRun(step), step }))
    .filter(
      (entry): entry is { command: string; step: WorkflowStep } =>
        entry.command !== undefined,
    );
  if (
    JSON.stringify(steps.map((entry) => entry.command)) !==
    JSON.stringify(commands)
  ) {
    failures.push(
      `${workflowName} ${jobName} run steps must be exactly: ${commands.join("; ")}.`,
    );
  }
  for (const { command, step } of steps) {
    requireSafeStep(workflowName, jobName, step, `run step ${command}`);
  }
}

function requireExactActionInputs(
  workflowName: string,
  jobName: string,
  job: WorkflowJob,
  action: string,
  expected: Readonly<Record<string, string>>,
): void {
  const step = requireAction(workflowName, jobName, job, action);
  const actualEntries = Object.entries(step?.with ?? {})
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    failures.push(
      `${workflowName} ${jobName} ${action} inputs must be exactly ${JSON.stringify(expected)}.`,
    );
  }
}

function requireMatrix(
  workflowName: string,
  jobName: string,
  job: WorkflowJob,
  key: string,
  expected: readonly string[],
): void {
  const actual = job.strategy?.matrix?.[key];
  const values = Array.isArray(actual) ? actual.map(String) : [];
  if (JSON.stringify(values) !== JSON.stringify(expected)) {
    failures.push(
      `${workflowName} ${jobName} matrix ${key} must be ${expected.join(", ")}.`,
    );
  }
}

async function readDirectoryIfPresent(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

interface MarkdownFacts {
  readonly anchors: Set<string>;
  readonly headings: Array<{ readonly level: number; readonly text: string }>;
  readonly links: Array<{ readonly target: string; readonly navigable: boolean }>;
  readonly structure: string;
}

function inspectMarkdown(markdown: string, file: string): MarkdownFacts {
  const anchors = new Set<string>();
  const headings: MarkdownFacts["headings"] = [];
  const links: MarkdownFacts["links"] = [];

  Bun.markdown.render(markdown, {
    heading: (children, { level }) => {
      headings.push({ level, text: children });
      const base = headingSlug(children);
      let anchor = base;
      let suffix = 0;
      while (anchors.has(anchor)) {
        suffix += 1;
        anchor = `${base}-${suffix}`;
      }
      anchors.add(anchor);
      return children;
    },
    link: (children, { href }) => {
      links.push({ target: href, navigable: true });
      return children;
    },
    image: (children, { src }) => {
      links.push({ target: src, navigable: false });
      return children;
    },
  });

  const structure = Bun.markdown.render(markdown, {
    heading: (children, { level }) => `\n\0H${level}:${children}\0\n`,
    paragraph: (children) => `${children}\n`,
    listItem: (children) => `\n\0I:${children}\0\n`,
    th: (children) => `${children}\n`,
    td: (children) => `${children}\n`,
    link: (children) => children,
    image: () => "",
    code: () => "",
    codespan: () => "\0C\0",
    html: () => "",
    blockquote: () => "",
  });
  for (const match of structure.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    failures.push(
      `${relative(root, file)} uses undefined reference [${match[2] || match[1]}].`,
    );
  }

  return { anchors, headings, links, structure };
}

function headingSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

async function validateMarkdownTarget(
  source: string,
  rawTarget: string,
  navigable: boolean,
): Promise<void> {
  const target = rawTarget.trim();
  if (
    !target ||
    target.startsWith("//") ||
    /^[A-Za-z][A-Za-z+.-]*:/.test(target)
  ) {
    return;
  }
  const hash = target.indexOf("#");
  const rawPath = hash === -1 ? target : target.slice(0, hash);
  const rawAnchor = hash === -1 ? "" : target.slice(hash + 1);
  let decodedPath: string;
  let decodedAnchor: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
    decodedAnchor = decodeURIComponent(rawAnchor);
  } catch {
    failures.push(`${relative(root, source)} has an invalid link: ${target}`);
    return;
  }
  const destination = rawPath ? resolve(dirname(source), decodedPath) : source;
  const repositoryPath = relative(root, destination);
  if (
    repositoryPath === ".." ||
    repositoryPath.startsWith(`..${sep}`) ||
    isAbsolute(repositoryPath)
  ) {
    failures.push(
      `${relative(root, source)} links outside the repository: ${target}`,
    );
    return;
  }
  try {
    await access(destination);
  } catch {
    failures.push(`${relative(root, source)} has a broken link: ${target}`);
    return;
  }
  if (destination.toLowerCase().endsWith(".md")) {
    if (navigable) {
      const edges = markdownEdges.get(source) ?? new Set<string>();
      edges.add(destination);
      markdownEdges.set(source, edges);
    }
    if (decodedAnchor) {
      if (!anchorsByFile.get(destination)?.has(decodedAnchor)) {
        failures.push(`${relative(root, source)} has a broken heading link: ${target}`);
      }
    }
  }
}

function readSection(markdown: string, heading: string): string | undefined {
  const marker = `\0H2:${heading}\0`;
  const start = markdown.indexOf(marker);
  if (start === -1) return undefined;
  const bodyStart = start + marker.length;
  const nextHeading = markdown.indexOf("\0H2:", bodyStart);
  const content = markdown
    .slice(bodyStart, nextHeading === -1 ? undefined : nextHeading)
    .trim();
  return content || undefined;
}
