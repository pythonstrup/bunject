# Harness and agent feedback loop

This repository adapts OpenAI's
[harness engineering](https://openai.com/ko-KR/index/harness-engineering/)
principles to a library rather than an interactive application.

## Readable state

`AGENTS.md` is a short map. `CLAUDE.md` is a thin Claude Code adapter that
imports that map, so Codex and Claude Code read one agent-neutral source of
truth. The checked-in Claude settings allow only repository feedback and
read-only Git commands; machine-local overrides stay ignored. Architecture,
maturity criteria, execution state,
support policy, and examples live in focused versioned documents under `docs/`.
An agent should not need chat history or an external document to understand the
current design constraints and unfinished work.

## Executable feedback

The library has no UI or production observability stack, so its agent-readable
signals are:

- focused deterministic tests for a reported behavior;
- property and randomized stress tests for graph/scheduler behavior;
- current and minimum TypeScript checks over source, tests, Bun harness scripts,
  and benchmarks, with the Deno smoke isolated under Deno's typechecker;
- current and pinned minimum TypeScript negative fixtures;
- npm-packed TypeScript 5.4/current consumers plus a shared Bun/Node async
  context, scope, disposal, inactive-microtask cycle, and independent-family
  isolation smoke, including mixed resolution/disposal cycle detection across
  coalesced provider sessions and scope/owner boundaries, with native Markdown
  validation of the installed documentation;
- standard-decorator and type-checked self-package smoke on Deno 2.0.0 and the
  current Deno 2 line;
- an executable, type-checked Bun HTTP request-scope example;
- package-lint, aggregate emitted-declaration hash, and aggregate emitted
  JavaScript/declaration compressed-size gates;
- isolated Bunject benchmarks plus informational peer context for performance
  evidence;
- `harness:check` for repository maps, links, TypeScript-checker coverage, and
  design invariants.

`bun run check` is the complete local merge gate. It must produce actionable
errors without requiring a human to interpret hidden state. Run the Deno smoke
when Deno is installed, and run isolated Bunject benchmarks when a hot path
changes.

## Knowledge and plan discipline

Complex work gets a versioned plan in `docs/exec-plans/active/`. The plan records
the objective, decisions, evidence, and exit criteria. Completed plans move to
`completed/` in the same commit that closes their last requirement. Known gaps
must remain visible in the active plan or maturity checklist.

Documentation drift is a test failure. `scripts/harness-check.ts` verifies the
required map; repository knowledge reachable from `AGENTS.md`; inline and
reference-style local Markdown files and heading anchors; indexed
active/completed plans with matching status, non-empty required sections, and
dated progress. These checks use Bun's native Markdown parser so code blocks,
nested lists, and reference links follow the runtime's real syntax without a
new package. The harness also verifies the full merge-gate composition; zero
runtime dependencies; side-effect-free package metadata;
standard-decorator compiler settings; and banned reflection imports across the
source tree. The source checks require the seven intentional module boundaries,
explicit root exports, `.js` relative import specifiers, and no internal import
through the public facade. They also require each emitted module's Deno
`@ts-self-types` declaration link. Package metadata keeps internal modules out
of the public export map, and Node consumer smoke rejects those subpaths.
Declaration hashing includes
every emitted `.d.ts` path and normalized content; size budgets aggregate every
emitted `.js` and `.d.ts` file so splitting cannot evade either gate. The
harness rejects repository TypeScript files outside the main, example, or Deno
checker domains so a new tool directory cannot silently become IDE-only. It
also parses the CI and release workflows with Bun's native YAML parser and
requires exact, ordered, failure-propagating commands in the default shell and
working directory of each supported-runtime job. Workflow- and job-level run
defaults are forbidden, and guarded actions must use their exact reviewed input
maps (including no checkout override) plus full-SHA external action pins; local
actions remain disallowed until their transitive references are checked. The
compatibility-gated OIDC contract must lint, consume, and publish the same
tarball. The same parser checks that the bug issue form requires the runtime,
runtime version, TypeScript version, reproduction, complete error, and expected
behavior. A release must be a stable GitHub release whose case-sensitive
repository coordinate matches package metadata; packing skips lifecycle
scripts so the already checked build is the exact build placed in the archive.

## Change loop

```text
inspect state -> reproduce -> patch shared invariant -> focused check
  -> adversarial review -> update plan/docs/API artifacts -> full check -> commit
```

Add a new tool only when an agent cannot observe or verify an important outcome
with the existing loop. Prefer one repository-native script over another opaque
dependency.
