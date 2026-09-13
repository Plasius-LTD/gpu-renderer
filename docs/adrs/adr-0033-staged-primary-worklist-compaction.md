# ADR 0033: Stage bounded tile/tier primary worklists

- Status: Internal stage implemented; physical execution/integration pending
- Date: 2026-09-13
- Task: gpu-renderer#169; Story: plasius-ltd-site#2119; Feature: #2114
- Flag: `renderer.sampling.adaptivePerPixel.enabled` (off)

## Decision

Preselect per-pixel budgets before contributing samples. Compact each tile/tier
using a 64-lane prefix scan and one atomic reservation per workgroup, then
finalize indirect arguments in a separate pass. Workgroup order is unspecified;
worklist entries are explicit tile-local pixel identities, not temporary slots.
The current stage never executes material transport or contributes radiance.

Initialize the relevant worklist region with invalid-ID padding. Retain candidate
count and failure flags separately from the 12-byte indirect argument record.
Invalid config/counts, failed pixels, previously started selected tiers or
overflow suppress dispatch. Diagnostics must distinguish candidate reservations
from accepted work when the failure word is nonzero.

Use the existing allocation owner and cap for 16-byte controls and immutable
256-byte config slots. The exact 32-byte payload and offsets come from final
WGSL reflection. Encode all three passes from the same validated tile descriptor;
do not accept an independent thread count that could omit pixels silently.

## Qualification and integration

Retain requirements-first CPU/reference/layout/byte-admission tests and a physical
compaction/indirect-identity fixture. Neither reference nor reflection checks prove
the WGSL executes correctly. Qualified branch-owned transport (#210/#212), real
compacted camera-ray generation, absolute ordinals, unweighted sum/count resolve,
image tests and matched-quality timings remain prerequisites for live enablement.
There is no alternate shader transport, temporal history or public API added here.

Disabled fixed rendering is byte-identical and allocates no adaptive state.
No release/CI bypass, local publishing or Three.js fallback is allowed.
