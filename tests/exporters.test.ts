import assert from "node:assert/strict";
import test from "node:test";
import { facetDefinition, rotateY, scale } from "../lib/aura-geometry";
import { observationToObj, observationToPly } from "../lib/exporters";
import { createObservationPackage } from "../lib/observation";

test("exports only source-matched facets with a finite positive range as point samples", () => {
  const observation = createObservationPackage();
  observation.matrices[0].yawDegrees = 37;
  observation.matrices[0].radialScale = 999;
  observation.facets.push({
    sourceId: "capture-a",
    matrixId: "matrix-a",
    shellIndex: 3,
    facetNumber: 133,
    face: "exterior",
    rangeMetres: 2.5,
    evidence: [],
    manualNote: "test measure",
  });
  observation.facets.push({
    sourceId: "capture-b",
    matrixId: "matrix-a",
    shellIndex: 3,
    facetNumber: 134,
    face: "exterior",
    rangeMetres: 8,
    evidence: [],
    manualNote: "separate unregistered capture",
  });
  observation.facets.push({
    sourceId: "capture-a",
    matrixId: "matrix-a",
    shellIndex: 3,
    facetNumber: 135,
    face: "exterior",
    rangeMetres: null,
    evidence: [],
    manualNote: "edge only; no range estimate",
  });
  for (const [facetNumber, rangeMetres] of [
    [136, 0],
    [137, -1],
    [138, Number.NaN],
    [139, Number.POSITIVE_INFINITY],
  ] as const) {
    observation.facets.push({
      sourceId: "capture-a",
      matrixId: "matrix-a",
      shellIndex: 3,
      facetNumber,
      face: "exterior",
      rangeMetres,
      evidence: [],
      manualNote: "invalid range",
    });
  }

  const expectedPoint = rotateY(
    scale(facetDefinition(3, "exterior", 133).centre.direction, 2.5),
    37,
  );
  const expectedVertex = expectedPoint.map((coordinate) => coordinate.toFixed(8)).join(" ");

  const ply = observationToPly(observation, "capture-a");
  assert.match(ply, /element vertex 1/);
  assert.match(ply, /range-constrained point samples; not a mesh/);
  assert.match(ply, /comment source capture-a/);
  assert.match(ply, /property int aura_facet/);
  const plyVertex = ply.split("\n").find((line) => line.endsWith(" 133"));
  assert.equal(plyVertex?.split(" ").slice(0, 3).join(" "), expectedVertex);
  assert.match(ply, / 133\n/);
  assert.doesNotMatch(ply, / 134\n/);
  assert.doesNotMatch(ply, / 13[5-9]\n/);
  assert.doesNotMatch(ply, /^element face /m);

  const obj = observationToObj(observation, "capture-a");
  assert.match(obj, /range-constrained point samples; not a mesh/);
  assert.match(obj, /# source capture-a/);
  assert.ok(obj.split("\n").includes(`v ${expectedVertex}`));
  assert.match(obj, /^p 1$/m);
  assert.doesNotMatch(obj, /^f /m);
  assert.equal(obj.match(/^v /gm)?.length, 1);
});
