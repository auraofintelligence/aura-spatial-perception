# Aura Scan Pipeline adapter

The adapter in `lib/scan-adapter.ts` targets the inspected `aura-scan-pipeline` revision `09c50999d0a578c02fe5eb7bbe272e52ddc027e6` and metadata schema `aura-scan-metadata/2.0`.

## Accepted export boundary

Require:

- `metadata.json`;
- its referenced `pointcloud_ply`;
- either its referenced `lod2_ply` or `lod2_obj`.

`lod1_glb` is optional display geometry. Referenced paths must be relative and remain inside the export folder. Untouched source metadata and geometry should be hashed before use.

## Frame rule

Numerical geometry is declared right-handed, Z-up and metre-based. The adapter declares `[x,y,z] → [x,z,−y]` for the Aura Y-up frame. The GLB is already Y-up.

The scan's yaw is arbitrary and its origin is not guaranteed to be the observer or GoPro rig centre. The default record therefore remains:

```text
headingStatus = unknown
originStatus = unregistered
publicationAllowed = false
```

Do not attach scan points to Aura facets until an explicit scan-to-observer transform is supplied.

## Honest upstream gaps

Current metadata does not preserve source/output checksums, an immutable manifest snapshot, a stable capture identity, picked control-point coordinates or every file's frame. A fresh run UUID is not an asset identity, and output may be overwritten.

Living Twin ingestion is proposal-only. The adapter must not auto-copy, publish, infer placement, infer consent or claim cultural review.
