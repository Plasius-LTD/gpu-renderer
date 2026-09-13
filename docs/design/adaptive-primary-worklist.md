# Internal compacted primary worklists

Task gpu-renderer#169; Story plasius-ltd-site#2119; Feature #2114.
Parent flag `renderer.sampling.adaptivePerPixel.enabled` stays off.

## Local staging boundary

Build an internal, independently testable compaction stage on Task 168's
count/metadata resources. Do not wire it into the fixed dispatcher or expose a
live adaptive renderer until the race-free producer (#210), primary MIS (#212)
and baseline/image prerequisites are qualified. The current work is not a site
preview, primary-ray transport integration or a performance claim.

## Contract and tests defined before implementation

For each validated tile/tier, read immutable preselected budgets and compact
tile-local pixel IDs whose budget equals that tier. The selected tier must not
have started contributing samples. Completed counts belonging to earlier tiers
remain valid. Preserve full-screen ownership through the explicit tile mapping;
a queue slot is never a pixel or camera-sample ID.

Use 64-lane workgroup prefix scans and one atomic reservation per workgroup,
followed by a separate indirect-argument finalization pass. Queue order between
workgroups is unspecified; the resulting set must be exact and duplicate-free.
Zero selected pixels produces zero X dispatch groups. Last-workgroup padding
uses an invalid-ID sentinel. Invalid budget/count/failure evidence or capacity
overflow vetoes all primary dispatch rather than accepting a partial workload.

Reserve a 16-byte control record and 256-byte-aligned immutable configuration
slots through the existing lazy resource owner/cap. All allocations and pipelines
remain absent when disabled. Configuration is 32 bytes; indirect arguments remain
12 bytes. Do not overwrite one slot for multiple in-flight tile/tier commands.

Tests: final assembled WGSL reflection/generated constants, explicit layouts,
configuration limits, tile edges, empty/full/mixed worklists, all tiers through
256, sentinel/bounds/overflow behavior, zero/invalid counts, source ownership,
disabled no-touch, pipeline failures, byte admission and immutable slots. Build
a physical fixture before claiming WebGPU execution. CPU/reference or reflection
success does not establish GPU execution, transport correctness or faster frames.

No contributing sample is drawn by this stage. Actual ray generation, count
commit/resolve, focus policy, diagnostics and site integration remain to be
connected under the same Task hierarchy. Three.js cannot be a fallback. No local
publication or production/CI gate bypass is permitted.
