# TDR 0007: Scalable instance qualification

Date: 2026-10-28. Task #268, site Story #2342, Feature #1170.
Controls: gpu-demo.scene-fidelity.enabled and site.studio-coming-soon.view.

Require exact record recovery across row/chunk boundaries, zero final padding,
byte-accounted allocation and controlled dimension/ID/budget errors. Test 1,000,
5,000, 10,000 and 30,000 instances retaining one BLAS per unique mesh; ensure
camera changes reuse acceleration and disposal releases every tracked resource.

Record actual mixed-scene qualification separately from CPU/mock GPU tests.
Real WebGPU must compile the packed addressing shader and render the three
requested crowd/vegetation tiers before those tiers become production choices.
Requested storage is not physical VRAM or driver overhead. No unmeasured frame
rate or animation guarantee is implied.


Initial real WebGPU qualification (2026-10-28, local in-app browser) completed
1,000, 5,000 and 10,000 each of astronauts, trees and selected individual shrubs
at 800×500, 16 SPP, six bounces and denoising. The tiers used 6,001 / 30,001 /
60,001 mesh instances and retained 265,135 unique triangles in seven primitives.
Requested resource bytes were 304,475,680 / 310,186,720 / 317,391,040. Completion
including source loading/preparation was 12.58 / 12.11 / 13.31 seconds in these
runs. These timings describe this machine/session, not an isolated performance
benchmark. Longer refinement and production acceptance remain tracked by Story
#2342. Evidence is in output/scalable-scenes-2026-10-28 in the task workspace.
