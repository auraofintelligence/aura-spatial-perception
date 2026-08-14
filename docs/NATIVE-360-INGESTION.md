# Native GoPro MAX ingestion boundary

## Working now

- The browser can register an original `.360` file as a local source record without uploading or transcoding it.
- The browser can lazily select and navigate an unchanged stitched 2:1 image collection, calculate per-source SHA-256 fingerprints and wrap the active source around the Aura origin.
- Facet evidence is scoped to the active still-image source.
- A stitched equirectangular MP4 can be registered as a separate fixture and inspected for browser-readable width, height, duration and SHA-256 metadata.
- `tools/inspect_gopro_360.py` uses `ffprobe` to record container and stream facts, source size, modification time and SHA-256.
- Optional packet timing and lossless raw data-track extraction preserve source relationships without claiming semantic decoding.

The current private test bench uses 34 stitched 2:1 JPG sources, one stitched equirectangular MP4 and one native GoPro `.360` source. They depict unrelated scenes. The instrument must never create a relationship between them automatically.

## Deliberately not claimed

- decoding and reconstructing the paired synchronised EAC streams;
- decoding timed GPMF keys such as orientation, gravity, motion, GPS and magnetometer data;
- interpreting disparity metadata;
- direct Aura-ray sampling in native EAC space;
- frame-accurate video observations;
- MP4 playback or frame evidence;
- decoded native pixels, GPMF keys or depth;
- equivalence between a derivative and its original `.360` source.
- capture-to-capture position or yaw registration;
- a merged site map assembled from the test fixtures.

Paired-EAC streams and GPMF tracks are inspection candidates, not decoded results. These capabilities remain incomplete until implemented and checked against genuine source metadata.

## Association boundary

The still collection, MP4 and `.360` file are three independent fixture lanes. Storage location, filename order, timestamps, projection shape or visual resemblance are not evidence that they share a scene, position, yaw or source lineage. A future relationship may only be recorded after explicit human confirmation and a traceable registration step.

## Source-first future record

Every derivative should retain:

```text
native source fingerprint
→ source stream and frame time
→ projection transform and parameters
→ derivative pixel coordinates
→ Aura matrix, shell, facet and face
→ algorithm or manual observation
```

The official GoPro GPMF parser is the primary integration reference: https://github.com/gopro/gpmf-parser

No still image, video or GoPro media is bundled, copied, uploaded or published by this repository. Private captures remain in user-controlled local storage.
