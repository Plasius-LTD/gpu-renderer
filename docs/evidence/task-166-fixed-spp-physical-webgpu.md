# Task 166 fixed-SPP physical WebGPU evidence

- Date: 2026-08-30
- Task: [gpu-renderer#166](https://github.com/Plasius-LTD/gpu-renderer/issues/166)
- Runtime: Chrome 152 on macOS through the managed Playwright browser
- Adapter: Apple, `metal-3`
- WebGPU timestamp queries: supported and requested
- Result: pass

## Qualification lane

The package was built with Node.js 24.14.0 and its final `dist/index.js` module
was loaded in an isolated `http://127.0.0.1` page with COOP/COEP headers. The
page created a real WebGPU renderer for a 16 by 16 analytic scene, one SPP, and
two maximum bounces. It rendered once through the unchanged fixed path and once
with awaited `readStats` telemetry. No fake device, shader module, pipeline,
bind group, queue, buffer, or timestamp result participated in this lane.

Physical compilation exposed and the implementation corrected two baseline ABI
drifts before the passing run:

- `TriangleRecord` had gained fields while two positional WGSL constructors
  retained the old arity. Triangle initialization now uses zero construction
  plus named field assignment.
- The final trace shader declared extension textures at bindings 33 through 44,
  but the trace bind-group layout stopped at binding 32. The layout and device
  sampled-texture limit now match the existing shader/resource ABI.

The renderer also uses the standard
`GPUShaderModule.getCompilationInfo()` preflight API, so module diagnostics are
available before pipeline creation.

## Captured result

| Evidence | Value |
|---|---:|
| Fixed primary rays | 256 |
| Fixed ray telemetry status | `not-requested` |
| Fixed telemetry memory | 0 bytes |
| Measured primary rays | 256 |
| Measured secondary rays | 209 |
| Total path segments | 465 |
| Bounce histogram | `[256, 209]` |
| Ray telemetry status | `available` |
| Timing source | `timestamp-query` |
| Timestamp-query status | `available` |
| GPU span | 0.32768 ms |
| Awaited render-job time | 18.42 ms |
| Telemetry memory | 48 bytes |
| Queue overflow | 0 |
| Device loss | not detected |
| Invalid radiance samples | 0 |

Every qualification assertion passed: the fixed renderer allocated no
telemetry resources, scheduled and observed primary counts matched, exact ray
counts were available, total path segments included every primary, timing
evidence was available, no transport guardrail failed, the queue did not
overflow, and the device remained stable.

The aggregate transport status was `warn`, not `fail`, solely because 12
unbiased weighted samples exceeded the historical preview clamp threshold.
Device loss, queue overflow, submission batching, and ray-count telemetry
checks all passed; no invalid radiance sample was recorded.
