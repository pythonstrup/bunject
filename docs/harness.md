# Harness and agent feedback loop

This repository adapts OpenAI's
[harness engineering](https://openai.com/ko-KR/index/harness-engineering/)
principles to a library rather than an interactive application.

## Readable state

`AGENTS.md` is a short map. Architecture, maturity criteria, execution state,
support policy, and examples live in focused versioned documents under `docs/`.
An agent should not need chat history or an external document to understand the
current design constraints and unfinished work.

## Executable feedback

The library has no UI or production observability stack, so its agent-readable
signals are:

- focused deterministic tests for a reported behavior;
- property and randomized stress tests for graph/scheduler behavior;
- current and pinned minimum TypeScript negative fixtures;
- npm-packed TypeScript 5.4/current, Bun, and Node consumers, packaged-document
  link validation, and a built self-package Deno compatibility smoke;
- package-lint, public declaration hash, and compressed-size gates;
- peer benchmarks for performance evidence;
- `harness:check` for repository maps, links, and design invariants.

`bun run check` is the complete local merge gate. It must produce actionable
errors without requiring a human to interpret hidden state. Run the Deno smoke
when Deno is installed, and run peer benchmarks when a hot path changes.

## Knowledge and plan discipline

Complex work gets a versioned plan in `docs/exec-plans/active/`. The plan records
the objective, decisions, evidence, and exit criteria. Completed plans move to
`completed/` in the same commit that closes their last requirement. Known gaps
must remain visible in the active plan or maturity checklist.

Documentation drift is a test failure. `scripts/harness-check.ts` verifies the
required map, active-plan shape, local inline Markdown file targets, the full
merge-gate composition, zero runtime dependencies, side-effect-free package
metadata, standard-decorator compiler settings, and banned reflection imports
across the source tree. It also requires the CI and release workflows, their
supported-runtime jobs, and the compatibility-gated OIDC provenance publish
contract.

## Change loop

```text
inspect state -> reproduce -> patch shared invariant -> focused check
  -> adversarial review -> update plan/docs/API artifacts -> full check -> commit
```

Add a new tool only when an agent cannot observe or verify an important outcome
with the existing loop. Prefer one repository-native script over another opaque
dependency.
