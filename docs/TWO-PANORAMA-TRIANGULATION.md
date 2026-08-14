# Two-panorama sparse triangulation

This local adapter is the first honest path from two old 360-degree photographs to metric scene evidence. It finds the same visual details in two overlapping 2:1 equirectangular images, estimates their relative camera motion on spherical bearings, and triangulates a sparse set of 3D points.

It does **not** create a dense depth map, segment objects, recover hidden surfaces or produce a complete mesh. A point only survives when the two source rays agree strongly enough.

## What it needs

- Two overlapping 2:1 equirectangular photographs taken from different camera positions.
- Python with the packages in `tools/requirements-triangulation.txt`.
- One explicit scale source:
  - a measured distance between camera centres, supplied with `--baseline-metres`; or
  - consumer EXIF-GPS separation, explicitly selected with `--use-exif-gps`.

EXIF GPS is approximate and is never labelled survey-grade. A measured baseline is preferable. The camera positions must actually differ: two photographs made from the same point provide rotation but no useful triangulation baseline.

## Run it on Windows

Keep source photos and generated results outside the repository. In PowerShell:

```powershell
python tools\triangulate_two_panoramas.py `
  "C:\path\to\first.JPG" `
  "C:\path\to\second.JPG" `
  --baseline-metres 1.50 `
  --output-dir "C:\path\to\local-results\pair-01"
```

For a preliminary, explicitly approximate GPS-scaled run:

```powershell
python tools\triangulate_two_panoramas.py `
  "C:\path\to\first.JPG" `
  "C:\path\to\second.JPG" `
  --use-exif-gps `
  --output-dir "C:\path\to\local-results\pair-01-gps"
```

Use `python tools\triangulate_two_panoramas.py --help` for quality thresholds and other controls.

## Outputs

- `triangulated-points.ply` — sparse 3D vertices in ASCII PLY form, measured in metres when the supplied scale is sound.
- `triangulation-report.json` — source filenames and SHA-256 hashes, scale basis, relative pose, matching and rejection counts, ray-agreement diagnostics, software provenance, and explicit capability limits.

The report deliberately excludes absolute source paths, feature pixel coordinates, copied source pixels and raw EXIF-GPS coordinates. The first camera centre is `(0, 0, 0)`. Orientation follows that photograph's equirectangular camera frame and is not north-aligned or georeferenced.

## Quality gates

The pipeline applies these gates in order:

1. SIFT features must agree in both matching directions and pass the ratio test.
2. A spherical essential-matrix RANSAC fit rejects matches inconsistent with one relative camera motion.
3. Relative pose is chosen by the positive-depth, or cheirality, test.
4. Rays landing behind either camera are rejected.
5. Near-parallel rays with weak triangulation angle are rejected.
6. Rays whose closest points have too large a metric gap are rejected.

The JSON gives angular residuals, triangulation angles, ray gaps and angular closure. These are quality diagnostics, not a formal positional-uncertainty calculation. Metric accuracy still depends on source overlap, motion blur, stitching artefacts, moving objects, camera-centre assumptions, baseline accuracy and scene geometry.

## Deterministic geometry check

Run the synthetic tests without any private media:

```powershell
python -m unittest tools\test_triangulate_two_panoramas.py -v
```

The tests exercise spherical epipolar fitting, relative-pose recovery, metric ray triangulation, deliberate outlier rejection and equirectangular seam continuity.
