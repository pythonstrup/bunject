# DI library maturity

Status: active

## Objective

Raise Bunject to the locally verifiable feature, correctness, diagnostics,
packaging, and operational standard of established TypeScript DI containers.
Ecosystem adoption and battle-testing remain external evidence.

## Current evidence

- Bun 1.3.14 and minimum Bun 1.3.10 are configured.
- The complete local merge gate passes: 183 tests and 11,016 assertions with
  99.11% overall lines and 99.91% functions. The private-state Container and
  every focused leaf retain 100% line coverage; the extracted resolution kernel
  has 95.05% lines and 100% functions.
- The verified runtime, public API, packaging, compatibility, and harness
  baseline is committed through `aa20a50`.
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
  release dependency and its exact-tarball OIDC provenance markers.
- Packed consumers now run the same concurrent async-context, error-path,
  singleton-coalescing, scope, and disposal scenario under Bun and Node. Deno
  2.0.0 and 2.8.1 pass type, standard-decorator, and runtime checks locally.
- Bun 1.3.10 passes the source typecheck, all 183 tests, and the installed
  packed-consumer smoke locally.
- Container and Resolver optional sync/async resolution preserve every visible
  provider failure and track absent dynamic edges for cache invalidation.
- Opt-in chained multi-resolution aggregates child-to-root binding sets across
  Container, Resolver, descriptors, validation, inspection, and mutation while
  nearest-set shadowing remains the default.
- Exact-case, peer-free five-process A/B measurements reduced the
  warm-singleton median from 138.84 ns to 62.11 ns and the transient-class
  median from 217.01 ns to 150.16 ns on Bun 1.3.14; both before/after ranges
  were disjoint.
- Registration now rejects null class dependency tuples and borrowed-provider
  options, while activation, registration-module, and disposal callbacks enforce
  their declared runtime return contracts.
- Every public package declaration and method group has IDE-visible TSDoc, and
  the Bun HTTP request-scope example is type-checked and executable.
- The agent map, architecture record, active plan, and mechanical harness check
  are present, and both focused and combined harness checks pass.
- npm registry currently has no public `bunject` package or release.
- The public `pythonstrup/bunject` repository and exact package identity
  metadata now exist. Its [first CI run][first-public-ci] passed quality,
  minimum Bun, Node 22/24/26, and Deno 2.0/latest; Windows exposed an npm shim
  lookup bug.
- npm trusted publisher and provenance publication are not configured or
  verified, and private vulnerability reporting is still disabled.

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
- Preserve local binding-set shadowing by default. Opt-in chained
  multi-resolution supports root-level common hooks plus feature/request hooks,
  ordered child-to-parent with local registration order preserved.
- Use `defineProvider<T>()` for stored dependency-bearing definitions instead
  of weakening `Provider<T>` or its negative type checks.
- Optional resolution represents absence as `undefined` but never translates a
  visible provider error; use `has()` when `T` itself can be `undefined` and
  presence must be distinguished.
- Function tokens, `useClass` values, and dependency tuples must contain only
  constructible class functions at registration.
- Defer token-level observers until a consumer can state whether it needs
  cache-hit events, hierarchy propagation, value transformation, async hooks,
  and callback lifetime. Inversify activation and TSyringe interception do not
  share one minimal contract, while provider `onActivation` already covers
  deterministic creation-time initialization.
- Pack a release once, lint and consume that exact archive, then pass the same
  file to `npm publish`; do not rebuild an unverified publication artifact.
- Keep the source boundary to seven files: an explicit `index.ts` public facade;
  `types.ts`, `dependencies.ts`, `providers.ts`, and `errors.ts` leaves; a
  container-state-free `resolution.ts` kernel; and one private-state
  `container.ts` orchestrator. Do not expose internal modules as package
  subpaths or introduce runtime dependencies for this split.
- Strip internal resolution declarations from the build. The module still emits
  an empty sibling declaration for Deno self-types, while the aggregate API hash
  continues to cover that path.
- Hash the path and normalized content of every emitted declaration, and apply
  compressed-size budgets to the aggregate emitted JavaScript and declaration
  sets so modularization cannot bypass the existing gates.
- Use reviewed aggregate gzip ceilings of 16 KiB for runtime JavaScript and
  6 KiB for declarations. They cover module framing and compressor variation
  while remaining small enough to catch material growth.
- Keep each source module's `@ts-self-types` link aligned with its emitted
  sibling declaration because Deno does not infer adjacent `.d.ts` files.
- Cache only successful class-token validation by identity; once accepted, a
  token remains a stable map identity even if a revocable wrapper later loses
  construction access. Class providers still recheck constructibility whenever
  they are registered.
- Compare hot paths with exact-case filters in fresh processes and report the
  median and spread. Mixed-case and peer ratios remain informational because
  JIT specialization changes their results materially.
- Enforce `undefined` results from activation, synchronous disposal, and
  registration-module callbacks, and an `undefined` fulfillment from async
  disposal callbacks, matching the public callback types.

## In progress

- Close the Windows packed-consumer failure, rerun the public compatibility
  matrix, enable private vulnerability reporting, then bootstrap the first npm
  version with maintainer 2FA and a trusted publisher.

## Remaining work

- Add token-level observers only after a concrete instrumentation consumer
  defines cache-hit, hierarchy, async, cardinality, and removal semantics.
- Compare declarations against the previous published tarball after the first
  release; the current hash is deliberately a drift/review gate, not a SemVer
  compatibility proof.
- Enable private vulnerability reporting and replace the provisional security
  route with the final advisory URL or a monitored fallback contact.
- Add a class-token forward-reference helper only after release blockers. Typed
  symbol tokens already avoid ESM declaration-order cycles; the helper is an
  ergonomic improvement and must not create circular proxies.

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
- 2026-07-11: committed the verified public API and release-harness baseline as
  `1dca27b`.
- 2026-07-11: added first-class optional sync/async resolution to Container and
  Resolver with absence mutation tracking and shared-path failure semantics.
- 2026-07-11: rejected non-constructible function tokens and class providers at
  registration, before graph activation can begin.
- 2026-07-11: expanded packed Bun/Node and minimum-Bun compatibility evidence,
  added Deno 2.0.0/latest typed decorator checks, and made the Bun HTTP example
  executable in the complete merge gate.
- 2026-07-11: completed declaration TSDoc coverage, corrected SemVer evidence
  wording, and raised reviewed gzip ceilings to 15 KiB runtime / 5 KiB types.
- 2026-07-11: passed the complete 163-test merge gate and local Deno 2.0.0 and
  2.8.1 checks with the final worktree surface.
- 2026-07-11: passed the representative benchmark and independent optional API,
  public declaration, and cross-runtime/package audits with no remaining local
  P0, P1, or P2 finding in the changed surface.
- 2026-07-11: committed the optional-resolution and runtime-compatibility
  baseline as `6245c8a`.
- 2026-07-11: independently compared token-level observation with Inversify
  activation and TSyringe interception, then deferred it because their
  creation/cache-hit, transform, async, and hierarchy contracts diverge and a
  creation-only hook would duplicate Bunject's provider `onActivation`.
- 2026-07-11: added a shrinking mutation-sequence property model that checks
  transitive singleton invalidation, unrelated-cache identity, factory
  cardinality, and repeated cache hits against an independent DAG oracle.
- 2026-07-11: hardened the repository harness with AGENTS-rooted knowledge
  reachability, native Bun Markdown reference/anchor checks, and indexed active
  or completed plan structure with real calendar dates, without a new package.
- 2026-07-11: adversarially verified broken anchors, orphan documents, invalid
  plan dates, non-prose fake links, balanced/angle-bracket paths, fenced plan
  examples, and duplicate heading collisions; reran the 164-test full gate,
  Bun 1.3.10 property/harness checks, both supported Deno versions, and the peer
  benchmark.
- 2026-07-11: closed every P1/P2 from the independent correctness and
  over-engineering reviews, directly verified the native harness under Bun
  1.3.10, and passed the final 164-test complete gate with no remaining local
  P0, P1, or P2 finding in the changed surface.
- 2026-07-11: committed the mutation-model and repository-harness baseline as
  `62a3ffa`.
- 2026-07-11: rejected non-constructible functions in direct and descriptor
  dependency tuples at registration and reran all 164 tests, the harness, and
  the installed packed-consumer smoke under Bun 1.3.10.
- 2026-07-11: made package lint and consumer smoke accept a supplied archive,
  validated installed reference-style documentation with Bun's Markdown parser,
  and made release publication verify and publish the same packed tarball.
- 2026-07-11: adversarially confirmed that an unshipped reference-style document
  target now fails the installed-tarball smoke before publication.
- 2026-07-11: added opt-in chained child-to-root multi-resolution consistently
  across Container and Resolver sync/async calls, `all()` descriptors,
  validation, inspection, lifetime ownership, and mutation invalidation while
  keeping nearest-set shadowing as the default.
- 2026-07-11: hardened chained preflight, descriptor snapshots, async option
  failures, and scoped cache retirement from four independent adversarial
  findings; all 174 tests pass on Bun 1.3.10 and 1.3.14, both supported Deno
  versions pass, and packed Bun/Node consumers pass.
- 2026-07-11: passed the complete merge gate, supported Deno smoke, peer
  benchmark, and two final independent reviews, then committed the chained
  multi-resolution baseline as `dcb872a`.
- 2026-07-11: began the six-file source modularization after the single source
  crossed the practical navigation and review threshold; verification and a
  commit remain pending.
- 2026-07-11: measured the modular output at 15,360 runtime and 5,484
  declaration gzip bytes, then set reviewed aggregate ceilings of 16 KiB and
  6 KiB rather than depending on a zero-headroom compressor result.
- 2026-07-11: added per-module `@ts-self-types` links after Deno correctly
  rejected TypeScript's adjacent-declaration assumption; Deno 2.0.0 and 2.8.1
  then passed type and runtime smoke.
- 2026-07-11: completed the six-file modularization gate with 175 passing tests,
  99.32% overall line coverage, 100% lines in every source module, current and
  minimum Bun, Node packed consumers, Deno 2.0.0 and 2.8.1, TypeScript current
  and 5.4, aggregate API/size checks, and adversarial hidden-file and payload
  mutations. Independent source and harness reviews found no remaining P0-P3
  issue.
- 2026-07-11: committed the verified modular runtime and aggregate package
  harness baseline as `5e3ea44`; `index.ts` is now a 61-line explicit public
  facade over five internal modules.
- 2026-07-11: profiled the public sync path with Bun's native CPU profiler and
  independently repeated exact-case A/B runs in five fresh processes per
  version. Positive token validation caching, empty-root path construction, and
  validation-set fast gates reduced warm singleton by 55.3% and transient class
  by 30.8% without changing provider construction checks.
- 2026-07-11: an independent maturity audit found and closed null `inject`,
  borrowed-provider option, and callback-return validation gaps; added focused
  positive and negative runtime evidence without a dependency or public API
  addition.
- 2026-07-11: passed the complete 179-test gate with 99.32% overall line
  coverage and 100% lines in every source module, all 179 tests plus package
  and size checks on Bun 1.3.10, packed Bun/Node consumption, Deno 2.0.0 and
  2.8.1 type/runtime smoke, TypeScript current and 5.4, isolated and peer
  benchmarks, and final independent contract, harness, and minimality reviews.
- 2026-07-11: committed the verified profile-guided resolution, runtime-boundary
  validation, and peer-free benchmark baseline as `d6014f1`.
- 2026-07-11: added a human contribution guide and a native-YAML bug issue form
  that requires runtime, TypeScript, reproduction, complete-error, and expected
  behavior evidence without another dependency.
- 2026-07-11: made publication fail closed for GitHub prereleases and missing or
  case-mismatched repository metadata, and made release packing skip lifecycle
  scripts so it cannot rebuild the already verified output.
- 2026-07-11: exercised the release gate with synthetic coordinates: unfinished
  changelog, wrong tag, prerelease, and repository mismatch all failed; the
  valid path produced one 33-file archive that passed package lint, Bun/Node
  consumption, and npm 11.18.0 `--dry-run`. Actual OIDC and provenance remain
  remote-only evidence.
- 2026-07-11: extracted graph traversal, construction waits, resolution context,
  runtime dependency collection, and lifetime bookkeeping into the internal
  `resolution.ts` kernel. `container.ts` fell from 3,087 to 2,544 lines while
  remaining the sole owner of registry, cache, hierarchy, mutation, ownership,
  and lifecycle state.
- 2026-07-11: verified the seven-module artifact with the complete 183-test gate,
  all tests and package/size checks on Bun 1.3.10, TypeScript current and 5.4,
  packed Bun/Node consumers, and Deno 2.0.0 and 2.8.1. Aggregate size is 16,140
  runtime and 5,490 declaration gzip bytes on Bun 1.3.14; public declarations
  are byte-for-byte unchanged apart from the new empty internal declaration
  path.
- 2026-07-11: independent five-process exact-case measurements found no material
  modularization regression: warm singleton median 63.27 ns versus the recorded
  62.11 ns, and transient class median 146.47 ns versus 150.16 ns, both within
  prior measurement noise.
- 2026-07-11: three independent final reviews found no remaining local P0-P3
  issue after returning validation-cache ownership to `Container`; committed the
  verified resolution-kernel, contributor-intake, and release-hardening baseline
  as `b83bace`.
- 2026-07-11: reproduced nine strict TypeScript errors hidden by the root
  config's `src`/`test`-only coverage, corrected the harness and release checks,
  and extended current and minimum TypeScript validation to Bun scripts and the
  benchmark while keeping the Deno smoke under Deno's native typechecker.
- 2026-07-11: made orphan TypeScript files a harness failure, broadened example
  discovery, and verified zero diagnostics on TypeScript 7.0.2, the IntelliJ
  5.9.3 service, and TypeScript 5.4.5. The complete 183-test gate and Deno 2.0.0
  and 2.8.1 type/runtime smoke also pass.
- 2026-07-11: created and audited the public `pythonstrup/bunject` baseline.
  Its first CI run passed quality, minimum Bun, Node 22/24/26, and both Deno
  jobs; Windows failed because Bun could not spawn the extensionless npm shim.
- 2026-07-11: mapped npm to `npm.cmd` only on Windows, fixed final repository
  package metadata, and made ordinary API checks reject repository identity
  drift before a release event.

[first-public-ci]: https://github.com/pythonstrup/bunject/actions/runs/29155458515
