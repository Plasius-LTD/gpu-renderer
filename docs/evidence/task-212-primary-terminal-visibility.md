# Task 212 fixed primary-source verification

The candidate is based on released renderer 0.2.61 with the fixed
single-continuation path from ADR 0039. Historical physical evidence in draft
PR #214 used a different shader and cannot qualify this revision.

Run a loopback static server from the repository root, then open
`/tests/fixtures/primary-terminal-mis.html` in a browser with physical WebGPU.
Run with `?baseline` against the same fixture on pre-fix commit
`2094047610d6ea4a3bd424a2dd4becd45ebfbdb9`; it must reproduce attenuation.
On the candidate, run without that option for both resolve modes at 1, 32,
and 128 SPP with denoise off. The reference is RGB (1,1,1) for constant white
environment, mirror and glass, and (4,2,1) for the directly visible emitter.
The absolute tolerance is 1e-5. The fixture executes the assembled WGSL
predicate on the adapter and records every controlled sample's termination
count, independent of the scheduler count or the deferred accumulation alpha.
Retain both downloaded raw receipts, exact source revision and fixture hashes.

Use `?stress` for additional 1080p, 1440p and 4K smoke lanes at depths 1, 4
and 8 respectively, at 4 SPP. Record renderer memory, dispatch time, observed
rays/segments, overflow and validation/device status. These smoke lanes do
not substitute for the fixed reference image matrix in site #2168 and do not
establish a performance claim.

Status: requirements-derived regression reproduced on the released shader.
Physical receipts for the current revision remain required before release.
