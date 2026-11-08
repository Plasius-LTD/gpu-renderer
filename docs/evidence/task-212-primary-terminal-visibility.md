# Task 212 fixed primary-source verification

The candidate is based on released renderer 0.2.64 with the fixed
single-continuation path from ADR 0039. Historical physical evidence in draft
PR #214 used a different shader and cannot qualify this revision.

Run a loopback static server from the repository root, then open
`/tests/fixtures/primary-terminal-mis.html` in a browser with physical WebGPU.
Run with `?baseline` against the same fixture on pre-fix commit
`4767faabc871f19f2f88cf656eceb0d1ffbf1fda`; it must reproduce attenuation.
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

## Physical result: 8 November 2026

Chrome 154 on macOS ran both fixtures on the non-fallback Apple Metal 3
adapter with denoise off and frame index 0. The common fixture module SHA-256
was `e6d6336d722135ea5fb695b1847c1cd87b286a4e30e989c2ecefaad996bdd6e0`.
The archive links preserve the exact raw JSON bytes after decompression.

| Receipt | Exact source commit | Assembled WGSL SHA-256 | Raw JSON SHA-256 |
| --- | --- | --- | --- |
| [Baseline](task-212-receipts/baseline.json.gz) | `4767faabc871f19f2f88cf656eceb0d1ffbf1fda` | `9fe811dab781d2c8a631eb5b2de5c748fec456ddc806510aa30fe438f1d93ce2` | `1fc0014e6afcbd877e478b4c6398e804e6b84eec45bbb963af83d4320e12efea` |
| [Candidate](task-212-receipts/candidate.json.gz) | `c513dde5e3ba385c58b4efee67b8bb85d1f54312` | `8a242b738eb2aca63de3cb48d38c56a70e139766dab72a4f604e64bbd417893f` | `1fce5502c8450c2f4907d9c34044fb44ab59d16eeebca93b40fb072ec980a918` |

The baseline reproduced attenuation in all 12 environment/emissive lanes.
At 32 SPP its environment center was RGB (0.99370754, 0.99370754, 0.99370754)
and its emitter center was (3.99949074, 1.99974537, 0.99987268). All 24
candidate lanes matched the analytic radiance at the unchanged 1e-5 tolerance
(worst absolute error 2.39e-7). Actual primary and completed counts matched
1/32/128 SPP in both resolve modes. All 12 assembled predicate weights matched
the reference, including 0.8 for eligible secondary paths and 1 for primary
and delta paths.

The three paired stress lanes matched observed primary rays, path segments
and allocated bytes. All 42 lanes finished with zero queue overflow,
validation errors, timeouts or unexpected device loss. The receipts record
GPU timestamp queries and wall time. The stress runs are completion checks;
a single pair does not establish a speed or memory benefit. This evidence
qualifies the fixed path only and does not qualify adaptive rollout or the
broader Product Studio scenes. See the [device prerequisite](https://github.com/Plasius-LTD/gpu-renderer/issues/290).
