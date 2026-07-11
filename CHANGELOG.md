# Changelog

This project follows [Semantic Versioning](https://semver.org/).

## 0.1.0 - Unreleased

- Initial production kernel with the standard `@Injectable()` decorator and
  checked explicit or static dependency tuples.
- Class, value, factory, async factory, alias, and multi providers.
- Singleton, scoped, resolution, and transient lifetimes.
- Child scopes, captive-dependency validation, optional/all/lazy descriptors,
  and an activation-scoped read-only Resolver with registration queries.
- Required and optional sync/async resolution for containers and injected
  resolvers, preserving graph failures when a provider is registered.
- Reusable, dependency-checked provider definitions through `defineProvider()`.
- Sync/async resolution, deterministic disposal, activation hooks, graph
  inspection, atomic modules, safe local mutation, and provider cleanup adapters.
- Packed TypeScript 5.4/current, Bun, and Node consumers; Deno runtime smoke;
  declaration, release, coverage, stress, property, package-lint, size, and
  peer benchmark harnesses.
- Minimum-Bun package consumption, Node async-context/lifecycle coverage, and
  Deno 2.0.0/latest type-checked standard-decorator coverage.
- Registration-time rejection of non-constructible class tokens, providers,
  and dependency tuples, plus an executable Bun HTTP request-scope example.
- Versioned agent map, architecture, execution plan, and mechanical repository
  harness based on repository-local, agent-readable feedback, plus a public API
  reference, knowledge reachability, reference/anchor and packed-document link
  validation, and compatibility-gated OIDC publication.
