# Provenance

## Read-only source artefacts

| Source | Inspected revision | Use in this repository |
| --- | --- | --- |
| `aura-horn-torus` | `604956894fdecaab0ee05039f91eb129d70c12f1` | Canonical shell order, horn-torus evaluator, 12 × 24 addresses, corner/centre ray registers, face meanings and transforms |
| `aura-scan-pipeline` | `09c50999d0a578c02fe5eb7bbe272e52ddc027e6` | Current export contract, coordinate frames, metadata schema and safe adapter boundary |

Both reference repositories remained read-only and clean during this build.

## Supplied design evidence

Luke supplied the original Aura prototype screenshot `Screenshot 2026-07-06 140914.png`. It is treated as primary design evidence for user-controlled interpersonal distance and social-proximity boundaries. The source image remains in Luke's private files and is not copied into this repository.

## Geometry translation

`lib/aura-geometry.ts` is a TypeScript reconstruction of the executable closed-surface convention in `aura-horn-torus/index.html`, checked against representative records in `data/ray-directions-12x24.csv`.

```text
w = 2πv
ψ = 2π(u − 1/2)
q = R(1 − cos w)
P = (q sin ψ, −R sin w, q cos ψ)
R = 12 / (2π)
```

The new implementation deliberately preserves:

- seven shells: Red, Orange, Yellow, Green, Blue, Indigo and Violet;
- 288 row-major facets on each shell;
- separate `O1…O288` and `I1…I288` face addresses;
- the distinct totals of 4,032 facet-face addresses and 4,032 ray registers;
- 24 separate R1 horn identities even though they share a point and the source direction convention `[0, 1, 0]`;
- seam and ring wrapping.

The source demo's address-camera coordinate mismatch was not copied. Selection uses the same executable convention as the mesh.

Shell visibility and automatic rotation are observation-view state only. Hiding a torus or stopping rotation never changes its 12 × 24 topology, addresses or canonical rays.

## Scan frame translation

Numerical PLY, OBJ and LAS output from the inspected scan pipeline is right-handed, Z-up and metre-based. Aura perception is right-handed with `+y` up. The declared proper rotation is:

```text
[x, y, z]scan → [x, z, −y]perception
```

The adapter does not silently claim a heading or observer-centre registration. A pipeline GLB is already Y-up and must not be transformed twice.

## Source credit

- Based on aura-horn-torus by Luke Nathan Hayes / Strange But True / Aura of Intelligence.
- Original project: https://github.com/auraofintelligence/aura-horn-torus
- Used under the Aura of Intelligence Public Source Licence.
- Based on aura-scan-pipeline by Luke Nathan Hayes / Strange But True / Aura of Intelligence.
- Original project: https://github.com/auraofintelligence/aura-scan-pipeline
- Used under the Aura of Intelligence Public Source Licence.
