# Ordinary proposal variance checkpoint — 2 November 2026

Task renderer#271 / Story site#2291 / Feature site#2114. Preserve the original
full native capture and all prior images/failures. The completed1080p subset is
analysed read-only with the existing verifier and explicitly labelled partial;
the two4K256-SPP lanes continue. No partial result enables adaptive performance.
Three.js remains prohibited.

## Corrected1080p reference result

All six original full-room/all-reference captures pass reconstruction, native
tile/sample/count, optical, preflight, source/asset/camera/transport and cleanup
checks. Their hashes and independent linear-HDR metrics are adjacent. The
reference gate fails without changing its3% normalized RMSE/1% energy limits:

| Comparison | Normalized RGB RMSE | Signed energy drift |
| --- | ---: | ---: |
|128→256, seed7 |4.382134% |0.002945% |
|128→256, seed19 |4.378916% |-0.000169% |
|256 seed7→19 |6.189688% |-0.002626% |

The independent32/128/256 seed-pair RGB RMSE falls0.0815893/0.0407534/0.0287745,
consistent with Monte Carlo variance reduction as samples increase. This is not
proof that every transport/lighting path is unbiased or that visible bands are
fixed. Retain signed rows and a48×27 error grid/heatmap from the independent256
pair in private evidence. Its worst40×40 cell normalized RMS is14.12% against
the full-image reference RMS. The ten largest cells contain3.42% of squared
error; the noise is not confined to a handful of extreme cells. No per-cell
acceptance threshold or material attribution is inferred from that grid.

Source capture renderer969f6de, lightingbac0d5c, sharedb68f868, site21d43a9.
The complete source pins and checkpoint hash are adjacent. The derived six-lane
summary records its original checkpoint hash and partial scope; the original
12-lane batch is neither edited nor declared complete.

## Actual-WGSL proposal isolation

Audit identifies canonical non-metal/specularWeight1/coat0 probabilities
diffuse0.4/GGX0.6, with dielectric normal-incidence F0=0.04. Test this as an
efficiency hypothesis, not a new PDF defect. Production `scatter_direction`,
BSDF, PDF, GGX and cosine function bodies are unchanged in the diagnostic.
Only quadrature inputs and the explicitly controlled shared weight function
differ. The sampling and PDF use the same weights; null events remain included.

At normal incidence, isotropic roughness1, no coat/sheen/transmission and
occlusion1,512 midpoint draws per conditional lobe are compared with an
independent uniform-solid-angle integral of the actual physical BSDF. All
means agree within the pre-frozen0.0001 tolerance:

| Albedo | Diffuse/GGX proposal | Mean | Variance | Null fraction |
| --- | --- | ---: | ---: | ---: |
|0.75 |0.4/0.6 canonical |0.73225784 |0.28797032 |30% |
|0.75 |0.8/0.2 control |0.73228791 |0.06486148 |10% |
|0.75 |0.95/0.05 control |0.73230836 |0.01413008 |2.5% |
|1 |0.4/0.6 canonical |0.97224158 |0.50801875 |30% |
|1 |0.8/0.2 control |0.97228139 |0.11443480 |10% |
|1 |0.95/0.05 control |0.97230849 |0.02493115 |2.5% |

Independent BSDF integrals are0.73224742/0.97222778 for albedo0.75/1, identical
across all proposals. The95%-diffuse control has approximately95.09% lower
variance in this isolated estimator. This excludes NEE/MIS, scene visibility,
roulette, other angles/roughness/materials and full paths. It is not95% less
full-scene noise or faster rendering. Fewer nulls can increase continuing rays
at fixed SPP; matched-quality total GPU/job time must be measured separately.

This CPU WGSL result supplies a concrete future default-off proposal experiment,
not a production probability recommendation or runtime fix. Any policy must
preserve the BSDF and matching PDF, protect grazing/metal/coat/sheen/optical
paths, retain nonzero support and undergo physical/native image qualification.
Do not introduce compensating colour/exposure changes or relax the failed gate.

## Validation and pending work

Requirements/design and tracked scope precede tests/implementation. Nine new
portable regression groups execute actual production functions, check independent
integrals/weighted moments/nulls, reject malformed evidence and preserve exact
default shader SHA256 `b50d988d92d0af5867fc3355cadad89ad8b1affe9c88bf051298df2c8acaf7b4`.
All587 tests pass; combined coverage80.74% lines/89.65% branches retains the
declaration/fixture denominator. Lint/types/clean consumer/build/package and
all9 Zero-Three checks pass. README/Unreleased/design are current. Raw reports,
conditional output hashes, error grid/heatmap and validation are retained under
`output/playwright/native-reference-review-2026-11-02-D3yMyG/`.

No production shader/API/flag/allocation/pass/material/transport behavior changes.
Physical execution of the new diagnostic is pending to avoid competing with
the active native capture. Full4K convergence, local/silhouette/temporal/banding,
cold startup, a flagged runtime policy, matched-quality timing, exact-head CI and
approved release gates remain open. No merge, publishing or white-paper gain.
