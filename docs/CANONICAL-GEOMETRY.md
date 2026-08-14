# Canonical Aura geometry

Version: `aura-lattice/1.0.0`

The executable contract lives in `lib/aura-geometry.ts`. Browser views, projections, observations and exports import that one definition.

## Stable grammar

- 7 nested shells sharing one origin.
- 12 rows × 24 columns = 288 facets per shell.
- Shell-qualified exterior and interior addresses.
- Four corner registers, one centre register and four wrapped neighbours per facet.
- Exact fractions are reconstructed from row and column. Rounded CSV `u,v` fields are not treated as authoritative geometry.
- Each shell can be shown, hidden or isolated independently without changing its canonical topology or address ledger.

Facet number is one-based and row-major:

```text
facet = row × 24 + column + 1
```

Representative mappings:

```text
Facet 1   centre FR1,L001   corners R1,L001 · R1,L002 · R2,L025 · R2,L026
Facet 24  centre FR1,L024   corners R1,L024 · R1,L001 · R2,L048 · R2,L025
Facet 288 centre FR12,L288  corners R12,L288 · R12,L265 · R1,L024 · R1,L001
```

## Coordinate convention

The perception frame is right-handed: `+x` right, `+y` up and `+z` forward. The observer or GoPro MAX rig centre is at `[0,0,0]`.

The R1 horn is singular. Its 24 register identities are meaningful even though the closed geometry collapses them to the same point. The flat inspector therefore shows both the continuous parameter patch and the source's exact corner-ray boundary.

## Tests that protect meaning

`tests/geometry.test.ts` and `tests/projection.test.ts` protect counts, colours, representative addresses, shipped ray directions, horn identity, closed-surface precision, seam wrapping, equirectangular round-trip and the singular patch treatment.

The 4,032 facet-face ledger and 4,032 ray-register ledger are equal in size but not interchangeable concepts.

Automatic display rotation is optional view state, off by default and recorded separately from geometry.
