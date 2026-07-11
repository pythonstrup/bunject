# Documentation index

Use this page as the stable map for repository knowledge.

## Product and design

- [Architecture](../ARCHITECTURE.md)
- [Public API reference](./api.md)
- [Production maturity criteria](./maturity.md)
- [Harness and agent feedback loop](./harness.md)
- [Migration guides](./migrations.md)

## Operations and examples

- [Bun HTTP request scopes](./bun-http.md)
- [Benchmark policy](../bench/README.md)
- [Release history](../CHANGELOG.md)
- [Support policy](./support.md)
- [Security policy](../SECURITY.md)

## Execution records

- [Execution-plan conventions](./exec-plans/README.md)
- [Active DI maturity plan](./exec-plans/active/di-maturity.md)

Public usage starts in the repository [README quick start][quick-start]. API
behavior is authoritative in `src/index.ts`; changes to emitted declarations
are checked by `api/index.d.ts.sha256`.

[quick-start]: ../README.md#quick-start
