# Experimental adaptive complete-sample integration

Task gpu-renderer#169, with #168/#210/#212; parent Feature
plasius-ltd-site#2114, inherited `renderer.sampling.adaptivePerPixel.enabled`.
All public flags stay off. This isolated integration branch combines PRs
213/214/215 for testing; it does not approve or release those prerequisites.

## Fixed baseline and path storage

The corrected fixed baseline is the assembled transport from PR 214 commit
`dcf990ebc948493fe23904549bd6e0bed2ae18fa`, including branch-owned PathNode records
and primary-visibility MIS correction. Its assembled source must remain identical
after composition with the shared camera fragments. This is an explicitly changed
baseline, not a claim that fixed transport equals the earlier released shader.
Retain earlier receipts as historical evidence for their original commits.

Bootstrap now binds the canonical 64-byte PathNode ABI. Invalidate selected root
records before dispatch; each real bounce invocation initializes its own complete
node, including parent/children/identity. Do not address depth-owned child queues
as the old per-pixel vertex chain. Preserve unselected roots and existing bounded
allocations. Missing roots, failed reservations and invalid lineage cannot commit.

## Complete-camera boundary

After the existing prepared bounce sequence, dispatch one invocation per tile
pixel to produce the existing 32-byte AdaptiveCameraSample. Use the canonical
`resolve_complete_path_tree`, not a copied material evaluator or new integrator.
Require coherent immutable frame/tile/ordinal/tier configuration, sample weight
one, a valid maximum sequence period, zero pending active/next rays, successful
worklist control and no queue-overflow evidence. Validate buffer bounds before
reading. Reduce every sibling before setting complete status. Legitimate black
terminals count; partial, stale, nonfinite, wrong-owner or failed trees do not.

Execute the existing selected-tier commit only after producer completion, then
reuse sample/path scratch for the next absolute ordinal. Final sum/count resolve
occurs after every tier. No variance stopping, history or public presentation is
introduced in this slice. Any pixel/frame failure rejects the render; partial
success is not image-quality evidence. Reuse the capped allocation owner's sample,
sum, output and immutable configuration buffers; no additional storage allocation.

## Requirements-first qualification

Reflect the actual producer module and canonical records; verify fixed shader
identity against the corrected baseline and disabled no-touch behavior. Test
ordered encoding, bounds/reserved fields, immutable offsets and propagated errors.
Physical tests must connect real compaction, bootstrap, camera, mesh-BVH transport,
canonical tree reduction, selected count commit and actual-count normalization.
Cover unequal tiers, both scheduling orders, sample period independent of budget,
black/environment/emissive/diffuse/metal/glass, sibling completion, duplicate or
missing samples, poisoned lineage, queue failure, tile reuse, and cleanup.

Use linear float32 readback with denoise disabled; retain hashes, counts, energy,
failures and allocation bytes separately from fixture staging. A controlled white
environment is an analytic correctness probe, not a matched-quality benchmark.
Do not infer noise reduction, speedup, total-memory savings or Eames qualification.
README, Unreleased CHANGELOG, ADR and evidence must state these boundaries.
CI/CD, full reflection tooling release, broad physical/image/stress qualification
and independent modes remain prerequisites to enablement/publication claims.
Three.js is permanently prohibited; rollback is fixed GPU-native rendering only.
