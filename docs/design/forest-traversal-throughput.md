# Fixed-quality closest-hit traversal throughput

Date: 2026-11-05. Parent site Feature1170 / Epic2271; inherit
`gpu-demo.scene-fidelity.enabled` and existing GPU route capabilities.

## Evidence and intended result

Published renderer0.2.61 forest profiling (site2481 / renderer289) measured
~230 ms intersection and ~135 ms surface/shadow resolution at 800×500, 1 SPP,
six bounces. Improve the released closest-hit path without changing assets,
resolution, samples, depth, BSDF/PDF, shadow semantics or completed-sample
accounting. The application's 24 FPS target remains independent of other engine
work; no minimum FPS or speedup is promised before measured qualification.

## Package ownership and changes

`gpu-renderer` owns BVH traversal. Reuse its existing geometry/instance buffers,
public renderer and shader-validation package. Retain near-first instance-tree
(TLAS) ordering with cached inverse directions and pending bounds distances.
Keep the original right-first geometry-tree (BLAS) order and triangle shading
arithmetic. Cache each BLAS ray's inverse direction once after the unnormalized
instance transform.
No new dependency or replacement governor. Keep these mechanisms independently
measurable before accepting their combination. Do not modify other active
worktrees or experimental renderer282–287 tasks; shadow any-hit, compact storage,
proposal changes and bounce-budget work retain their separate acceptance.

Existing traversal is right-child-first, then ascending triangle offset inside
a leaf. Equal-distance candidates must preserve that winner even if visit order
changes: the right-first path wins across leaves; earlier triangle offset wins within
the same leaf; later packed instance wins across TLAS leaves. Initial distance
limits remain strict unless an already accepted equal-distance candidate needs
tie resolution. Preserve local unnormalized ray directions for instance transforms,
mirroring, normals, primitive/material/medium identities and finite-distance cuts.
Tree construction, serialized IDs, material layout and public API stay stable.

The TLAS stack retains each child's bounds-entry distance. The CPU builder's
packed instance order preserves canonical right-first ties; BLAS traversal
continues to use its original stack and triangle iteration order. This also
retains GPU-built non-power-of-two tree behavior without a new path-key format.

## Candidate evaluation

The independent deferred-reconstruction experiment passed CPU hit equivalence
but changed 156 displayed colour channels (maximum difference 19/255) on the
physical Apple Metal 3 forest10000 comparison. It is rejected from this release.
Combined TLAS/BLAS near-first traversal passed initial image checks but failed a
later moving-camera check: one displayed channel changed by 1/255, with three
HDR channels differing. BLAS-only ordering reproduced the failure. Published
renderer self-comparison passed all 12 poses, while TLAS-only ordering also
passed all 12. A widened-bounds experiment did not restore exact image identity
and is excluded.

The rejected variants, failing receipts and optimization-specific work-count
tests remain in the qualification evidence. The shipping tests require TLAS
pruning, reciprocal reuse and full canonical hit identity; the rejected BLAS
pruning and deferred-reconstruction work-count targets do not apply. No image
tolerance was widened. Physical qualification must cover full moving-frame
RGBA/HDR comparisons, not just the initial camera pose.

## Requirements fixed before implementation

1. Actual WGSL tests compare canonical and candidate hit records across hits,
   misses, parallel/negative-zero rays, inside bounds, grazing/edge/coplanar ties,
   near/far child reversal, finite distance limits, degenerate triangles,
   uninstanced and nonuniform/mirrored instances. Verify closer-first visitation
   reduces work in a constructed occlusion case without dropping valid candidates.
2. Full assembled WGSL/reflection, existing geometry/material/instancing tests,
   source LCOV and >=80% combined coverage, lint, types, build, package admission,
   runtime audit and Zero-Three must pass. Shader coverage exemption does not
   remove changed-source LCOV requirements or actual shader tests.
3. On real WebGPU, use the retained full forest1000/10000-of-each and original
   model/material/Product Studio scenes. Compare baseline and candidate at the
   same camera/sample keys and quality; retain output/HDR evidence, allocations,
   device errors and cleanup. Timing runs alternate warmed baseline/candidate;
   diagnostic GPU counters/timestamps stay outside headline timings. Record all
   failures and reject mechanisms that materially regress correctness or speed.
4. Check fixed-quality synthetic instance scaling and construction/memory limits;
   no substitution of tiny synthetic geometry for real-forest qualification.
5. Update README, Unreleased CHANGELOG, ADR and evidence. Push and verify exact
   head CI; merge and publish only through approved main production cd.yml.
   Then consume the qualified public release in the site with its own task,
   gates and approved production deployment; verify actual public camera/reset,
   full references, unaffected consumers and backend secretref checks.

## Rollout and rollback

This is an implementation optimization of the existing renderer contract, not
a new entitlement or experimental transport mode. Site exposure remains under
the inherited remotely evaluated feature flag and existing route capabilities.
Disable the existing scene-fidelity rollout to withdraw exposure if needed;
restore the previous public package through the normal site change/CI/CD path.
No local publication, manual Azure changes, protection bypass, weaker quality
gate or unrelated dependency refresh. Preserve renderer259 optical/UHD holds,
site2330 dependency hold, disabled professional animation and all other gates.
