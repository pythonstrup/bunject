# Bunject Claude Code adapter

This file is the Claude Code entrypoint. The agent map, working loop,
commands, and non-negotiable invariants live in [AGENTS.md](./AGENTS.md);
this adapter imports that single source of truth and must not duplicate or
extend it.

@AGENTS.md

`bun run harness:check` verifies this file stays a thin adapter.
