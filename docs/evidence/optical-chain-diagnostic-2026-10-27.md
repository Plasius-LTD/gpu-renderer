# Bounded optical-chain diagnostic — 27 October 2026

Status: **exact-primary diagnostic prefixes pass; production image qualification
remains pending.** Preserve all previous failures; adaptive remains
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
the production64-interface admission.

The exact-primary rerun on eb1eabc52c93d31af03943939b6d8af4716b55fd completed
all four lanes and all eight selected traces. Capture
`room-reference-2026-10-27T17-45-04-435Z-17d9181f-97cc-40e9-b32f-34206b16c4e0`,
summary SHA256 `66744cf02754d3a99a46bd0ba1342ae1fb214117e3b52990a43d9ce2183e50fa`.
All prefixes compare exactly, without tolerance changes. Samples0–7 terminate
at physical ordinals91,88,1,144,105,1,86,235; all escape and return approximately
.75 radiance. Each diagnostic owns1,704,512 bytes of input/output/staging.
The image still uses64 interfaces and retains its previous filled HDR hash
`a1595985b3a229a28e3c8e25db5207329d51255dac8755159849007072822df1`.
Its all-pixel gate still fails with89.062494% worst error. The batch correctly
remains failed; a passing diagnostic does not promote a failed image. The first
regenerated-ray failure above remains preserved, not overwritten.

The scalar numerical interpreter also had a distinct backing-buffer assignment
defect for struct members. A portable litmus reproduces it in the unmodified
interpreter and validates the scoped RHS-value-copy adapter. Physical shader
source is not rewritten for that interpreter. This is not evidence that a GPU
transport defect has been fixed.

See [streaming design](../design/streamed-optical-interface-budget.md) and
[whole-glass failure ledger](optical-interface-budget-2026-10-27.json). No memory,
performance, band-removal, full4K or release success is claimed here.
