# Bunject architecture

## Purpose

Bunject is a Bun-first, Node/Deno-compatible dependency injection kernel for
standard TypeScript decorators. It favors explicit typed graphs over emitted
reflection, global registration, parameter decorators, or framework-specific
discovery. Browser and non-Node-compatible edge runtimes are not targets because
the kernel uses `node:async_hooks` for concurrent resolution context.

The original single source crossed the point where navigation and review were
measurably worse. The source therefore has seven deliberate boundaries while
preserving one owner for mutable container state:

- [`src/index.ts`](./src/index.ts) explicitly exports the public root surface;
- `src/types.ts`, `src/dependencies.ts`, `src/providers.ts`, and `src/errors.ts`
  are focused leaves for their named concerns;
- `src/resolution.ts` contains container-state-free graph traversal,
  construction wait tracking, runtime dependency collection, and lifetime
  calculations;
- [`src/container.ts`](./src/container.ts) owns registration, cache, hierarchy,
  ownership, mutation, and lifecycle state and orchestrates those operations.

This is a maintainability boundary, not an API or behavior change. It adds no
runtime dependency. A narrow class-owned access adapter lets the resolution
kernel inspect private lookup relationships without exposing or duplicating
mutable state. The package exports only `bunject`; emitted internal modules are
not supported subpaths.

## Public model

Applications register a typed token against one provider:

- class, value, synchronous factory, asynchronous factory, or alias;
- singleton, scoped, resolution, or transient lifetime;
- one binding or an explicit multi-binding set.

Constructor and factory dependencies are explicit tuples. `optional`, `all`,
`lazy`, and `resolver` descriptors change resolution behavior without relying on
runtime TypeScript metadata. `forwardRef` delays declaration evaluation only
until registration, where it is erased before graph inspection or resolution.
Known tuple lengths are checked as valid constructor/factory invocations;
widened arrays require a compatible homogeneous rest signature. Overloaded
callable values require a monomorphic wrapper or adapter.
`@Injectable` stores class-local scope and tuple metadata but never registers globally.

## Resolution flow

```text
public resolve API
  -> validate token and active container direction
  -> preflight declared graph and lifetime constraints
  -> find nearest binding set
  -> select lifetime cache and construction session
  -> resolve declared dependencies
  -> construct/await provider
  -> run activation and record dynamic dependencies
  -> track owned resource and publish cache entry
```

Synchronous and asynchronous APIs are separate. Pending cached providers carry
a construction wait graph so concurrent roots coalesce without hiding cycles.
Async-local resolution context preserves the active path, child container,
lifetime captor, resolution cache, and runtime dependency collector.
Context frames retain their causal parent. If a microtask inherits a completed
nested frame, lookup skips that inactive frame and restores the nearest active
same-family frame, preserving cycle and lifetime paths without joining
independent container families. Dynamic preflight seeds graph traversal with
that active path and does not reuse a root-only validation cache for a prefixed
graph.

## Hierarchy and mutation

Lookup travels only from the active container toward its ancestors. A parent
singleton therefore resolves against its owner, while inherited scoped,
resolution, and transient providers activate in the requesting child.
Each independently created root starts a separate container family. During
provider activation, `resolve*`, `resolveAll*`, `has`, `validate`, and `inspect`
reject a first lookup into a sibling, descendant, or independent family before
reading its providers. Calls begun after activation are fresh graphs.

Each resolution increments counters on exactly that upward lookup path.
Registration mutation is rejected only on containers visible to an active
graph; isolated siblings and new request scopes remain usable concurrently.
Mutations invalidate only caches whose declared or recorded runtime edges can
observe the changed token.

## Ownership and disposal

Class and factory results are owned by their activation container. Borrowed
values and aliases do not create ownership. Providers may adapt third-party
cleanup with `onDisposal`/`onDisposalAsync`; an explicit callback pair replaces
the value's Symbol disposal protocol. Object identity is deduplicated per
container and the first ownership contract wins. Primitive handles with an
explicit callback are tracked per activation. Disposal is last-in, first-out.
Parent disposal freezes and drains the complete descendant tree; async disposal
also waits for in-flight provider work and detects cross-container wait cycles.
Disposal uses the same causal context chain as resolution. A live session graph
connects callers that coalesce another session's pending provider, so disposal
waits propagate in both temporal directions and across scope/owner boundaries.
Construction and disposal edges are preflighted and installed atomically.
Inactive frames, active ancestor providers, and later coalesced callers therefore
cannot hide an outer wait edge or leave a rejected construction edge behind.
A `disposeAsync()` call made during provider activation is conservatively causal
even when its returned Promise is ignored; fire-and-forget disposal must start
outside provider activation. Provider-derived edges are retired when the
disposing tree finishes draining all in-flight provider work, before owned
resource disposal begins.

Mutation retires an old cache generation without destroying objects still held
by callers. Retired resources remain owned and are cleaned when their container
is disposed.

## Errors and inspection

`RegistrationError` covers invalid tokens/providers/modules, binding conflicts,
busy lookup paths, and disposed containers. `ResolutionError` covers missing or
ambiguous providers, cycles, sync/async boundary violations, captive lifetimes,
busy/disposed state, and provider failures. Causes and full token paths are part
of the public contract.

`validate` runs preflight without construction. `inspect` returns a frozen,
side-effect-free view of the reachable declared graph. Runtime-selected targets
remain visible through errors and mutation tracking rather than static graph
inspection.

## Verification architecture

- Runtime and negative paths: `test/*.test.ts`.
- Type contracts: `test/types.ts` under current and minimum TypeScript.
- Generated graphs and scheduling: property and stress suites.
- Packed artifact: npm pack/install followed by Bun, emitted-decorator Node, and
  direct Node consumers; Node also rejects internal package subpaths.
- Declaration drift: deterministic SHA-256 over each emitted declaration path
  and its normalized content.
- Deno declarations: each emitted JavaScript module advertises its sibling
  declaration with `@ts-self-types`; Node consumers use the package type entry.
- Compatibility: Bun minimum/latest, Node matrix, and Deno smoke.
- Performance: aggregate compressed budgets over every emitted JavaScript and
  declaration file, plus peer benchmarks.
- Repository knowledge: `bun run harness:check`.

See [the documentation index](./docs/index.md), [maturity criteria](./docs/maturity.md),
and [harness design](./docs/harness.md) for operational detail.
