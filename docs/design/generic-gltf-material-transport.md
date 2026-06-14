# Generic glTF Material Transport

## Goal

Remove Eames-specific surface overrides and make the renderer consume authored
material inputs generically.

## Scope

- parse and forward generic glTF material factors from the validation loader;
- preserve those values through `buildEamesMeshes(...)`;
- extend wavefront GPU records so shading can read specular colour, sheen
  colour, clearcoat, transmission, and IOR;
- use those values in direct lighting and scatter selection.

## Explicit Non-Goals

- full glTF extension-texture support for every `KHR_materials_*` feature;
- a complete microfacet/MIS rewrite in this change;
- HDRI prefilter/LUT integration in this change.

## Validation

- unit tests for generic material forwarding and packed GPU records;
- package typecheck/build/test;
- follow-on screenshot validation after the shader path is stable again.
