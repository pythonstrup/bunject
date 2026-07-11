# Production maturity criteria

Bunject measures feature and engineering parity, not download counts. A
capability is part of the core gate when it appears in several established
TypeScript containers or is required by Bunject's explicit async and standard
decorator model.

Reference implementations:

- [InversifyJS](https://inversify.io/docs/api/container/)
- [TSyringe](https://github.com/microsoft/tsyringe#readme)
- [TypeDI](https://github.com/typestack/typedi)
- [Awilix](https://github.com/jeffijoe/awilix#readme)
- [TypeDI++](https://typedi.js.org/api-reference/)
- [Wyrly](https://github.com/valid-lab/wyrly)

## Production kernel

- [x] Class, value, sync factory, async factory, and alias providers
- [x] Singleton, scoped, resolution, and transient lifetimes
- [x] Nested child containers with owner-safe singleton behavior
- [x] Typed class/symbol tokens, checked dependency tuples, and reusable
  `defineProvider()` definitions
- [x] Standard decorators without reflect metadata or global registration
- [x] Multi-binding and nearest or opt-in chained sync/async `resolveAll`
- [x] Optional, all, and lifetime-safe lazy descriptors
- [x] First-class optional sync/async resolution on containers and resolvers
- [x] Read-only activation-scoped resolver for availability and dynamic
  single/multi lookup
- [x] Captive dependency validation for declared and dynamic graphs
- [x] Sync/async graph separation and concurrent cache coalescing
- [x] Preflight missing, ambiguity, async, lifetime, and cycle validation
- [x] Full dynamic dependency paths, stable error codes, cycles, and causes
- [x] Deterministic sync/async disposal, hierarchy, and ownership
- [x] Explicit sync/async cleanup adapters for third-party resources
- [x] Registration inspection, local override, and unregister

Snapshot/restore is intentionally not a core parity item. Its cache and
resource semantics differ across libraries, and child scopes plus fresh
bootstrap containers provide safer test isolation without resurrecting or
double-disposing instances.

Selective binding/module unload is also not a 1.0 gate while `load()` remains
an atomic composition API rather than a hot-reload lifecycle. It can be added
compatibly when a concrete plugin use case exists; current mutation deliberately
retires resources until container disposal instead of deactivating objects that
callers may still hold.

## Mature library gate

- [x] Frozen graph inspection and public validation
- [x] Synchronous activation hooks
- [x] Atomic module/bulk registration
- [x] InversifyJS, TSyringe, and Awilix migration guides
- [x] Executable and type-checked Bun HTTP request-scope example
- [x] Aggregate emitted-declaration hash, package lint, and versioned changelog
  gate
- [x] Agent map, architecture record, execution plan, and knowledge-link harness
- [x] Human contribution guide and structured runtime bug report form
- [x] Shipped public API reference and declaration-level documentation

The original single source crossed the practical navigation and review
threshold. The maintainability target is now an explicit public facade, four
focused leaves, one container-state-free resolution kernel, and one
private-state container orchestrator. This split must preserve the root API and
runtime behavior, add no runtime dependency, and keep every internal module
outside the supported package API.

## Engineering gates

- [x] Runtime, negative-path, type, generated-graph, and concurrency tests
- [x] Shrinking property tests with deterministic replay and model oracles
- [x] 95% line/function/statement coverage threshold
- [x] Pinned TypeScript 5.4 and current TypeScript source and packed-consumer checks
- [x] Minimum Bun 1.3.10 and latest Bun jobs
- [x] Minimum Bun npm-packed sync/async consumer smoke
- [x] Local Bun 1.3.10 type, 179-test, and packed-consumer verification
- [x] Packed tarball install plus isolated NodeNext, Bun, Node, declaration,
  and packaged-document link smoke
- [x] Release publication lints and consumes the exact tarball passed to npm
- [x] Stable GitHub release, exact repository-coordinate, and no-rebuild pack
  gates configured
- [x] Node 22/24/26 runtime matrix configured
- [x] Node matrix exercises async context, scope, coalescing, paths, and disposal
- [x] Windows packed-consumer job configured
- [x] Package lint and exported-type resolution checks
- [x] Scope/disposal ownership and scheduler stress coverage
- [x] Peer benchmark policy, representative graph/scope cases, and aggregate
  emitted JavaScript/declaration compressed-size release budgets
- [x] Clean cross-platform build output without stale or unshipped declaration maps
- [x] Zero runtime dependencies and allowlisted package payload
- [x] MIT license, changelog, security policy, and support policy
- [x] Repository invariants, AGENTS-rooted knowledge reachability, local inline
  and reference links/anchors, and execution-plan structure checked mechanically
- [x] Deno 2.0.0 and latest-Deno-2 compatibility matrix configured
- [x] Local Deno 2.0.0 and 2.8.1 type/decorator/runtime smoke
- [x] Per-module Deno `@ts-self-types` links for modular declaration resolution
- [x] OIDC provenance release workflow gated by the full compatibility matrix
- [ ] Deno 2, Windows, and runtime-matrix jobs passed on the eventual remote
- [ ] npm trusted publisher, repository metadata, and provenance release verified

`api/index.d.ts.sha256` deliberately hashes every emitted declaration path and
normalized content, making any declaration-output change a review event. It is
a drift gate, not a substitute for comparing against a previous published
release. The maintainer must assess SemVer impact, update the changelog, and
then refresh the hash. A release additionally requires a `v<package version>`
tag and a dated changelog heading. Prerelease versions are blocked until the
project adopts an explicit non-`latest` npm dist-tag policy, and GitHub
prerelease events are rejected independently.

CI configuration is repository evidence only after it has run on the eventual
remote. The provenance workflow also needs the final repository URL in package
metadata and npm trusted-publisher configuration. Popularity, ecosystem
adoption, and battle-testing remain external metrics and cannot be claimed from
repository tests.
