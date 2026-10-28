# ADR 0044: Scalable instance texture storage

Status: Accepted. Date: 2026-10-28.
Task: gpu-renderer #268. Story: plasius-ltd-site #2342. Feature: #1170.

## Context

ADR 0043 introduced shared BLAS geometry but its initial texture placed one
144-byte instance record on each row. That coupled instance count to texture
height and padded every CPU upload row to 256 bytes.

## Decision

Keep the nine integer texels per record and existing sampled-texture binding.
Place whole records horizontally and then vertically, deriving shader addresses
from the actual texture width. Plan storage against the granted device's
maxTextureDimension2D, with safe unsigned addressing. Requested storage includes
unused final-row texels. GPUQueue.writeTexture does not require 256-byte row
alignment; upload complete rows in at most 8 MiB chunks, waiting with the existing
bounded completion helper before requesting further staging.

Preserve logical instanceBytes and add instanceTextureBytes to memory estimates.
The authoritative allocation tracker continues to enforce every resource and
aggregate requested byte budget before allocation. Include mandatory balanced
TLAS nodes in the early minimum check, before constructing acceleration data.
This is a lower bound, not a promise that all renderer resources fit.

## Consequences and qualification

No application-defined instance-count ceiling replaces the device limits. Unique
mesh and BLAS allocation, material identity, inverse-transpose normals and static
non-emissive support stay unchanged. Instancing saves storage but not shading
work. Dimension boundaries, padded rows, bounded uploads, loss/rejection and
30,000-instance sharing are tested; full mixed-scene GPU evidence belongs to the
linked Story before production qualification.

The public host retains gpu-demo.scene-fidelity.enabled and
site.studio-coming-soon.view, evaluated by its existing remote services. Rollback
uses those controls or the previous approved deployment. Release only through
main cd.yml with the production environment before consumers adopt this package.
