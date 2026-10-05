# ADR-0031: Authored material maps in native surfaces

Status: Accepted for implementation; release and visual scene qualification pending.

Feature: plasius-ltd-site#1170; Story #2272; renderer Task #230.
Flag: `gpu-demo.scene-fidelity.enabled`; existing route capability remains authoritative.

## Decision

Add optional UVs and contiguous material draw ranges to the native scene frame.
Accept decoded RGBA maps at initialization, using the existing gpu-shared glTF
loader's image representation. Keep the twelve-float vertex layout and old call
shape. No new fetch/image decoder, third-party renderer or scene format is added.

Upload authored colour to sRGB textures; normal and ORM maps remain linear.
Generate complete mip chains, filtering colour in linear light. Use repeating,
trilinear, anisotropic sampling. Derive tangent frames from world/UV derivatives,
with geometric-normal fallback for degenerate UVs. Both reflected and main
surfaces bind the same material; the depth-only shadow pass keeps one mesh draw.

Materials are immutable for the renderer lifetime. Limit callers to 16 materials,
256 contiguous draw ranges, power-of-two maps up to 2048, and 64 MiB decoded source
bytes. Validate data before GPU allocation and ranges before submission. Own and
destroy material textures alongside other native resources, including failures.

## Alternatives and limits

The existing wavefront atlas resource uploads a single linear image with no mip
chain. Reusing it for colour would lose correct sRGB filtering. The new helper is
specific to native surfaces; the separate wavefront renderer remains unchanged.
A shared cross-renderer texture API can be considered when both contracts align.

This slice supports opaque surfaces and standard normal/ORM maps. It does not add
alpha cutouts, separate occlusion UV sets, emissive, transmission, skinning or full
global illumination. Stock CC0 assets remain demonstration assets, not Harmony canon.
Caller-owned network loading retains its own cancellation and timeout boundary.

## Validation and rollout

Tests cover colour/data mip behaviour, UV/range validation, old callers, both
colour-pass bindings, upload reuse and resource disposal. Require actual WebGPU
textured-model evidence, changed-source LCOV, types/lint/build and approved CI/CD.
Consumers adopt only the published version. The scene-fidelity flag rolls back
public exposure; the library retains its untextured API for existing callers.
