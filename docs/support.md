# Support policy

- Bug reports should include Bun or Node version, TypeScript version, a minimal
  dependency graph, and the complete `ResolutionError` or `RegistrationError`.
- Questions and feature proposals belong in repository discussions or issues.
- The supported baseline is Bun 1.3.10, Node.js 22, and TypeScript 5.4.
- Only the latest minor line receives fixes before 1.0.

Compatibility failures on the documented minimum versions are release
blockers. Performance results are compared on pinned benchmark code, but exact
throughput is hardware- and runtime-dependent.
