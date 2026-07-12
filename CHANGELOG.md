# Changelog

This project follows [Semantic Versioning](https://semver.org/).

## 0.1.0 - Unreleased

- Initial production kernel with the standard `@Injectable()` decorator and
  checked explicit or static dependency tuples.
- Class, value, factory, async factory, alias, and multi providers.
- Singleton, scoped, resolution, and transient lifetimes.
- Child scopes, captive-dependency validation, optional/all/lazy descriptors,
  and an activation-scoped read-only Resolver with registration queries.
- Registration-time `forwardRef()` declarations for later class tokens,
  composable with optional, all, lazy, and resolver dependencies without
  creating circular proxies.
- Exact constructor/factory invocation checks for dependency tuple literals,
  including valid optional, defaulted, rest, and generic signatures. Overloaded
  callable values require a monomorphic wrapper, while widened arrays require a
  compatible homogeneous rest signature.
- Required and optional sync/async resolution for containers and injected
  resolvers, preserving graph failures when a provider is registered.
- Opt-in child-to-root chained multi-resolution across containers, resolvers,
  all-dependency descriptors, validation, inspection, and safe mutation.
- Reusable, dependency-checked provider definitions through `defineProvider()`.
- Sync/async resolution, deterministic disposal, activation hooks, graph
  inspection, atomic modules, safe local mutation, and provider cleanup adapters.
- Packed TypeScript 5.4/current, Bun, and Node consumers; Deno runtime smoke;
  declaration, release, coverage, stress, property, package-lint, size, and
  peer benchmark harnesses.
- Minimum-Bun package consumption, Node async-context/lifecycle coverage, and
  Deno 2.0.0/latest type-checked standard-decorator coverage.
- Registration-time rejection of non-constructible class tokens, providers,
  and dependency tuples, plus immutable snapshots of dependency descriptors
  and an executable Bun HTTP request-scope example.
- Runtime thenable services remain rejected through broad service tokens,
  inferred or explicit `defineProvider()` declarations, self-registration, and
  reusable provider registration; the type boundary matches callable-`.then`
  runtime detection.
- Versioned agent map, architecture, execution plan, and mechanical repository
  harness based on repository-local, agent-readable feedback, plus a public API
  reference, knowledge reachability, reference/anchor and packed-document link
  validation, and compatibility-gated exact-tarball OIDC publication.
- Explicit public facade plus focused type, dependency, provider, error, and
  container source modules plus a container-state-free resolution kernel,
  without changing the root API, runtime behavior, or runtime dependencies.
  Internal modules remain outside the package export map; declaration hashing
  and JavaScript/declaration size budgets cover all emitted files in aggregate,
  and Deno resolves each module's sibling declaration.
- Runtime rejection of null class dependency tuples, borrowed-provider options,
  and non-undefined activation, module, or disposal callback results.
- Profile-guided token and graph-validation fast paths, isolated benchmark
  filtering, and native CPU-profile guidance without new dependencies.
- Human contribution guidance and a structured issue form that requires runtime,
  TypeScript, reproduction, error, and expectation evidence.
- Fail-closed stable-release checks for exact GitHub repository metadata and
  prerelease events, with lifecycle-free packing of the already verified build.
- Public repository package metadata and an explicit Windows `cmd.exe` wrapper
  for npm-backed packed-consumer verification.
- Active resolution now restores same-family causal context through inactive
  nested microtasks, so immediate sync/async cycles and captive lifetimes fail
  deterministically instead of hanging or losing their root path.
- Dynamic graph preflight now includes the active prefix even after root
  validation has been cached, preventing circular branches from constructing
  earlier singleton side effects.
- Independently created container families are isolated during provider
  activation: resolution, query, validation, and inspection reject the first
  cross-family lookup before construction or provider disclosure.
- Async disposal now preserves every active provider operation across causal
  context frames and live coalesced resolution sessions. Inactive frames,
  ancestor-owned providers, scope/owner mismatches, and every ordering between
  provider waits, coalescing, and disposal startup can no longer hide a mixed
  resolution/disposal cycle. Construction and disposal edges are installed
  atomically so a rejected join cannot leave a false construction cycle;
  provider-derived edges are retired after in-flight work drains so they cannot
  create a later false disposal cycle.
