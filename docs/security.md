# Security policy

## Supported versions

Security fixes are provided for the latest published minor release. Before the
1.0 release, an upgrade may include documented breaking changes.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use the repository's
private security-advisory form so the report can be investigated before
disclosure. Include a minimal reproduction, affected versions, and expected
impact. An initial acknowledgement is targeted within three business days.

The project does not execute provider code until resolution. Provider
factories and lifecycle hooks are application code and run with the host
process's permissions; Bunject is not a security sandbox.
