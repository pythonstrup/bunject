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
- [x] Typed class/symbol tokens and checked dependency tuples
- [x] Standard decorators without reflect metadata or global registration
- [x] Multi-binding and sync/async `resolveAll`
- [x] Optional, all, and lifetime-safe lazy descriptors
- [x] Captive dependency validation for declared and dynamic graphs
- [x] Sync/async graph separation and concurrent cache coalescing
- [x] Preflight missing, ambiguity, async, lifetime, and cycle validation
- [x] Full dynamic dependency paths, stable error codes, cycles, and causes
- [x] Deterministic sync/async disposal, hierarchy, and ownership
- [x] Registration inspection, local override, and unregister

Snapshot/restore is intentionally not a core parity item. Its cache and
resource semantics differ across libraries, and child scopes plus fresh
bootstrap containers provide safer test isolation without resurrecting or
double-disposing instances.

## Mature library gate

- [x] Frozen graph inspection and public validation
- [x] Synchronous activation hooks
- [x] Atomic module/bulk registration
- [x] InversifyJS, TSyringe, and Awilix migration guides
- [x] Bun HTTP request-scope example
- [x] Checked declaration hash, package lint, and versioned changelog gate

## Engineering gates

- [x] Runtime, negative-path, type, generated-graph, and concurrency tests
- [x] Shrinking property tests with deterministic replay and model oracles
- [x] 95% line/function/statement coverage threshold
- [x] Minimum TypeScript 5.4 and current TypeScript checks
- [x] Minimum Bun 1.3.10 and latest Bun jobs
- [x] Packed tarball install plus isolated NodeNext, Bun, and declaration smoke
- [x] Node 22/24/26 runtime matrix configured
- [x] Package lint and exported-type compatibility checks
- [x] Scope/disposal ownership and scheduler stress coverage
- [x] Peer benchmark harness and compressed-size release budgets
- [x] Zero runtime dependencies and allowlisted package payload
- [x] MIT license, changelog, security policy, and support policy
- [x] Deno 2 compatibility job configured
- [x] Local Deno 2.8.1 runtime smoke
- [x] OIDC provenance release workflow configured
- [ ] Deno 2 and runtime-matrix jobs passed on the eventual remote
- [ ] npm trusted publisher, repository metadata, and provenance release verified

`api/index.d.ts.sha256` deliberately makes any exported declaration change a
review event; the maintainer must assess its SemVer impact, update the
changelog, and then refresh the hash. A release additionally requires a
`v<package version>` tag and a dated changelog heading.

CI configuration is repository evidence only after it has run on the eventual
remote. The provenance workflow also needs the final repository URL in package
metadata and npm trusted-publisher configuration. Popularity, ecosystem
adoption, and battle-testing remain external metrics and cannot be claimed from
repository tests.
