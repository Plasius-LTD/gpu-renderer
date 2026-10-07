# CC0 assets for realistic GPU demonstrations

Reviewed 2026-10-05 for Feature plasius-ltd-site#1170, Story #2272 and renderer
Task #230. Animation Adventure remains under Feature #1208 / Story #1398.

The user confirmed that no environment pack is already downloaded and asked for
assets friendly to a free demonstration. Prefer assets that also allow commercial
use and raw-file redistribution: this avoids relying on nonprofit eligibility for
a demonstration hosted by Plasius Ltd. This is an asset selection record, not a
claim that the complete farm environment has been built or approved as Harmony art.

## Sources checked

- [Poly Haven licence](https://polyhaven.com/license): CC0 for its downloadable
  assets; commercial use and redistribution expressly permitted. Website preview
  renders and branding have separate rights. Use downloaded model files in the
  renderer, not publisher preview images as a substitute for rendering.
- [ambientCG licence](https://docs.ambientcg.com/license/): CC0 including raw asset
  files; useful for ground, wood, stone and other material surfaces.
- [Poly Haven API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md):
  source discovery used an identifiable Plasius user agent. Any future live-API
  integration needs the required visible source credit; self-hosted assets do not
  require that API integration. This change adds no runtime third-party API calls.

## First verified rendering fixture

[Wooden Crate 01](https://polyhaven.com/a/wooden_crate_01), by James Ray Cock,
provides a practical weathered-wood/metal material check. The 1k glTF download and
its referenced binary, colour, OpenGL normal and ARM images total 2,277,087 bytes.
All five downloaded files were verified against the publisher's listed sizes and
MD5 hashes; a local provenance manifest additionally records SHA-256 hashes.
No source geometry or texture content was modified for this test.

The real browser preview loads it through `@plasius/gpu-shared`'s existing glTF
loader and passes decoded maps and UVs to the native renderer. It draws 6,576
model triangles plus a two-triangle ground, with a toggle comparing textured and
untextured rendering. Current lighting reveals grain, wear and metal detail;
this fixture is not a finished level or a claim of full cinematic realism.

## Environment shortlist

- [The Shed](https://blog.polyhaven.com/the-shed/): coherent garden/workshop scene
  and a collection of realistic tools and planters, suitable source material for
  the Animation Adventure setting. Inspect and optimize the full scene before
  selecting a web-runtime subset.
- [Planter Box 01](https://polyhaven.com/a/planter_box_01),
  [Rusted Spade 01](https://polyhaven.com/a/rusted_spade_01), and
  [Wine Barrel 01](https://polyhaven.com/a/wine_barrel_01): candidate farm props;
  verify each downloaded file and retain authorship/licence records on adoption.
- [Modular Wooden Pier](https://polyhaven.com/a/modular_wooden_pier): candidate
  authored harbour structure. Its model complexity and multiple-material budget
  require assessment before replacing the procedural Shoreline structure.

High-resolution coastal scans and vegetation can contain millions of polygons;
their presence in a free library does not make them ready for a browser. Require
measured loading, texture, triangle and GPU memory budgets and visual checks after
optimization. Foliage also needs alpha-cutout rendering, which this opaque-material
slice does not provide. Animation still needs actual textured skinning, authored
root motion and an assembled environment before its professional flag can launch.

## Varnish review variant

The local visual review now uses the separately tracked glTF default-factor fix
in gpu-shared#131 and an explicit satin-coating preset on the crate body/lid.
The original downloaded files remain unchanged. The preset is Plasius-authored
shading for review, not a claim that the source asset includes a clearcoat extension.
Source loader correction must publish before downstream site adoption.

### Worn coating refinement (2026-10-07)

The source helper `demo/native-crate-finish.js` explicitly separates wood, rope
and fittings using the following half-open triangle ranges in loader primitives:

| Primitive | Wood | Metal | Rope |
| --- | --- | --- | --- |
| `wooden_crate_01_lid-0` | 0–620 | 620–692 | — |
| `wooden_crate_01-0` | 0–600, 672–1268 | 600–672, 1268–1980 | 1980–5508 |
| `wooden_crate_01_latch-0` | — | 0–376 | — |

These offsets were checked against welded connected components in the unchanged
source mesh, including both rope handles. Do not apply them to re-exported models
solely because names/counts match. The local preview verifies these SHA-256 hashes
before loading the fixture:

- glTF: `fd9c6073acfc671e12b64666053f2805ae33aff5d3dbbcfe5c97c08c06644927`
- binary: `85f381f8035f7a6f2f3b848640894c6d3333b261946dd8a338c0fe19e0bea21e`

The wood preset uses strength 0.75, a roughness factor of 1 and a generated
linear coating map. Red reduces coverage over rubbed patches; green increases
coating roughness using stable UV variation and the source roughness detail.
Default wear is 0.65, with a preview slider from fresh (0) to scuffed (1).
Rope and metal remain explicitly uncoated at every setting. This is authored
demo shading, not measured material data or an edit to the downloaded asset.

Actual WebGPU review passed at camera angles 36° and −40°, including wear 0%,
65% and 100%, and coating off/on. The lit-side rope remains bare while the
wood's highlight softens and breaks up with wear. The preview reported 6,578
triangles at 1440 × 880 with no captured browser warnings or errors. This is
local visual evidence; production adoption and package publication are pending.

### Rope fibre refinement (2026-10-07)

`demo/native-rope-fibres.js` generates additive static geometry on the two
reviewed rope ranges. Root UVs inherit the source colour atlas. Exposed fibres
use a separate matte, zero-coat material without the core's occlusion/normal
maps, while the original rope and worn wood retain their existing materials.
No downloaded file is changed and no new external asset is used.

The review preset uses seed 7349, density 24,000 roots/m², a 1,600-fibre cap,
length 0.010 m and radius 0.00025 m. Most curves are shorter than the length
setting, with 8% longer ends; radius tapers to zero. This is an authored visual
preset for small on-screen fibres, not a measured hemp-fibre specification.
Both handles receive roots (804 left, 796 right in this fixture). The geometry
adds 33,600 triangles, for 40,178 total with the crate/ground; generation occurs
once, outside camera/finish updates. Additional vertex/UV arrays total 5,644,800
bytes; the separate colour-only material adds one 1k decoded colour-map upload
within the existing 64 MiB budget.

Actual WebGPU review exercised the keyboard-operated fibre toggle, left/right
rope-detail views and whole-chest camera angles. The preview recorded no browser
warnings/errors. Fibres remain small and attached to rope, leaving bare fittings
and varied wood coating intact. This is local evidence, with release and site
adoption pending through the existing delivery workflow.

## Controlled ageing review (2026-10-07)

The same verified model and images now use the versioned profile/crate adapter
from ADR-0034. Review defaults are 30% fraying (exactly 480 longer loose ends among
1,600 generated fibres) and 90% varnish-wear intensity. The adapter uses a 14 mm
length scale and 0.32 mm root radius; loose ends use 1.3–2 times that length scale.
An independent seeded permutation keeps loose-end selection nested and root/UV
sampling unchanged when editing fray. Seed controls the fibres; coating retains
its stable UV pattern. Broad wear patches amplify scuffs while preserving islands
of remaining coat. The 40,178-triangle total and additional-array budget are
unchanged. No source asset or licence has changed.

The local fixture at `output/native-texture-preview` consumes the source adapter
with separate fray/wear sliders, fresh/aged buttons and comparison toggles. It
regenerates fibres only on fray/preset edits and rebuilds material resources only
on finish/preset edits. Detail cameras include the complete handle; the whole
view leaves room around the chest. Controls remain labelled and keyboard usable.

Actual WebGPU review covered 0/30/100% fray, 0/90/100% wear, both handles, keyboard
presets/toggles, untextured and uncoated fallback, camera changes during finish
rebuilds, and whole-view comparisons. No new browser warnings/errors were recorded
in the final validation session. Local captures `ageing-chest-review.jpg`,
`ageing-rope-30-review.jpg` and `ageing-fresh-comparison.jpg` live beside the fixture.
Long fibres are most visible at close range; static triangles remain an artistic
approximation, not a structural rope or hair simulation. This remains a local
review with package release/site adoption pending.


## Review correction: bare endpoint and structured nap (2026-10-07)

User feedback supersedes the earlier random 14 mm strand preset. The current
fixture uses explicit mirrored loop/knot centreline guides, with the same `-minY`
grounding offset as source vertices. Four nearby roots share a tuft direction;
small jitter, helical lay, 4.5 mm length scale, 0.16 mm root radius and shallow lift
replace the hay-like long random strands. The 4,000-fibre cap gives 1,200 loose ends
at 30% fray, 84,000 added triangles, 90,578 total triangles and 271,734 vertices.
Final additional vertex/UV arrays use 14,112,000 bytes. No asset images, topology
or licence changed; no new renderer pass or public package API was added.

Coating coverage now smoothly removes surviving islands over the last 30% of
wear. At 100%, coverage and scalar coat strength are exactly zero. Requirements-
first regressions verify monotonic erosion, all-texel zero, off equivalence and
unchanged substrate maps. Actual WebGPU screenshots of the 100%-wear and
coating-disabled states produced identical visible canvas pixels in an isolated
comparison (1,178 by 357 pixels, including the entire chest). Earlier captures
made during viewport changes were discarded as unsuitable comparisons.

The local preview adds labelled close-up views of each rope's fibres, as well as
whole-handle views and the existing controls. Full wear is explicitly described
as unvarnished. This is static groomed geometry; it does not claim a complete hair
scattering, wind or structural-damage simulation. Approved release/site adoption
remains pending under the same feature flag and capability.
