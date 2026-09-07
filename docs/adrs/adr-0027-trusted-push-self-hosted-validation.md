# ADR-0027: Trusted push validation on explicit self-hosted runners

- Status: Accepted
- Date: 2026-09-07
- Project: gpu-renderer#156; Story plasius-ltd-site#1626; Feature #1597
- Feature flag: `platform.public-artifact-integrity.enabled`

## Context

The recovery Project requires CI to use explicit approved self-hosted labels
and prohibits external fork execution. The subsequent runner cleanup introduced
hosted pull-request validation, which does not satisfy that acceptance criterion.
Branch protection requires Trusted head admission, build-test, and Public artifact
integrity, so changing their names would prevent ordinary PR delivery.

## Decision

Trigger CI exclusively on pushes to repository-owned branches, using literal
`[self-hosted, Linux, X64]` for all three existing jobs. Preserve check names,
admission dependency, timeouts, and disabled package-manager caching. A fork PR
cannot trigger CI. Maintainers review contributions before moving them into a
repository-owned branch; the resulting push creates the checks on that commit.
The restricted runner group must admit the reviewed workflow by immutable commit
SHA before branch jobs can start. Main remains admitted by its protected branch
ref. Remove obsolete one-commit admissions after delivery; never admit arbitrary
branch or PR refs. The scheduled audit workflow needs its own protected-main
entry in the same group.

The monthly dependency workflow also uses explicit self-hosted labels, a bounded
timeout, disabled package-manager caching, and main-only admission. Release
preparation, isolated release validation, and npm OIDC publication retain the
existing hosted exact-main protocol from ADR-0026. No package API changes occur.

The inherited flag remains the product rollout control; it never bypasses CI or
artifact admission. Operational rollback disables the affected workflow until
corrected. It must not restore the prohibited administrative path, hosted CI
fallbacks, external-fork execution, or token-based package publication.

## Alternatives and consequences

Running pull-request events directly on self-hosted machines was rejected because
untrusted fork changes must not execute there. Hosted PR isolation was rejected
because the authoritative recovery task requires self-hosted CI. Push-only
validation requires maintainer involvement for forks and validates repository
branches before merging; it preserves the existing required check contexts.

Contract regression tests require push-only triggers, literal labels, bounded
jobs, no hosted fallback or caller runner selector, and cache isolation. Existing
release tests continue to require hosted OIDC publication and exact-SHA checks.
Full package tests, coverage, typecheck, lint, build, artifact admission, actionlint,
remote CI and the approved CD flow remain completion gates.
