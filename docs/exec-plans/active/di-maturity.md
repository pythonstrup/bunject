# DI library maturity

Status: active

## Objective

Raise Bunject to the locally verifiable feature, correctness, diagnostics,
packaging, and operational standard of established TypeScript DI containers.
Ecosystem adoption and battle-testing remain external evidence.

## Current evidence

- Bun 1.3.14 and minimum Bun 1.3.10 are configured.
- The complete local merge gate passes on the current worktree: 161 tests,
  97.62% overall lines, and 100% kernel lines.
- Verified runtime, public API, packaging, and harness changes are committed in
  `6db7b3e`.
- The activation-scoped `resolver()` descriptor and provider-level cleanup
  adapters have focused, type, coverage, packed-consumer, and combined-gate
  evidence.
- `defineProvider()` preserves dependency tuple checks for stored reusable
  provider definitions on TypeScript 5.4 and current TypeScript without a
  runtime wrapper. The injected Resolver now also exposes tracked `has()`.
- The shipped public API reference, declaration documentation, recursive
  packed-document link check, clean build, explicit TypeScript 5.4 packed
  consumer, expanded Deno smoke, benchmark policy, and Windows package job are
  present and pass their available local checks.
- npm publication now waits for latest/minimum Bun, Node 22/24/26, Windows, and
  Deno compatibility jobs; the repository harness mechanically checks that
  release dependency and its OIDC provenance markers.
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
- Preserve local binding-set shadowing. Parent/child chained multi-resolution
  remains an additive option until a concrete shared-hook aggregation use case
  justifies changing every multi-resolution surface consistently.
- Use `defineProvider<T>()` for stored dependency-bearing definitions instead
  of weakening `Provider<T>` or its negative type checks.

## In progress

- Commit the locally verified result and record its Git baseline.

## Remaining work

- Add opt-in chained parent/child multi-resolution only when a concrete
  aggregation use case justifies its cross-cutting semantics.
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
  Bun/Node consumers, and peer benchmark before the final audits.
- 2026-07-11: completed independent runtime, type, and release audits with no
  remaining P0/P1 findings and no new P2 beyond the documented stored-provider
  tuple ergonomics, then committed baseline `6db7b3e`.
- 2026-07-11: added the opaque `DefinedProvider<T>`/`defineProvider()` path and
  verified reusable class, sync-factory, and async-factory definitions on
  TypeScript 5.4 and current TypeScript.
- 2026-07-11: added tracked `Resolver.has()`, a shipped API reference and TSDoc,
  recursive packed-document validation, explicit packed TypeScript 5.4 checks,
  clean build output, richer Deno coverage, a Windows package job, and a
  documented representative benchmark policy.
- 2026-07-11: retained the 14 KiB runtime gzip ceiling and raised only the
  declaration ceiling from 3 KiB to 4 KiB for the documented public API.
- 2026-07-11: passed the complete local merge gate, Deno 2.8.1 built-artifact
  smoke, npm-packed TypeScript/Bun/Node consumers, and representative peer
  benchmark with the final public surface.
- 2026-07-11: closed final audit findings by preserving the selected provider
  variant, guarding injected `Resolver.has()` after disposal, testing Deno
  async-local propagation through the package self-reference, and making npm
  publication wait for every supported-runtime compatibility job.
- 2026-07-11: repeated independent runtime, type/API, and release/harness audits
  after the fixes; no local P0, P1, or P2 finding remains.
- 2026-07-11: made benchmark results observable through Mitata's optimization
  barrier and replaced volatile peer-ratio claims with an absolute policy.
