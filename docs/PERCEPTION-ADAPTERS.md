# Perception adapters

Conventional vision tools are proposed sensors for Aura facets, not replacements for the Aura representation.

## Implemented locally

| Evidence | Status | Behaviour |
| --- | --- | --- |
| Seam-aware Sobel edge metric | Working | Reads the selected region's real luminance pixels, wraps horizontally and reports mean and peak gradient strength with provenance |
| Manual range | Working | Records a measured range and note, then moves a facet centre along its canonical ray |
| Neighbour reinforcement | Experimental | Applies only when the user enables it and existing measured edge evidence is low |

The app displays empty states for depth, segmentation and surface normals. It never inserts random values or decorative masks.

## Researched, not connected

| Need | Candidate primary project | Proposed Aura contribution |
| --- | --- | --- |
| Panoramic depth | DAP: https://github.com/Insta360-Research-Team/DAP | Depth hypotheses tied to source projection and facet region |
| General monocular depth | Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2 | Relative-depth evidence, never assumed metric without calibration |
| Surface normals | DSINE: https://github.com/baegwangbin/DSINE | Normal hypotheses and directional change evidence |
| Feature correspondence | LightGlue: https://github.com/cvg/LightGlue | Timed cross-frame and cross-view feature relationships |
| Pose and reconstruction | COLMAP: https://github.com/colmap/colmap | External camera/point geometry with explicit registration into the Aura frame |
| Video/image segmentation | SAM 2: https://ai.meta.com/research/sam2/ | Object or surface membership evidence with masks, confidence and source frame |

Before integration, model licences, weights, hardware needs, panoramic distortion, source timing and output uncertainty must be checked. A perspective model output must record the perspective extraction used; it cannot be labelled as native equirectangular evidence.

## Evidence record rule

Every visible inference must carry a source, algorithm/version, status, transform history, value, provenance and time. Confidence must be omitted or marked unavailable when an algorithm does not define a meaningful confidence score.
