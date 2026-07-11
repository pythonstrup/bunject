# Support policy

- Bug reports should include Bun, Node, or Deno version, TypeScript version, a
  minimal dependency graph, and the complete error object.
- Questions and feature proposals belong in repository discussions or issues.
- The supported baseline is Bun 1.3.10, Node.js 22, Deno 2.0.0, and
  TypeScript 5.4.
- The package is ESM-only and requires Node-compatible async-local context;
  browsers and non-Node-compatible edge runtimes are outside the support scope.
- Only the latest minor line receives fixes before 1.0.

Compatibility failures on the documented minimum versions are release
blockers. Performance results are compared on pinned benchmark code, but exact
throughput is hardware- and runtime-dependent.
