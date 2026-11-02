# Exact-commit release CI discovery

Parent Story: Plasius-LTD/plasius-ltd-site#2357. Feature:
Plasius-LTD/plasius-ltd-site#1170; Epic #2271. This release reliability work
preserves the consumer's scene-fidelity flag and studio capability.

The approved renderer release workflow timed out discovering successful main CI
for `ce8ef8fd8585c9920bd98efe6ab9f1660c457973`: GitHub returned that run without
a status filter, but returned an empty list with `status=success` or
`status=completed`. The direct run and its required jobs were successful.

Discover runs from the existing `ci.yml` endpoint, retaining the branch, event,
exact SHA and bounded page-size query parameters. Omit the unreliable remote
status filter. At all four release boundaries, retain the existing explicit
predicate requiring exact SHA, main branch, push event, completed state and
successful conclusion. Empty, failed, queued, unrelated and malformed evidence
must never authorize a release. Main equality, production environment,
immutable artifacts, tokenless publication and provenance checks are unchanged.

Tests execute the workflow's actual query and predicate against a fake GitHub
response exhibiting the index failure. Verify all four boundaries and reject
each mismatched field. Release the already-prepared 0.2.60 only through reviewed
main `cd.yml`, with successful CI for its final source commit; do not publish
locally or increment the version to get around the failed discovery.
