# Benchmark policy

`bun run bench` compares Bunject's warm singleton and transient class paths
with the pinned InversifyJS, TSyringe, and Awilix versions. Bunject-only cases
exercise a dependency graph and a complete request-scope lifecycle. Every
resolved value crosses Mitata's `do_not_optimize` barrier so the JIT cannot
discard an otherwise unused lookup.

Results are informational because nanosecond timings vary with CPU, power mode,
OS, and runtime. Review changes on the same machine and pinned toolchain; a
repeatable regression near 2x requires explanation or a focused profile. Do not
turn one workstation's absolute timing into a flaky CI threshold.

Reviewed baseline (2026-07-11, Apple M5, Bun 1.3.14): all warm Bunject cases
were sub-microsecond. Peer ratios varied materially with optimizer and power
state, so they are context rather than an acceptance threshold. Bunject does
not claim to be the fastest container; correctness, diagnostics, and stable
absolute overhead are the release criteria.
