import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_RADIUS,
  COLS,
  FACETS_PER_SHELL,
  ROWS,
  SHELLS,
  allRayRegisters,
  angularFacetParameterCorners,
  angularGuideDirection,
  centreRay,
  displaySearchRadius,
  facetDefinition,
  length,
  normalise,
  scale,
  torusPoint,
  vertexRay,
} from "../lib/aura-geometry";

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("preserves the canonical 7 × 12 × 24 grammar", () => {
  assert.equal(SHELLS.length, 7);
  assert.equal(ROWS, 12);
  assert.equal(COLS, 24);
  assert.equal(FACETS_PER_SHELL, 288);
  assert.equal(FACETS_PER_SHELL * 2 * SHELLS.length, 4032);
  assert.deepEqual(SHELLS.map((shell) => shell.name), ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet"]);
  assert.deepEqual(SHELLS.map((shell) => shell.nestedScale), [1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1]);
});

test("matches representative source addresses and seam wrapping", () => {
  const facet1 = facetDefinition(0, "exterior", 1);
  assert.equal(facet1.centre.id, "Red FR1,L001");
  assert.deepEqual(facet1.corners.map((ray) => ray.id), [
    "Red R1,L001", "Red R1,L002", "Red R2,L025", "Red R2,L026",
  ]);

  const facet24 = facetDefinition(0, "exterior", 24);
  assert.deepEqual(facet24.corners.map((ray) => ray.id), [
    "Red R1,L024", "Red R1,L001", "Red R2,L048", "Red R2,L025",
  ]);

  const facet288 = facetDefinition(6, "interior", 288);
  assert.equal(facet288.address, "Violet I288");
  assert.equal(facet288.centre.id, "Violet FR12,L288");
  assert.deepEqual(facet288.corners.map((ray) => ray.id), [
    "Violet R12,L288", "Violet R12,L265", "Violet R1,L024", "Violet R1,L001",
  ]);
});

test("matches representative directions shipped by the source CSV", () => {
  const horn = vertexRay(0, 1, 0);
  assert.deepEqual(horn.direction, [0, 1, 0]);
  const r2c1 = vertexRay(0, 2, 0);
  close(r2c1.direction[0], 0, 1e-8);
  close(r2c1.direction[1], -0.965925826, 1e-9);
  close(r2c1.direction[2], -0.258819045, 1e-9);
  close(length(r2c1.direction), 1);

  const centre = centreRay(3, 5, 12);
  close(length(centre.direction), 1);
  assert.equal(centre.id, "Green FR6,L133");
});

test("keeps 24 horn identities despite their coincident point and direction", () => {
  const hornRays = Array.from({ length: COLS }, (_, column) => vertexRay(0, 1, column));
  assert.equal(new Set(hornRays.map((ray) => ray.id)).size, 24);
  assert.equal(new Set(hornRays.map((ray) => ray.direction.join(","))).size, 1);
  hornRays.forEach((ray) => assert.deepEqual(ray.direction, [0, 1, 0]));
});

test("closed vertices sit on the exact horn torus and collapse at the horn", () => {
  let maximumSurfaceError = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      const point = torusPoint(column / COLS, row / ROWS);
      const radial = Math.hypot(point[0], point[2]);
      const surfaceError = Math.abs((radial - BASE_RADIUS) ** 2 + point[1] ** 2 - BASE_RADIUS ** 2);
      maximumSurfaceError = Math.max(maximumSurfaceError, surfaceError);
      if (row === 0) close(length(point), 0, 1e-12);
    }
  }
  assert.ok(maximumSurfaceError < 1e-12);
});

test("independent reach scaling preserves the horn and sets only the outer envelope", () => {
  for (const reachScale of [0.05, 4 / 7, 1, 2]) {
    close(length(scale(torusPoint(0, 0), reachScale)), 0, 1e-12);
    close(length(scale(torusPoint(0, 0.5), reachScale)), 2 * BASE_RADIUS * reachScale, 1e-12);
  }
  assert.equal(FACETS_PER_SHELL, 288);
});

test("the at-zero angular guide opens the horn without changing its 12 by 24 addresses", () => {
  assert.deepEqual(angularGuideDirection(0, 0), [0, -1, 0]);
  close(angularGuideDirection(0, 1)[0], 0, 1e-12);
  close(angularGuideDirection(0, 1)[1], 1, 1e-12);
  close(angularGuideDirection(0, 1)[2], 0, 1e-12);

  for (let row = 1; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      const u = column / COLS;
      const v = row / ROWS;
      const guide = angularGuideDirection(u, v);
      const canonicalDirection = normalise(torusPoint(u, v));
      close(length(guide), 1, 1e-12);
      guide.forEach((value, axis) => close(value, canonicalDirection[axis], 1e-12));
    }
  }

  assert.equal(FACETS_PER_SHELL, 12 * 24);
  assert.deepEqual(angularFacetParameterCorners(1), [
    [0, 0], [1 / COLS, 0], [1 / COLS, 1 / ROWS], [0, 1 / ROWS],
  ]);
  assert.deepEqual(angularFacetParameterCorners(FACETS_PER_SHELL), [
    [(COLS - 1) / COLS, (ROWS - 1) / ROWS],
    [1, (ROWS - 1) / ROWS],
    [1, 1],
    [(COLS - 1) / COLS, 1],
  ]);
});

test("the display search boundary stays beyond horn envelopes and range points", () => {
  assert.equal(displaySearchRadius(0, 0), 6.2);
  assert.equal(displaySearchRadius(4, 0), 10);
  assert.equal(displaySearchRadius(1, 20), 25);
  assert.ok(displaySearchRadius(4, 20) > 4);
  assert.ok(displaySearchRadius(4, 20) > 20);
  assert.equal(displaySearchRadius(Number.NaN, Number.POSITIVE_INFINITY), 6.2);
});

test("facet-face addresses and ray registers remain separate 4,032 ledgers", () => {
  const rayIds = SHELLS.flatMap((shell) => allRayRegisters(shell.index).map((ray) => ray.id));
  assert.equal(rayIds.length, 4032);
  assert.equal(new Set(rayIds).size, 4032);
  assert.equal(FACETS_PER_SHELL * SHELLS.length * 2, 4032);
});
