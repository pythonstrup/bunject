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

`bun run bench:bunject` removes peer execution from the measured process. For
an isolated case, pass an exact regular-expression filter directly:

```sh
bun bench/container.bench.ts '^bunject / warm singleton$'
```

Repeat an isolated case in fresh processes and compare its median and spread,
not one run or peer ranking. For a CPU profile, Bun's native Markdown profiler
keeps the evidence inspectable without another dependency:

```sh
bun --cpu-prof-md bench/container.bench.ts '^bunject / warm singleton$'
```

Reviewed isolated A/B (2026-07-11, Apple M5, Bun 1.3.14): five alternating
fresh processes per version and exact-case filter produced these medians:

| Case | `86cf1d4` | `d6014f1` | Median reduction |
| --- | ---: | ---: | ---: |
| warm singleton | 138.84 ns (MAD 1.69) | 62.11 ns (MAD 1.45) | 55.3% |
| transient class | 217.01 ns (MAD 0.60) | 150.16 ns (MAD 3.11) | 30.8% |

The corresponding ranges did not overlap. Mixed-case graph and request-scope
results remain contextual because their process ranges overlapped or changed
with JIT specialization. Peer ratios also varied materially with optimizer and
power state, so they are not an acceptance threshold. Bunject does not claim
to be the fastest container; correctness, diagnostics, and stable absolute
overhead are the release criteria.

The same peer-free benchmark entrypoint was applied to the `86cf1d4` and
`d6014f1` source trees in temporary worktrees. Raw per-process averages,
alternating baseline and target, were:

- warm singleton: baseline `[136.71, 138.84, 139.99, 137.15, 144.01]` ns;
  target `[62.11, 60.66, 65.05, 61.27, 64.87]` ns;
- transient class: baseline `[217.01, 214.29, 217.46, 233.99, 216.41]` ns;
  target `[150.16, 153.27, 143.27, 152.05, 146.33]` ns.
