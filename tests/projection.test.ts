import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { centreRay } from "../lib/aura-geometry";
import {
  EQUIRECTANGULAR_PHOTOSPHERE_YAW_RADIANS,
  centreProjection,
  directionToEquirectangular,
  equirectangularToDirection,
  facetFromEquirectangular,
  facetParameterPatchPolygon,
  facetProjectionPolygon,
  seamCopies,
} from "../lib/projection";

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("round-trips non-singular directions through equirectangular coordinates", () => {
  const ray = centreRay(0, 5, 12);
  const uv = directionToEquirectangular(ray.direction);
  close(uv[0], ray.u);
  close(uv[1], 1 - ray.v);
  const restored = equirectangularToDirection(uv[0], uv[1]);
  restored.forEach((value, index) => close(value, ray.direction[index]));
});

test("linked image selection returns the same facet", () => {
  for (const number of [1, 24, 133, 264, 288]) {
    const centre = centreProjection(3, number);
    assert.equal(facetFromEquirectangular(centre[0], centre[1]), number);
  }
});

test("yaw moves geometry in image space and selection inverts it", () => {
  const centre = centreProjection(3, 133, 7.5);
  close(centre[0], 0.5416666666666666);
  assert.equal(facetFromEquirectangular(centre[0], centre[1], 7.5), 133);
});

test("makes the horn singularity explicit instead of hiding it", () => {
  const exact = facetProjectionPolygon(0, 1);
  const patch = facetParameterPatchPolygon(1);
  assert.equal(exact[0][1], 0);
  assert.equal(exact[1][1], 0);
  close(patch[0][1], 11 / 12);
  close(patch[2][1], 1);
});

test("emits a second canvas copy for a seam-crossing patch", () => {
  const patch = facetParameterPatchPolygon(24, 7.5);
  assert.equal(seamCopies(patch).length, 2);
});

test("registers photosphere texture longitudes to the facet convention", () => {
  const geometry = new THREE.SphereGeometry(1, 8, 4)
    .rotateY(EQUIRECTANGULAR_PHOTOSPHERE_YAW_RADIANS);
  const positions = geometry.getAttribute("position");
  const equatorStart = 2 * 9;
  const expected = [
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 0],
  ] as const;
  [0, 2, 4, 6].forEach((column, index) => {
    const vertex = equatorStart + column;
    close(positions.getX(vertex), expected[index][0], 1e-6);
    close(positions.getY(vertex), 0, 1e-6);
    close(positions.getZ(vertex), expected[index][1], 1e-6);
  });
  geometry.dispose();
});
