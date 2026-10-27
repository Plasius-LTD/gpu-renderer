# Bounded optical-chain diagnostic — 27 October 2026

Status: **diagnostic prefix gate failed; production streaming is not implemented
or qualified.** Preserve all current renderer/image failures; adaptive remains
paused. Task234 / Story2291 / Feature2114; PR216 remains draft.

The helper at63a1870 is diagnostic-only and is not assembled into the production
transport module. Production WGSL SHA remains
`c8ac9e819c7b6264df42d44cea8fad2627fec9d522e58161ee88807ec85a0c01`.
It walks bounded smooth zero-direct optical chains using the canonical query,
BSDF/PDF/medium/roulette helpers and absolute physical ordinals. Rough/partial
and ordinary surfaces stop the helper. Numerical40-TIR continuation and ordinary
exclusion controls pass; those do not certify original camera-ray equivalence.

The first physical4096-interface diagnostic at the filled-glass edge retained
capture `room-reference-2026-10-27T17-34-21-765Z-cb0b6b6f-4371-4042-ad2d-1e190ea2d314`.
It rejects sample2 at prefix record0: independently regenerating the camera ray
in another compiled entry differed by one ULP in its normalized direction. The
saved failure includes the diagnostic ray/hit records and existing native
failure telemetry. No result from that attempt is promoted to a pass.

Correction: retain origin/direction W components in the original canonical
journal and upload its exact96-byte primary packet into a private input buffer.
Do not normalize or regenerate that ray, alter source dimensions or relax the
exact prefix gate. Add packet/identity tests and preserve earlier successful
diagnostics when a later selection fails. Partial diagnostic buffer allocation
must clean up. This changes only diagnostics, not accepted radiance/counts or
the production64-interface admission. A new physical rerun is required.

The scalar numerical interpreter also had a distinct backing-buffer assignment
defect for struct members. A portable litmus reproduces it in the unmodified
interpreter and validates the scoped RHS-value-copy adapter. Physical shader
source is not rewritten for that interpreter. This is not evidence that a GPU
transport defect has been fixed.

See [streaming design](../design/streamed-optical-interface-budget.md) and
[whole-glass failure ledger](optical-interface-budget-2026-10-27.json). No memory,
performance, band-removal, full4K or release success is claimed here.
