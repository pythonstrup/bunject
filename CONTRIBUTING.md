# Contributing to Bunject

Bunject is pre-release software. Keep changes small, explicit, and supported by
evidence that can run locally.

## Report problems

Security reports must follow [SECURITY.md](./SECURITY.md), not a public issue.
For bugs, include the runtime and TypeScript versions, a minimal dependency
graph, the complete error object, and the expected behavior.

## Set up

Use a supported runtime from [the support policy](./docs/support.md), then run:

```sh
bun install --frozen-lockfile
bun run check
```

When Deno is installed, also run `bun run test:deno`. The complete command map
and design invariants are in [AGENTS.md](./AGENTS.md); public behavior is defined
by [the API reference](./docs/api.md).

## Make a change

1. Add the smallest focused test that demonstrates the behavior or failure.
2. Change the shared invariant rather than adding guards to individual callers.
3. Preserve standard decorators, explicit dependencies, deterministic ownership,
   and zero runtime dependencies.
4. Run focused tests, both TypeScript checks, and `bun run check`.
5. Update the changelog and relevant public documentation for user-visible
   behavior. Refresh the declaration hash only after reviewing SemVer impact.

For a hot path, use an exact filter such as:

```sh
bun bench/container.bench.ts '^bunject / warm singleton$'
```

Compare at least five fresh processes per revision and report the median and
spread. Peer rankings and one-off timings are informational only.

## Submit evidence

A change should explain why it is needed, identify the public contract it
affects, and list the commands that passed. Releases are maintainer-controlled:
do not create release tags or publish a locally rebuilt package.

After dating the version's changelog entry, run `bun run release:rehearse`. It
synthesizes the stable tag event, rejects unfinished release metadata, builds
once, packs without lifecycle scripts, lints and consumes that exact tarball,
and applies `npm publish --dry-run` to the same file.

The maintainer npm account must have 2FA enabled. A trusted publisher cannot be
attached before the package exists, so bootstrap once with a short-lived
granular token that has package read/write access for `All Packages` (required
to create the new unscoped package) and `Bypass 2FA` enabled. Store it in the
GitHub `npm` environment as `NPM_TOKEN`, then publish the stable `v<version>`
GitHub release.

After that workflow succeeds, use an interactive 2FA-authenticated maintainer
session with npm 11.18.0—not the bypass token—to configure and verify the exact
trusted relationship:

```sh
npm trust github bunject --repository pythonstrup/bunject --file release.yml --environment npm --allow-publish
npm trust list bunject
```

Delete the environment secret, revoke the token, and remove the workflow
fallback plus its harness requirement so later releases fail closed on OIDC.
The workflow builds once and lints, consumes, and publishes the same archive
without running lifecycle scripts during packing or publication.
