# Native adaptive image admission checkpoint — 2 November 2026

Task renderer#174 / Story site#2124 / Feature site#2114. This checkpoint prepares
the next prescribed-radial comparison. It does not resume adaptive performance
work, qualify a classifier or enable any flag. Three.js remains prohibited.

The offline command revalidates the complete native reference batch before
reading candidates. For admitted references it checks normal production-sampler
radial captures at both native resolutions, exact scene/source/camera/assets,
resolved GPU admission, actual per-tile primary counts, completed histograms,
optical telemetry, HDR hashes and cleanup. It reuses lighting-owned circular
budgets and quality assessment for global and every SPP tier against both
independent256 references. Local reference uncertainty cannot be hidden by a
whole-frame average. There is no renderer, public API, shader, GPU allocation,
pass, sampler or rollout change. See the [protocol](../design/room-adaptive-image-screen.md).

## Validation and limitations

- Requirements-first tests initially fail because the new implementation is
  absent. All578 tests then pass, including five new portable regression groups.
  They cover scene identity, complete native edge-tile/count accounting, original
  error preservation, per-tier algebra/assessment and blocked reference admission.
  Synthetic images are algebra tests, not physical performance evidence.
- Lint, source syntax/types, clean packed consumer, build, package check and all9
  Zero-Three checks pass. Full and production npm audits report0 vulnerabilities.
- Combined fresh Node execution and retained byte-identical physical execution
  cover80.70% of29,984 lines and89.59% of branches. Previous public-declaration
  and fixture denominator entries remain included. Existing executable files
  are unchanged; new code has fresh execution. The admission fixture has100%
  line execution; the CLI has41.53%, covering the blocked path. Its positive
  physical-data branch remains pending the reference gate. Do not report a
  successful adaptive admission from these tests.
- Run the new command against preserved `checkpoint-3.json` of the currently
  running batch. It returns `blocked-reference-evidence`, no admitted resolutions,
  and process exit1 before reading nonexistent candidate arguments. Input evidence
  is read-only. No capture is deleted, rewritten, reclassified or restarted.

Current immutable reference batch:
`room-convergence-6b3b45ee-02af-4c96-b6bc-a0912115ae8e`, renderer969f6de,
lightingbac0d5c, sharedb68f868, site21d43a9. At checkpoint4 the two32-SPP and
two128-SPP native1080p lanes complete without failures;256-SPP/4K remain running.
Independent HDR reconstruction and source/scene/count admission of those four
completed lanes gives:

| Independent seed-pair difference |32 SPP |128 SPP |
| --- | ---: | ---: |
| Linear RGB RMSE |0.0815893027 |0.0407533658 |
| Normalized RGB RMSE |0.1743485151 |0.0875798181 |
| Signed relative energy drift |0.0001453360 |0.0000048786 |

These partial differences are descriptive convergence attribution. They do not
apply the256-SPP reference screen, certify4K, identify every room band or measure
adaptive performance. The unchanged3%/1% complete reference gates, local/material/
silhouette/temporal review, cold-start robustness, disabled-path equivalence,
matched-quality timing/confidence and approved release gates remain open.
The original constructor failures and all prior images/receipts are preserved.

Private raw validation, blocked-admission output, partial HDR reconstruction,
coverage maps and provenance are retained in
`output/playwright/adaptive-admission-2026-11-02-c0oX5N/`. Local asset paths and
model data are not added to the public package. CI must be verified after push;
no merge, release, local publishing or white-paper performance claim is made.
