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
