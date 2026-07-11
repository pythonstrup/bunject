# Bunject agent map

This file is a map, not a manual. Read the linked source of truth before
changing behavior.

## Start here

- [Architecture](./ARCHITECTURE.md): runtime flow, ownership, and invariants.
- [Public API](./docs/api.md): exported contracts and runtime boundaries.
- [Documentation index](./docs/index.md): product and operational knowledge.
- [Execution plans](./docs/exec-plans/README.md): current goals, decisions,
  evidence, and remaining work.
- [Maturity criteria](./docs/maturity.md): feature and engineering gates.
- [Harness](./docs/harness.md): the agent feedback loop and mechanical checks.
- [Contributing](./CONTRIBUTING.md): the human change and evidence workflow.

## Repository map

- `src/index.ts`: the explicit public facade; it contains no runtime kernel.
- `src/types.ts`, `src/dependencies.ts`, `src/providers.ts`, and `src/errors.ts`:
  focused type, descriptor, provider, and error leaves around the kernel.
- `src/resolution.ts`: container-state-free graph validation, inspection, and
  resolution bookkeeping; it is internal, not a package subpath.
- `src/container.ts`: the private-state container and lifecycle orchestrator.
- `test/`: runtime, type, property, stress, lifecycle, and package regressions.
- `scripts/`: package, API, size, release, compatibility, and harness checks.
- `bench/`: Bunject and peer microbenchmarks; evidence, not a fastest claim.
- `.github/workflows/`: configured CI and trusted-publishing release flow.
- `.github/ISSUE_TEMPLATE/bug.yml`: structured runtime bug evidence.

Only the package root is public. Source and emitted internal module paths are
implementation details and must not become package subpath exports.

## Working loop

1. Read `git status`, this map, the architecture, and the active plan.
2. Reproduce a defect with the smallest focused test before changing the kernel.
3. Fix the shared invariant, not one caller. Avoid new runtime dependencies.
4. Run focused tests and both supported TypeScript type checks.
5. Update the active plan, user docs, changelog, and API hash when affected.
6. Run `bun run check`; use `bun run bench:bunject` when a hot path changes.
7. Inspect `git diff --check` and commit one intentional, verified change.

## Commands

- `bun test test/<area>.test.ts`: focused runtime feedback.
- `bun run typecheck && bun run typecheck:min`: current and minimum TS.
- `bun run harness:check`: repository knowledge and invariant checks.
- `bun run check`: complete local merge gate.
- `bun run package:check`: npm-packed Bun and Node consumer smoke.
- `bun run test:deno`: Deno 2 consumer smoke when Deno is installed.
- `bun run example:check`: executable Bun HTTP request-scope example.
- `bun run bench:bunject`: Bunject-only hot-path evidence.
- `bun run bench`: informational peer benchmark context.

## Non-negotiable invariants

- Standard decorators only; never add legacy decorator or reflect metadata use.
- No global container, import-time registration, or runtime dependencies.
- Class dependencies are explicit through decorator, static, or provider tuples.
- Sync resolution never observes async providers or partially built cache entries.
- Singleton ownership is registration-owner-affine; scoped work uses the active child.
- Cached lifetimes cannot capture shorter or descendant-owned values.
- Mutations are atomic for every active lookup path and preserve unrelated caches.
- Owned resources are disposed once, in reverse acquisition order, with errors
  aggregated after all cleanup attempts.
- Public failures keep stable codes, paths, cycles, tokens, and causes.

If a new requirement conflicts with these invariants, record the decision in an
execution plan before changing code.
