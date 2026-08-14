#!/usr/bin/env python3
"""Build an explicitly scaled sparse point cloud from two 2:1 panoramas.

This is a local, source-preserving adapter. It does not copy source pixels,
infer a dense depth map, segment objects or claim to create a complete mesh.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
from PIL import ExifTags, Image


SCHEMA = "aura-two-panorama-triangulation/0.1.0"
ALGORITHM = "sift-spherical-essential-triangulation/0.1.0"
EARTH_MEAN_RADIUS_METRES = 6_371_008.8


@dataclass(frozen=True)
class ImageFeatures:
    bearings: np.ndarray
    descriptors: np.ndarray
    feature_count: int


@dataclass(frozen=True)
class Pose:
    rotation_camera1_to_camera2: np.ndarray
    translation_camera1_to_camera2_unit: np.ndarray
    camera2_centre_in_camera1_unit: np.ndarray
    cheirality_count: int


@dataclass(frozen=True)
class TriangulatedPoint:
    xyz: np.ndarray
    ray_gap_metres: float
    triangulation_angle_degrees: float
    angular_closure_degrees: float


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_equirectangular_grey(path: Path, max_width: int) -> tuple[np.ndarray, int, int]:
    encoded = np.fromfile(path, dtype=np.uint8)
    grey = cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE)
    if grey is None:
        raise RuntimeError(f"OpenCV could not decode {path.name}")
    height, width = grey.shape
    ratio_error = abs((width / height) - 2.0)
    if ratio_error > 0.02:
        raise RuntimeError(
            f"{path.name} is {width} x {height}, not a 2:1 equirectangular image"
        )
    if width > max_width:
        scale = max_width / width
        grey = cv2.resize(
            grey,
            (max_width, max(1, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    return grey, width, height


def pixels_to_bearings(points: np.ndarray, width: int, height: int) -> np.ndarray:
    """Convert equirectangular coordinates to unit camera-frame bearings."""
    longitude = (points[:, 0] / width - 0.5) * (2.0 * np.pi)
    latitude = (0.5 - points[:, 1] / height) * np.pi
    cos_latitude = np.cos(latitude)
    return np.column_stack(
        (
            np.sin(longitude) * cos_latitude,
            np.sin(latitude),
            np.cos(longitude) * cos_latitude,
        )
    )


def detect_features(path: Path, max_width: int, max_features: int) -> ImageFeatures:
    grey, _, _ = load_equirectangular_grey(path, max_width)
    processed_height, processed_width = grey.shape
    detector = cv2.SIFT_create(nfeatures=max_features)
    keypoints, descriptors = detector.detectAndCompute(grey, None)
    if descriptors is None or len(keypoints) < 8:
        raise RuntimeError(f"SIFT found too few usable features in {path.name}")
    coordinates = np.asarray([keypoint.pt for keypoint in keypoints], dtype=np.float64)
    bearings = pixels_to_bearings(coordinates, processed_width, processed_height)
    return ImageFeatures(
        bearings=bearings,
        descriptors=np.asarray(descriptors, dtype=np.float32),
        feature_count=len(keypoints),
    )


def ratio_passes(knn: Iterable[list[cv2.DMatch]], ratio: float) -> dict[int, int]:
    accepted: dict[int, int] = {}
    for candidates in knn:
        if len(candidates) < 2:
            continue
        best, second = candidates[0], candidates[1]
        if best.distance < ratio * second.distance:
            accepted[int(best.queryIdx)] = int(best.trainIdx)
    return accepted


def mutual_ratio_matches(
    first: ImageFeatures, second: ImageFeatures, ratio: float
) -> tuple[np.ndarray, np.ndarray, int]:
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    forward = ratio_passes(matcher.knnMatch(first.descriptors, second.descriptors, k=2), ratio)
    reverse = ratio_passes(matcher.knnMatch(second.descriptors, first.descriptors, k=2), ratio)
    pairs = sorted((query, train) for query, train in forward.items() if reverse.get(train) == query)
    if len(pairs) < 8:
        raise RuntimeError(
            f"Only {len(pairs)} mutual SIFT matches survived the ratio test; at least 8 are required"
        )
    first_indices = np.asarray([pair[0] for pair in pairs], dtype=np.int64)
    second_indices = np.asarray([pair[1] for pair in pairs], dtype=np.int64)
    return first.bearings[first_indices], second.bearings[second_indices], len(pairs)


def project_to_essential(matrix: np.ndarray) -> np.ndarray:
    u, singular_values, vt = np.linalg.svd(matrix)
    if np.linalg.det(u) < 0:
        u[:, -1] *= -1
    if np.linalg.det(vt) < 0:
        vt[-1, :] *= -1
    equal_value = float((singular_values[0] + singular_values[1]) / 2.0)
    essential = u @ np.diag([equal_value, equal_value, 0.0]) @ vt
    norm = np.linalg.norm(essential)
    if not np.isfinite(norm) or norm < 1e-12:
        raise np.linalg.LinAlgError("degenerate essential matrix")
    return essential / norm


def fit_essential(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    if len(first) < 8:
        raise ValueError("at least eight bearings are required")
    design = np.einsum("ni,nj->nij", second, first).reshape((-1, 9))
    # Eight rows leave a one-dimensional right nullspace; full_matrices keeps
    # that ninth vector instead of dropping the actual eight-point solution.
    _, _, vt = np.linalg.svd(design, full_matrices=True)
    return project_to_essential(vt[-1].reshape((3, 3)))


def epipolar_residual_radians(
    essential: np.ndarray, first: np.ndarray, second: np.ndarray
) -> np.ndarray:
    """First-order bearing-space Sampson residual, approximately radians."""
    e_first = (essential @ first.T).T
    et_second = (essential.T @ second.T).T
    numerator = np.abs(np.einsum("ni,ni->n", second, e_first))
    denominator = np.sqrt(
        np.einsum("ni,ni->n", e_first, e_first)
        + np.einsum("ni,ni->n", et_second, et_second)
        + 1e-18
    )
    return numerator / denominator


def essential_ransac(
    first: np.ndarray,
    second: np.ndarray,
    threshold_degrees: float,
    iterations: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    threshold = math.radians(threshold_degrees)
    generator = np.random.default_rng(seed)
    best_mask: np.ndarray | None = None
    best_score = (-1, -math.inf)
    for _ in range(iterations):
        sample = generator.choice(len(first), size=8, replace=False)
        try:
            candidate = fit_essential(first[sample], second[sample])
        except (np.linalg.LinAlgError, ValueError):
            continue
        residuals = epipolar_residual_radians(candidate, first, second)
        mask = residuals <= threshold
        count = int(mask.sum())
        if count < 8:
            continue
        truncated_cost = -float(np.minimum(residuals, threshold).sum())
        score = (count, truncated_cost)
        if score > best_score:
            best_score = score
            best_mask = mask
    if best_mask is None:
        raise RuntimeError("spherical essential-matrix RANSAC found no usable model")

    model = fit_essential(first[best_mask], second[best_mask])
    for _ in range(3):
        residuals = epipolar_residual_radians(model, first, second)
        refined_mask = residuals <= threshold
        if int(refined_mask.sum()) < 8 or np.array_equal(refined_mask, best_mask):
            best_mask = refined_mask
            break
        best_mask = refined_mask
        model = fit_essential(first[best_mask], second[best_mask])
    residuals = epipolar_residual_radians(model, first, second)
    return model, best_mask, residuals


def closest_points_on_rays(
    camera1: np.ndarray, direction1: np.ndarray, camera2: np.ndarray, direction2: np.ndarray
) -> tuple[float, float, np.ndarray, np.ndarray] | None:
    dot = float(np.dot(direction1, direction2))
    denominator = 1.0 - dot * dot
    if denominator < 1e-12:
        return None
    offset = camera1 - camera2
    first_offset = float(np.dot(direction1, offset))
    second_offset = float(np.dot(direction2, offset))
    distance1 = (dot * second_offset - first_offset) / denominator
    distance2 = (second_offset - dot * first_offset) / denominator
    point1 = camera1 + distance1 * direction1
    point2 = camera2 + distance2 * direction2
    return distance1, distance2, point1, point2


def pose_candidates(essential: np.ndarray) -> list[tuple[np.ndarray, np.ndarray]]:
    u, _, vt = np.linalg.svd(essential)
    if np.linalg.det(u) < 0:
        u[:, -1] *= -1
    if np.linalg.det(vt) < 0:
        vt[-1, :] *= -1
    w = np.asarray([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
    rotations = [u @ w @ vt, u @ w.T @ vt]
    translation = u[:, 2]
    candidates: list[tuple[np.ndarray, np.ndarray]] = []
    for rotation in rotations:
        if np.linalg.det(rotation) < 0:
            rotation *= -1
        candidates.extend([(rotation, translation.copy()), (rotation, -translation.copy())])
    return candidates


def recover_pose(essential: np.ndarray, first: np.ndarray, second: np.ndarray) -> Pose:
    camera1 = np.zeros(3, dtype=np.float64)
    best: Pose | None = None
    best_quality = (-1, -math.inf)
    for rotation, translation in pose_candidates(essential):
        camera2 = -rotation.T @ translation
        second_in_camera1 = (rotation.T @ second.T).T
        positive = 0
        angles: list[float] = []
        for direction1, direction2 in zip(first, second_in_camera1):
            closest = closest_points_on_rays(camera1, direction1, camera2, direction2)
            if closest is None:
                continue
            distance1, distance2, _, _ = closest
            if distance1 > 0.0 and distance2 > 0.0:
                positive += 1
                angles.append(math.acos(float(np.clip(np.dot(direction1, direction2), -1.0, 1.0))))
        median_angle = float(np.median(angles)) if angles else 0.0
        quality = (positive, median_angle)
        if quality > best_quality:
            best_quality = quality
            best = Pose(rotation, translation, camera2, positive)
    if best is None:
        raise RuntimeError("relative pose could not be recovered")
    return best


def triangulate(
    first: np.ndarray,
    second: np.ndarray,
    pose: Pose,
    baseline_metres: float,
    min_angle_degrees: float,
    max_ray_gap_metres: float,
) -> tuple[list[TriangulatedPoint], dict[str, int]]:
    camera1 = np.zeros(3, dtype=np.float64)
    camera2 = pose.camera2_centre_in_camera1_unit * baseline_metres
    second_in_camera1 = (pose.rotation_camera1_to_camera2.T @ second.T).T
    points: list[TriangulatedPoint] = []
    rejections = {
        "behindEitherCamera": 0,
        "weakTriangulationAngle": 0,
        "highRayGap": 0,
    }
    for direction1, direction2 in zip(first, second_in_camera1):
        angle = math.degrees(
            math.acos(float(np.clip(np.dot(direction1, direction2), -1.0, 1.0)))
        )
        closest = closest_points_on_rays(camera1, direction1, camera2, direction2)
        if closest is None:
            rejections["weakTriangulationAngle"] += 1
            continue
        distance1, distance2, point1, point2 = closest
        if distance1 <= 0.0 or distance2 <= 0.0:
            rejections["behindEitherCamera"] += 1
            continue
        if angle < min_angle_degrees:
            rejections["weakTriangulationAngle"] += 1
            continue
        gap = float(np.linalg.norm(point1 - point2))
        if gap > max_ray_gap_metres:
            rejections["highRayGap"] += 1
            continue
        midpoint = (point1 + point2) / 2.0
        mean_range = max(1e-12, (distance1 + distance2) / 2.0)
        closure = math.degrees(math.atan2(gap, mean_range))
        points.append(TriangulatedPoint(midpoint, gap, angle, closure))
    return points, rejections


def gps_decimal(gps: dict[int, Any]) -> tuple[float, float, float | None]:
    def ref_text(value: Any) -> str:
        if isinstance(value, bytes):
            return value.decode("ascii", errors="ignore")
        return str(value)

    def degrees(value: Any) -> float:
        return float(value[0]) + float(value[1]) / 60.0 + float(value[2]) / 3600.0

    try:
        latitude = degrees(gps[2])
        longitude = degrees(gps[4])
        if ref_text(gps[1]).upper() == "S":
            latitude *= -1.0
        if ref_text(gps[3]).upper() == "W":
            longitude *= -1.0
        altitude = float(gps[6]) if 6 in gps else None
        altitude_reference = gps.get(5, 0)
        if isinstance(altitude_reference, bytes):
            altitude_reference = altitude_reference[0] if altitude_reference else 0
        if altitude is not None and int(altitude_reference) == 1:
            altitude *= -1.0
    except (KeyError, TypeError, ValueError, IndexError) as error:
        raise RuntimeError("EXIF GPS tags are incomplete or unreadable") from error
    return latitude, longitude, altitude


def read_gps(path: Path) -> tuple[float, float, float | None]:
    with Image.open(path) as image:
        exif = image.getexif()
        gps_tag = int(ExifTags.Base.GPSInfo)
        if gps_tag not in exif:
            raise RuntimeError(f"{path.name} has no EXIF GPS tags")
        return gps_decimal(exif.get_ifd(gps_tag))


def gps_baseline(first: Path, second: Path) -> tuple[float, float, float | None]:
    latitude1, longitude1, altitude1 = read_gps(first)
    latitude2, longitude2, altitude2 = read_gps(second)
    phi1 = math.radians(latitude1)
    phi2 = math.radians(latitude2)
    delta_phi = phi2 - phi1
    delta_lambda = math.radians(longitude2 - longitude1)
    haversine = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    horizontal = 2.0 * EARTH_MEAN_RADIUS_METRES * math.atan2(
        math.sqrt(haversine), math.sqrt(max(0.0, 1.0 - haversine))
    )
    vertical: float | None = None
    if altitude1 is not None and altitude2 is not None:
        vertical = altitude2 - altitude1
    baseline = math.hypot(horizontal, vertical or 0.0)
    if baseline <= 0.01:
        raise RuntimeError("EXIF GPS positions do not provide a usable non-zero baseline")
    return baseline, horizontal, vertical


def percentile_summary(values: Iterable[float]) -> dict[str, float | None]:
    array = np.asarray(list(values), dtype=np.float64)
    if len(array) == 0:
        return {"minimum": None, "median": None, "p95": None, "maximum": None}
    return {
        "minimum": round(float(array.min()), 8),
        "median": round(float(np.median(array)), 8),
        "p95": round(float(np.percentile(array, 95)), 8),
        "maximum": round(float(array.max()), 8),
    }


def rounded_matrix(matrix: np.ndarray) -> list[list[float]]:
    return [[round(float(value), 10) for value in row] for row in matrix]


def rounded_vector(vector: np.ndarray) -> list[float]:
    return [round(float(value), 10) for value in vector]


def write_ply(path: Path, points: list[TriangulatedPoint]) -> None:
    header = [
        "ply",
        "format ascii 1.0",
        "comment Aura sparse two-panorama triangulation; not a mesh",
        f"element vertex {len(points)}",
        "property double x",
        "property double y",
        "property double z",
        "end_header",
    ]
    rows = [" ".join(f"{coordinate:.9f}" for coordinate in point.xyz) for point in points]
    path.write_text("\n".join(header + rows) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Create an explicitly scaled sparse PLY from two overlapping 2:1 "
            "equirectangular photographs. Sources stay unchanged and local."
        ),
        epilog=(
            "EXIF GPS is consumer positioning, not survey control. The output is "
            "sparse matched geometry, not segmentation, dense depth or a complete mesh."
        ),
    )
    parser.add_argument("first_image", type=Path, help="First 2:1 equirectangular image")
    parser.add_argument("second_image", type=Path, help="Second 2:1 equirectangular image")
    parser.add_argument("--output-dir", required=True, type=Path, help="Derivative output directory")
    scale = parser.add_mutually_exclusive_group(required=True)
    scale.add_argument(
        "--baseline-metres",
        type=float,
        help="Known distance in metres between the two camera centres",
    )
    scale.add_argument(
        "--use-exif-gps",
        action="store_true",
        help="Use approximate consumer EXIF-GPS separation as scale",
    )
    parser.add_argument("--max-width", type=int, default=2400, help="SIFT working width (default: 2400)")
    parser.add_argument("--max-features", type=int, default=12000, help="Maximum SIFT features per image")
    parser.add_argument("--ratio-test", type=float, default=0.75, help="Mutual Lowe ratio threshold")
    parser.add_argument(
        "--ransac-threshold-degrees",
        type=float,
        default=0.6,
        help="Approximate spherical epipolar residual threshold",
    )
    parser.add_argument("--ransac-iterations", type=int, default=5000)
    parser.add_argument("--min-inliers", type=int, default=30)
    parser.add_argument("--min-points", type=int, default=20)
    parser.add_argument(
        "--min-triangulation-angle-degrees",
        type=float,
        default=1.0,
        help="Reject weak, near-parallel ray pairs",
    )
    parser.add_argument(
        "--max-ray-gap-metres",
        type=float,
        help="Reject rays whose closest points differ by more than this distance",
    )
    parser.add_argument(
        "--ray-gap-baseline-ratio",
        type=float,
        default=0.05,
        help="Default ray-gap threshold as a fraction of baseline (default: 0.05)",
    )
    parser.add_argument("--seed", type=int, default=42, help="Deterministic RANSAC seed")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing derivative files")
    return parser


def validate_arguments(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if args.first_image.resolve() == args.second_image.resolve():
        parser.error("the two source images must be different files")
    for path in (args.first_image, args.second_image):
        if not path.is_file():
            parser.error(f"source image not found: {path}")
    positive = {
        "--max-width": args.max_width,
        "--max-features": args.max_features,
        "--ransac-iterations": args.ransac_iterations,
        "--min-inliers": args.min_inliers,
        "--min-points": args.min_points,
        "--min-triangulation-angle-degrees": args.min_triangulation_angle_degrees,
        "--ray-gap-baseline-ratio": args.ray_gap_baseline_ratio,
        "--ransac-threshold-degrees": args.ransac_threshold_degrees,
    }
    if args.baseline_metres is not None:
        positive["--baseline-metres"] = args.baseline_metres
    if args.max_ray_gap_metres is not None:
        positive["--max-ray-gap-metres"] = args.max_ray_gap_metres
    for label, value in positive.items():
        if value <= 0:
            parser.error(f"{label} must be greater than zero")
    if not 0.1 <= args.ratio_test < 1.0:
        parser.error("--ratio-test must be at least 0.1 and less than 1")


def run(args: argparse.Namespace) -> dict[str, Any]:
    first_path = args.first_image.resolve(strict=True)
    second_path = args.second_image.resolve(strict=True)
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    ply_path = output_dir / "triangulated-points.ply"
    report_path = output_dir / "triangulation-report.json"
    if not args.overwrite and (ply_path.exists() or report_path.exists()):
        raise RuntimeError("derivative output exists; choose another directory or pass --overwrite")

    if args.baseline_metres is not None:
        baseline = float(args.baseline_metres)
        scale_report: dict[str, Any] = {
            "basis": "known-baseline",
            "baselineMetres": baseline,
            "uncertainty": "inherits the supplied baseline; input uncertainty was not provided",
        }
    else:
        baseline, horizontal, vertical = gps_baseline(first_path, second_path)
        scale_report = {
            "basis": "exif-gps-approximate",
            "baselineMetres": round(baseline, 6),
            "horizontalSeparationMetres": round(horizontal, 6),
            "verticalDeltaMetres": round(vertical, 6) if vertical is not None else None,
            "uncertainty": "not quantified; consumer EXIF GPS is approximate and is not survey-grade",
            "rawCoordinatesRecorded": False,
        }

    first_features = detect_features(first_path, args.max_width, args.max_features)
    second_features = detect_features(second_path, args.max_width, args.max_features)
    first_bearings, second_bearings, match_count = mutual_ratio_matches(
        first_features, second_features, args.ratio_test
    )
    essential, inlier_mask, all_residuals = essential_ransac(
        first_bearings,
        second_bearings,
        args.ransac_threshold_degrees,
        args.ransac_iterations,
        args.seed,
    )
    inlier_count = int(inlier_mask.sum())
    if inlier_count < args.min_inliers:
        raise RuntimeError(
            f"only {inlier_count} spherical-motion inliers survived; required {args.min_inliers}"
        )
    inlier_first = first_bearings[inlier_mask]
    inlier_second = second_bearings[inlier_mask]
    pose = recover_pose(essential, inlier_first, inlier_second)
    max_gap = (
        float(args.max_ray_gap_metres)
        if args.max_ray_gap_metres is not None
        else max(0.02, baseline * args.ray_gap_baseline_ratio)
    )
    points, rejections = triangulate(
        inlier_first,
        inlier_second,
        pose,
        baseline,
        args.min_triangulation_angle_degrees,
        max_gap,
    )
    if len(points) < args.min_points:
        raise RuntimeError(
            f"only {len(points)} points passed geometric checks; required {args.min_points}"
        )

    write_ply(ply_path, points)
    rotation = pose.rotation_camera1_to_camera2
    translation = pose.translation_camera1_to_camera2_unit * baseline
    camera2_centre = pose.camera2_centre_in_camera1_unit * baseline
    inlier_residual_degrees = np.degrees(all_residuals[inlier_mask])
    report: dict[str, Any] = {
        "schemaVersion": SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "claims": {
            "sparseMatchedGeometryOnly": True,
            "segmentation": False,
            "denseDepth": False,
            "completeMesh": False,
            "surveyGrade": False,
        },
        "sources": [
            {"name": first_path.name, "sha256": sha256_file(first_path), "projection": "equirectangular-2:1"},
            {"name": second_path.name, "sha256": sha256_file(second_path), "projection": "equirectangular-2:1"},
        ],
        "scale": scale_report,
        "coordinateFrame": {
            "origin": "first camera centre",
            "orientation": "first equirectangular camera frame; not georeferenced",
            "units": "metres",
        },
        "relativePose": {
            "rotationCamera1ToCamera2": rounded_matrix(rotation),
            "translationCamera1ToCamera2Metres": rounded_vector(translation),
            "camera2CentreInCamera1Metres": rounded_vector(camera2_centre),
            "cheiralityPositiveInliers": pose.cheirality_count,
        },
        "matching": {
            "detector": "SIFT",
            "featuresFirst": first_features.feature_count,
            "featuresSecond": second_features.feature_count,
            "mutualRatioMatches": match_count,
            "ratioThreshold": args.ratio_test,
        },
        "sphericalEssentialRansac": {
            "tentativeMatches": match_count,
            "inliers": inlier_count,
            "outliers": match_count - inlier_count,
            "iterations": args.ransac_iterations,
            "thresholdDegreesApproximate": args.ransac_threshold_degrees,
            "inlierAngularResidualDegrees": percentile_summary(inlier_residual_degrees),
        },
        "triangulation": {
            "acceptedPoints": len(points),
            "rejected": {
                "essentialModelOutlier": match_count - inlier_count,
                **rejections,
            },
            "thresholds": {
                "minimumTriangulationAngleDegrees": args.min_triangulation_angle_degrees,
                "maximumRayGapMetres": round(max_gap, 8),
            },
            "qualityDiagnostics": {
                "triangulationAngleDegrees": percentile_summary(
                    point.triangulation_angle_degrees for point in points
                ),
                "rayGapMetres": percentile_summary(point.ray_gap_metres for point in points),
                "angularClosureDegrees": percentile_summary(
                    point.angular_closure_degrees for point in points
                ),
                "metricUncertainty": (
                    "not calibrated; these diagnostics expose ray agreement but do not constitute "
                    "a formal positional uncertainty estimate"
                ),
            },
        },
        "outputs": {"pointCloud": ply_path.name, "report": report_path.name, "plyEncoding": "ascii"},
        "privacy": {
            "absoluteSourcePathsRecorded": False,
            "sourcePixelsCopied": False,
            "featurePixelCoordinatesRecorded": False,
            "rawExifGpsCoordinatesRecorded": False,
        },
        "provenance": {
            "algorithm": ALGORITHM,
            "opencvVersion": cv2.__version__,
            "numpyVersion": np.__version__,
            "pillowVersion": Image.__version__,
            "randomSeed": args.seed,
            "sourceFilesModified": False,
        },
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    validate_arguments(parser, args)
    report = run(args)
    summary = {
        "report": str((args.output_dir.resolve() / "triangulation-report.json")),
        "pointCloud": str((args.output_dir.resolve() / "triangulated-points.ply")),
        "scaleBasis": report["scale"]["basis"],
        "baselineMetres": report["scale"]["baselineMetres"],
        "inliers": report["sphericalEssentialRansac"]["inliers"],
        "acceptedPoints": report["triangulation"]["acceptedPoints"],
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, np.linalg.LinAlgError) as error:
        print(f"triangulation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
