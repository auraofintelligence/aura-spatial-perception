# Development progress

This is the short, public progress README for the `dev` branch. It records what can be used today, what is being repaired, and what has not earned a “working” label yet.

Last updated: 14 August 2026.

## Working now

- One canonical 12 × 24 Green horn torus starts active; the other six are deliberate optional layers.
- A local 2:1 GoPro MAX JPG can be loaded without uploading its bytes.
- Facets can be selected in the 3D view and flattened panorama map with source-scoped addresses and neighbours.
- The browser calculates real seam-aware image-edge evidence for the selected facet.
- Human-entered ranges, known-length/angular-size constraints and calibration disagreement are stored with provenance.
- A known-length/angular-span constraint can place a traceable estimated metre point on the selected source-scoped ray.
- The separate two-panorama command now solves relative camera motion and sparse 3D points locally. On one private overlapping pair, 90 points passed the geometry gates from 126 motion-consistent matches; private media and outputs stayed outside the repository.
- Range-constrained points export as JSON, PLY and OBJ point samples. They are not presented as reconstructed meshes.
- Local observation JSON can be saved and restored; private media must be reattached by the user.

## Repaired in this checkpoint

- Outside-orbit and inside-photo viewing directions now remain stable when a facet, layer or evidence record changes.
- The controls and readout now separate the physical horn, spherical GoPro viewing image and Aura ray-address layer.
- Inside view now has a visible ray profile; outside view shows ray length through and beyond the horn without inventing a hit.
- A known-size/angular-span result can now be placed as a traceable estimated metric point on the selected Aura ray.

## Active development

- Import accepted triangulated points into the source-scoped Aura evidence package without pretending they form a surface or mesh.
- Add a simple browser workflow for choosing a panorama pair, reviewing quality and accepting only selected points.

## Not working yet

- Automatic panoramic depth or metric range estimation.
- Surface grouping, semantic segmentation or object detection.
- Face-indexed scene meshes or texture reconstruction.
- Native GoPro `.360` pixel decoding and timed GPMF telemetry extraction.
- Registration of the 34 separate JPG capture positions into one shared site coordinate frame.
- Single scanned-print reconstruction. A single print can eventually produce a provisional 2.5D scene, but metric scale needs camera calibration or a known dimension and hidden surfaces remain unknown.

## Next useful milestones

1. Known-size range: add an on-image two-point span marker so the browser calculates the angle now entered manually.
2. Ground-plane range: enter a verified camera height and horizon/orientation, then intersect downward panorama rays with the ground plane.
3. Multi-view reconstruction: extend the working two-panorama sparse solver across a registered capture sequence, then import accepted point clouds through the scan-pipeline adapter.
4. Scanned print: add a perspective-photo source type, user calibration and local relative-depth output, clearly labelled as provisional where geometry is not observed.

## Branches

- `main`: reviewed public checkpoint.
- `dev`: active, inspectable development with this progress file kept current.

## Privacy boundary

The private site JPG, MP4 and `.360` fixtures are not committed to this repository or embedded in exported observation JSON. Development uses them locally and publishes only code, documentation and explicitly approved non-private outputs.
