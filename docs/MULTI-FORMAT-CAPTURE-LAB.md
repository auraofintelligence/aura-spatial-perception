# Multi-format capture lab

## Purpose

This private local test bench checks whether Aura can handle three related media formats honestly without pretending that unrelated captures belong to one scene.

| Fixture lane | Local test material | What the instrument may do | What it must not claim |
| --- | --- | --- | --- |
| Stitched still collection | 34 equirectangular 2:1 JPG sources | Select lazily, move with previous/next or direct choice, attach only the active source, fingerprint it and keep facet evidence source-scoped | Shared camera position, shared yaw, automatic panorama alignment or evidence carried to another source |
| Stitched video | One equirectangular MP4 | Register it separately and record browser-readable dimensions, duration and SHA-256 metadata | Playback, frame selection, frame evidence or a relationship to the still collection |
| Native capture | One GoPro `.360` source | Register it separately and inspect container, streams, packet timing and raw data-track candidates with local tools | Decoded paired-EAC pixels, decoded GPMF keys, metric depth or a relationship to either stitched fixture |

## Privacy boundary

- Media remains in user-controlled local storage.
- Browser selection does not bundle media into the repository or saved observation JSON.
- No media is copied, uploaded, hosted or published.
- Documentation and saved records should not expose local storage paths or precise location metadata.

## Source-scoped evidence

Scene inspection starts with one active 12 × 24 Green horn torus. It is the angular sampling instrument, not a finished scene surface. Extra tori are added only as deliberate comparison or interpersonal-resonance layers; they are not seven automatic copies of the same scene.

Every torus keeps the same horn geometry and 12 × 24 address grammar. Its relative outer envelope can be adjusted independently, but that display scale is not a measured distance and is not yet a metric interpersonal-resonance band.

Every still-image observation must carry the active source identifier as well as the matrix, shell, facet and face address. Changing the active source changes the evidence context. An edge score, manual range or note from one source must never appear as evidence for another source merely because the Aura facet address matches.

Saved JSON may retain source records, fingerprints and observations. The user reattaches private files after reload; the JSON does not contain their pixels or video bytes.

Canonical torus vertices stay separate from source-scoped range evidence. A manually entered range places an observation point along the selected Aura ray; it does not stretch the horn torus into a scene mesh. PLY and OBJ exports contain only finite positive range-constrained point samples for the selected source, with no mesh faces.

One still in the local test collection carries an unreliable default-style clock value and no usable location metadata. It remains part of the visual collection, but its time and pose must stay unregistered unless a person supplies independent evidence.

## No automatic association

The three fixture lanes depict unrelated scenes. The instrument must not infer a relationship from filenames, timestamps, folder proximity, projection shape or visual similarity.

Capture-to-capture position and yaw are unregistered. Consequently there is no merged site map, no shared origin and no valid cross-capture placement. Any future association requires an explicit human decision plus a traceable transform and evidence record.

## Scene pipeline truth

The intended scene-building order is:

1. range estimation;
2. surface grouping;
3. segmentation;
4. object detection;
5. provisional mesh.

Only manual range entry is available now. Surface grouping, segmentation, object detection and provisional mesh are all **not connected**: no adapter runs and no output is generated. Edge evidence may help later reasoning, but it is not an automatic range estimate, segment, detection or surface.

## Honest test sequence

1. Select the 34 stitched JPG sources locally and confirm natural-order navigation without eager pixel loading.
2. Add evidence to one active source, change sources, and confirm the evidence does not follow.
3. Register the MP4 fixture and confirm that only metadata is reported.
4. Register the native `.360` fixture and inspect its container separately.
5. Save and reload the observation package, then confirm that media must be reattached and no cross-fixture relationship or merged map appears.

## Still unfinished

- MP4 playback and frame-level evidence.
- Native paired-EAC pixel reconstruction, GPMF key decoding and depth interpretation.
- Capture pose registration and merged site mapping.
- Automatic range estimation, surface grouping, segmentation, object detection and provisional mesh generation.
- Metric interpersonal-resonance bands and named boundaries. Independent relative per-torus outer-envelope controls work, but do not supply those meanings or measurements.
