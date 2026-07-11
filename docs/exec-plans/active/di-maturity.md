# DI library maturity

Status: active

## Objective

Raise Bunject to the locally verifiable feature, correctness, diagnostics,
packaging, and operational standard of established TypeScript DI containers.
Ecosystem adoption and battle-testing remain external evidence.

## Current evidence

- Bun 1.3.14 and minimum Bun 1.3.10 are configured.
- Runtime/type/property/stress/package/size/API gates pass on the current
  worktree: 159 tests, 97.62% overall lines, and 100% kernel lines.
- The activation-scoped `resolver()` descriptor and provider-level cleanup
  adapters have focused, type, coverage, packed-consumer, and combined-gate
  evidence.
- The agent map, architecture record, active plan, and mechanical harness check
  are present, and both focused and combined harness checks pass.
- npm registry currently has no public `bunject` package.
- GitHub remote, repository metadata, remote CI results, npm trusted publisher,
  and provenance publication are not configured or verified.

## Decisions

- Use `@Injectable`; do not add role stereotypes such as Controller/Repository.
- Keep registration explicit and container-local.
- Require an explicit dependency declaration even for zero-argument classes.
- Keep typed class/symbol tokens; use separate tokens instead of named bindings.
- Do not add snapshot/restore, global auto-registration, legacy decorators,
  circular proxies, or runtime dependencies without new evidence.
- Preserve sync/async API separation and deterministic ownership.
- Treat provider cleanup callbacks as the complete ownership contract when
  present: async-first for `disposeAsync`, sync-only for `dispose`, and no
  implicit Symbol callback in the same activation.
- Keep `load()` as atomic composition rather than a plugin lifecycle API.
  Binding/module handles and immediate deactivation stay additive follow-up
  work until a hot-reload or selective-unload use case justifies them.

## In progress

- Complete the final adversarial audits and commit the verified Git baseline.

## Remaining work

- Revisit existential tuple ergonomics for stored `Provider<T>` unions; inline
  providers and exact `FactoryProvider`/`ClassProvider` tuples are the current
  type-safe path.
- After a GitHub URL exists, add package identity metadata and verify remote CI,
  trusted publishing, and provenance.

## Exit criteria

- No reproducible local P0/P1 correctness or maturity gap remains.
- Every public contract has positive, negative, type, and package evidence
  proportional to its risk.
- `bun run check`, Deno smoke, benchmark, and adversarial audits pass.
- Git worktree is clean and the plan records any external-only evidence still
  missing.

## Progress

- 2026-07-11: established the Git baseline and production kernel gates.
- 2026-07-11: fixed concurrent construction/disposal/mutation correctness gaps.
- 2026-07-11: began established-container parity and agent-harness work.
- 2026-07-11: added the activation-scoped Resolver and its runtime/type tests.
- 2026-07-11: added the agent map, architecture record, execution-plan index,
  and mechanical documentation/invariant check; the full gate is still pending.
- 2026-07-11: added explicit provider cleanup adapters for third-party and
  primitive resources, including precedence, ownership, failure, and type tests.
- 2026-07-11: reviewed binding/module handles and deferred them: current
  composition has no correctness gap, while selective unload remains additive.
- 2026-07-11: reviewed the new 13,588-byte gzip runtime baseline and raised the
  release ceiling from 13 KiB to 14 KiB for the Resolver and cleanup contracts.
- 2026-07-11: passed the complete local merge gate, Deno 2.8.1 smoke, npm-packed
  Bun/Node consumers, and peer benchmark; final audits and commit remain.
