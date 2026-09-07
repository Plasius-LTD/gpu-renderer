# ADR-0028: Admit trusted push workflows through locked branch refs

- Status: Accepted
- Date: 2026-09-07
- Project: gpu-renderer#207 and #156; Story plasius-ltd-site#1626; Feature #1597
- Feature flag: `platform.public-artifact-integrity.enabled`
- Supersedes only the branch admission procedure in ADR-0027.

## Context and evidence

The reviewed commit `48cd205108bbd139c1dc10a69d9ad77322beb468` remained
queued with a full-SHA workflow entry, despite the repository being admitted
and three approved runners reporting online and idle. The job UI identified the
workflow by `refs/heads/chore/project-156-trusted-push-ci`. After locking that
branch and admitting its fully qualified workflow ref, attempt 3 of CI run
[34115216308](https://github.com/Plasius-LTD/gpu-renderer/actions/runs/34115216308)
executed the unchanged commit on approved self-hosted capacity. This establishes
a working admission route for this top-level push workflow; it does not establish
GitHub's internal cause or invalidate SHA pinning for reusable workflows.

## Decision and operating sequence

1. Review the repository-owned branch's exact full SHA and workflow. Keep CI
   push-only with literal approved self-hosted labels and existing check names.
2. Lock that branch with `lock_branch` and `enforce_admins` enabled. Deny force
   pushes, branch deletion and fork syncing; leave push allowances empty.
3. Read back every protection setting and verify the remote branch still points
   to the reviewed SHA. Stop if either check fails.
4. Add only `Plasius-LTD/gpu-renderer/.github/workflows/ci.yml@refs/heads/<branch>`
   to the restricted runner group's selected workflows. Preserve repository
   restrictions and every unrelated selected workflow. Read back the result.
5. Observe CI for that exact SHA. An existing queued attempt may be cancelled
   and rerun once after the configuration change. Wait for required checks;
   neither elapsed time nor local tests substitute for successful remote CI.
6. Before any branch update or unlock, remove its temporary workflow admission
   and read back the removal. Only then restore its previous protection state.
   Review, lock and admit the new SHA again after a subsequent push.
7. After delivery, remove the temporary branch and obsolete SHA admissions.
   Keep protected-main workflow admission and production controls intact.

The same sequence applies to reviewed release-preparation branches when their
push checks need admission. The release workflow still owns version/changelog
preparation and publication. Do not manually promote release metadata.

## Alternatives and consequences

SHA-only admission was insufficient for the observed push job. A reusable
workflow can make its ref explicit but would change the CI call graph and check
contexts. A mutable branch allowlist, all-workflow access, hosted CI fallback,
fork execution, or branch-protection bypass would violate the recovery scope.
Locking a reviewed branch preserves admission of one commit while matching the
ref reported by GitHub. Administrators must remove admission before changing
the lock; leaving a mutable admitted ref is not an acceptable steady state.

## Verification, release and rollback

Live API assertions verify branch lock, administrator enforcement, denied
mutation/deletion/sync, exact SHA, and unchanged group restrictions before
admission. The previously queued job must execute on group 3 with the approved
labels, and all three protected check contexts must succeed. Existing workflow
contract tests, package tests, coverage, lint, typecheck, build and artifact
admission remain required. Record exact run/job links and cleanup read-back on
#207 and #156.

The product feature flag never bypasses infrastructure admission. No runtime API,
dependency, entitlement or UI changes result. Publication remains the existing
`cd.yml` flow from protected `main` through `production`, using exact-SHA CI and
npm OIDC provenance. Operational rollback removes the temporary workflow entry
before releasing the branch lock; it does not widen runner access or restore
hosted validation or npm write tokens.
