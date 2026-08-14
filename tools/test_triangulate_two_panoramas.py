"""Deterministic geometry tests for triangulate_two_panoramas.py."""

from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import triangulate_two_panoramas as adapter


def yaw_rotation(degrees: float) -> np.ndarray:
    angle = math.radians(degrees)
    return np.asarray(
        [
            [math.cos(angle), 0.0, math.sin(angle)],
            [0.0, 1.0, 0.0],
            [-math.sin(angle), 0.0, math.cos(angle)],
        ]
    )


class SphericalTriangulationTests(unittest.TestCase):
    def setUp(self) -> None:
        generator = np.random.default_rng(17)
        self.points = np.column_stack(
            (
                generator.uniform(-4.0, 4.0, 120),
                generator.uniform(-2.0, 2.0, 120),
                generator.uniform(5.0, 18.0, 120),
            )
        )
        self.rotation = yaw_rotation(7.0)
        self.camera2 = np.asarray([1.2, 0.05, 0.1])
        first = self.points / np.linalg.norm(self.points, axis=1, keepdims=True)
        second_vectors = (self.rotation @ (self.points - self.camera2).T).T
        second = second_vectors / np.linalg.norm(second_vectors, axis=1, keepdims=True)
        self.first = first
        self.second = second

    def test_fit_pose_and_triangulate_clean_bearings(self) -> None:
        essential = adapter.fit_essential(self.first, self.second)
        residual = np.degrees(adapter.epipolar_residual_radians(essential, self.first, self.second))
        self.assertLess(float(np.max(residual)), 1e-5)

        pose = adapter.recover_pose(essential, self.first, self.second)
        direction_agreement = float(
            np.dot(
                pose.camera2_centre_in_camera1_unit,
                self.camera2 / np.linalg.norm(self.camera2),
            )
        )
        self.assertGreater(direction_agreement, 0.999)

        points, rejected = adapter.triangulate(
            self.first,
            self.second,
            pose,
            float(np.linalg.norm(self.camera2)),
            min_angle_degrees=0.1,
            max_ray_gap_metres=0.001,
        )
        self.assertEqual(len(points), len(self.points))
        self.assertEqual(sum(rejected.values()), 0)
        recovered = np.asarray([point.xyz for point in points])
        self.assertLess(float(np.max(np.linalg.norm(recovered - self.points, axis=1))), 1e-5)

    def test_ransac_rejects_deliberate_bearing_outliers(self) -> None:
        generator = np.random.default_rng(29)
        second = self.second.copy()
        outlier_indices = np.arange(0, 120, 6)
        random_bearings = generator.normal(size=(len(outlier_indices), 3))
        random_bearings /= np.linalg.norm(random_bearings, axis=1, keepdims=True)
        second[outlier_indices] = random_bearings
        _, mask, residuals = adapter.essential_ransac(
            self.first,
            second,
            threshold_degrees=0.05,
            iterations=1500,
            seed=41,
        )
        self.assertGreaterEqual(int(mask.sum()), 98)
        self.assertLessEqual(int(mask[outlier_indices].sum()), 1)
        self.assertLess(float(np.median(np.degrees(residuals[mask]))), 0.01)

    def test_equirectangular_bearings_wrap_at_seam(self) -> None:
        points = np.asarray([[0.0, 50.0], [100.0, 50.0], [50.0, 50.0]])
        bearings = adapter.pixels_to_bearings(points, width=100, height=100)
        self.assertTrue(np.allclose(bearings[0], bearings[1], atol=1e-12))
        self.assertTrue(np.allclose(bearings[2], [0.0, 0.0, 1.0], atol=1e-12))


if __name__ == "__main__":
    unittest.main()
