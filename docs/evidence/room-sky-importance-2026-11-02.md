# Fixed32-SPP room sky-importance attribution — 2 November2026

Task#234 / Feature site#2114. Result: reject this flag as a solution for the
remaining noise on the captured implementation. This is descriptive evidence,
not a confidence study, converged-reference qualification or performance claim.

Four automatic native1920x1080 original-room captures retain all reference
models, uniform32, ordinary20/optical2048, daylight, clearance.0001m, denoise/
splitting/rough off and independent reference transport keys. Order is uniform7,
cosine7, cosine19, uniform19. Only bit16 changes (181248 versus181264). All
camera samples are individually counted; exact total is265,420,800 across
the four captures. Each has66,355,200 samples and8 lossless HDR chunks.

| Comparison | RGB RMSE | Energy change |
| --- | ---: | ---: |
| Uniform key7 versus19 |0.2155803968 |+0.02182% |
| Cosine key7 versus19 |0.2164900407 |+0.01899% |
| Cosine versus uniform, key7 |0.0324575419 |-1.59039% |
| Cosine versus uniform, key19 |0.0331836266 |-1.58760% |

Cosine/uniform independent-pair MSE ratio is1.0084568265: no descriptive variance
gain. Both energy differences fail the unchanged1% screen. All same-seed
per-tile primary, secondary, bounce-histogram and optical-segment counts match.
Uniform hashes exactly reproduce the two earlier independent32-SPP controls.
No missing/invalid HDR pixels, chunks, probes, setup records or cleanup failures.
These ray counters exclude shadow/BVH queries; instrumented time is not used
as performance evidence. No4K run of this unhelpful candidate is claimed.

Source pins, receipt/HDR/PNG/summary hashes and exact metrics are in the
adjacent JSON. Full private local receipts, native PNGs,32 HDR chunks and every
checkpoint are preserved under ignored `output/playwright/eames-environments/`:
batch `room-sky-importance-4d874e20-82b0-4aea-9945-3a6796fb9929`. Read-only
verification uses `scripts/verify-room-sky-importance.mjs` and pinned
gpu-lighting metrics. The source snapshot is renderer34dc852; later tooling and
test-only commits do not change this captured shader. CPU/browser coverage is
separate execution evidence and not timing qualification.

Retained32/128/256 uniform seed-pair MSE multiplied by SPP is1.48720/1.46000/
1.47308. This is consistent with1/N variance scaling, not proof of unbiasedness.
At256, the largest0.1%/1% of pixel differences carry20.61%/39.66% of squared
error. The existing3% reference-convergence screen still fails; earlier4K
convergence evidence remains incomplete. No thresholds are relaxed.

Independent review and production-function quadrature subsequently identify
unreported ordinary BSDF proposals (Task#271 / ADR0068). That separate defect
is confirmed by a controlled expectation2.33336 where1 is required. This does
not prove it explains every visible artifact or the sky shift. Keep these
captures as pre-correction evidence, leave the sky flag off, qualify the fix
and establish a new fixed baseline before resuming adaptive performance or
updating the white paper with improvement claims.
