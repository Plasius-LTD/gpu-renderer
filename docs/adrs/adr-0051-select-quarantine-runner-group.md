# ADR-0051: Select the quarantine runner group in the workflow

- Status: Accepted
- Date: 2026-11-08
- Project: gpu-renderer#301; Site Story #1626; Feature #1597
- Supplements ADR-0027 and ADR-0028; retains ADR-0026 publication policy.

CI run 42503939455 used Default group runners despite matching the expected
self-hosted, Linux and X64 labels. After locking and admitting the exact branch,
its second attempt still used Default for trusted admission and build/test.
A restriction on one group cannot govern jobs scheduled on another.

Select `Public CI - Quarantined` explicitly in all three push CI jobs and the
main-only dependency audit, retaining the literal labels, required check names,
push-only triggers, and workflow and repository admission. Retain the exact
locked-ref readback and removal procedure. Hosted main/production npm CD is
unchanged. A group outage should delay CI; it must not route a job to Default.

Labels alone and repeated runs cannot establish which group executed the code.
Changing the organisation's Default access would affect other repositories.
Explicit group selection changes only this repository's workflow routing and
requires no new access, dependency or credential.

Check group selection in the workflow contract tests. Before merging or
publishing, read actual job metadata for the reviewed branch and exact main
commits. All required checks must succeed on group 3. No runtime or site changes
result from this decision.
