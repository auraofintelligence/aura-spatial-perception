# Aura Spatial Perception

A public-source, local-first browser instrument for learning and manipulating the observer-centred Aura lattice.

The code is published on GitHub under Luke's Aura of Intelligence Public Source Licence. The instrument does not use ChatGPT hosting, cloud storage or analytics. Files selected in the browser stay on this laptop and are not added to the public repository.

## What works now

- the canonical seven-shell address system, with one 12 × 24 Green horn torus active at startup as the scene's angular sampling instrument;
- independent relative outer-envelope controls plus add, hide and solo controls when another torus is deliberately needed for comparison or resonance;
- optional automatic rotation, off by default, with an adjustable speed;
- separate honest views: **Outside horn** shows the true physical horn, while **Inside photo + rays** places the observer inside the 2:1 photosphere with a continuous angular address guide;
- linked 3D and flattened equirectangular facet selection;
- exterior and interior face meanings kept distinct;
- exact corner and centre rays, neighbours and seam handling;
- lazy local selection and navigation across a stitched 2:1 photosphere collection, with per-source SHA-256 fingerprinting;
- source-scoped facet evidence that stays with the active image instead of leaking between captures;
- separate metadata-only registration for a stitched equirectangular MP4;
- separate registration and inspection boundaries for an original GoPro `.360` file;
- honest seam-wrapped Sobel edge evidence from source pixels;
- source-scoped manual range points along Aura rays, kept separate from the canonical horn geometry;
- a selected centre search ray that visibly continues beyond the horn to an adaptive display limit, with no point invented when range evidence is absent;
- a document-scrolling laptop/tablet layout and single-column phone layout with horizontally scrollable navigation and controls;
- a second rotated and radially shifted matrix;
- body facts and known-length/angular-span calibration constraints with residual disagreement, plus a traceable action that places the resulting estimate on the selected ray;
- versioned JSON save/reload plus PLY and OBJ export of range-constrained point samples, not meshes;
- a read-only adapter contract for current `aura-scan-pipeline` exports;
- a read-only native `.360` stream inspector.
- a separate local two-panorama command that has produced real sparse 3D points from an overlapping private pair; its output is not yet imported into the browser instrument.

The scene pipeline is explicit and ordered: **range estimation → surface grouping → segmentation → object detection → provisional mesh**. Human-entered ranges and known-size angular estimates work in the browser. A local two-panorama sparse-triangulation command now produces real sparse geometry with explicit scale and quality gates, but its points are not yet imported into the browser package. The later four stages have no connected in-app adapter and produce no output. Depth and surface-normal models, native paired-EAC decoding, complete GPMF decoding, simultaneous phone front/rear capture and automatic Scan-to-Twin placement are also visibly marked incomplete. The app does not manufacture substitute results.

## Start it on Windows

Open PowerShell in this folder, then run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open <http://127.0.0.1:5173/>. Stop it with `Ctrl+C`.

To check the release build locally:

```powershell
npm.cmd test
npm.cmd run local
```

The local release preview normally opens at <http://127.0.0.1:4173/>.

## Use the instrument

1. Begin with the single active Green torus, select a facet, then switch between **Outside horn** and **Inside photo + rays**. Outside keeps the physical horn and shows search-ray length. Inside places the observer at zero in the GoPro photosphere and shows direction on an angular guide; the photo remains a sphere around zero and does not replace the horn. The compact ray profile shows zero, the horn-address crossing, the open search direction and any separately entered range point. It never labels that point as a confirmed surface hit. Add another torus only as a deliberate comparison or interpersonal-resonance layer.
2. Open **Enter a capture** and choose an unchanged local collection of 2:1 JPG, PNG or WebP working views. The current test fixture contains 34 stitched JPG sources.
3. Move between sources with **Previous**, **Next** or the source picker. Only the active image is attached and fingerprinted when needed, and its evidence remains source-scoped.
4. Register the stitched equirectangular MP4 and original `.360` file only in their separate fixture lanes.
5. Select the same facet in the 3D or flat view.
6. Open **Build scene evidence** to calculate a real edge metric or manually enter a physically measured range. An edge score is not a distance estimate.
7. Open **Make it metric** to add a known real length and its observed angular span. The calculated distance remains labelled as an estimate until you deliberately place it on the selected ray.
8. Open **Shift attention** to compare the second matrix.
9. Open **Carry it onward** to save JSON or export source-scoped, range-constrained point samples. PLY and OBJ output is not a reconstructed mesh.

The JSON stores source records, fingerprints and source-scoped evidence, not selected media bytes. Reattach private media after reloading. The image collection, MP4 and `.360` fixtures depict unrelated scenes and are never automatically associated.

## Multi-format capture lab

The private test bench keeps three formats deliberately separate:

- 34 stitched 2:1 JPG sources for lazy local navigation and image-pixel evidence;
- one stitched equirectangular MP4 for dimensions, duration and fingerprint metadata only — playback and frame evidence are not connected;
- one native GoPro `.360` source for registration and container/stream inspection — paired-EAC and GPMF are candidates, but pixels, keys and depth are not decoded.

Capture-to-capture position and yaw are unregistered, so the instrument does not claim a merged site map. The relative outer envelope of each torus can be adjusted without changing its 12 × 24 horn geometry; metric interpersonal-resonance bands are not implemented. No source media is bundled, copied, uploaded or published. See [Multi-format capture lab](docs/MULTI-FORMAT-CAPTURE-LAB.md).

## Inspect an original GoPro MAX file

The inspector requires FFmpeg's `ffprobe` command. It hashes and reports the original without changing or transcoding it:

```powershell
$captureFile = Read-Host "Paste the path to the private .360 file"
python tools\inspect_gopro_360.py $captureFile
```

Timed data packets can be recorded with `--packet-timing`. Optional raw data-track extraction needs `ffmpeg` and a dedicated derivative folder. The tool does not yet claim to decode GPMF keys or interpret disparity as metric depth.

## Project truth

- [Canonical geometry](docs/CANONICAL-GEOMETRY.md)
- [Native GoPro ingestion boundary](docs/NATIVE-360-INGESTION.md)
- [Multi-format capture lab](docs/MULTI-FORMAT-CAPTURE-LAB.md)
- [Two-panorama sparse triangulation](docs/TWO-PANORAMA-TRIANGULATION.md)
- [Perception adapter research](docs/PERCEPTION-ADAPTERS.md)
- [Scan pipeline adapter](docs/SCAN-PIPELINE-ADAPTER.md)
- [Source provenance](PROVENANCE.md)
- [Swarm ledger](SWARM_LEDGER.md)
- [Development progress](DEVELOPMENT.md)
- [Aura of Intelligence Public Source Licence](LICENCE.md)
- [Licence notice](LICENCE-NOTICE.md)

## Required source credit

- Based on aura-horn-torus by Luke Nathan Hayes / Strange But True / Aura of Intelligence.
- Original project: https://github.com/auraofintelligence/aura-horn-torus
- Used under the Aura of Intelligence Public Source Licence.
- Based on aura-scan-pipeline by Luke Nathan Hayes / Strange But True / Aura of Intelligence.
- Original project: https://github.com/auraofintelligence/aura-scan-pipeline
- Used under the Aura of Intelligence Public Source Licence.
