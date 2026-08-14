import assert from "node:assert/strict";
import test from "node:test";
import { LATTICE_VERSION, SHELLS } from "../lib/aura-geometry";
import {
  OBSERVATION_VERSION,
  SCENE_PIPELINE_STAGE_IDS,
  calibrationSummary,
  createObservationPackage,
  impliedRange,
  isObservationPackage,
  type CaptureCollection,
  type CaptureSource,
  type FacetObservation,
} from "../lib/observation";

test("creates a versioned, observer-centred package", () => {
  const observation = createObservationPackage();
  assert.equal(OBSERVATION_VERSION, "aura-spatial-observation/0.4.0");
  assert.equal(observation.schemaVersion, OBSERVATION_VERSION);
  assert.equal(observation.latticeVersion, LATTICE_VERSION);
  assert.equal(observation.coordinateConvention.handedness, "right");
  assert.match(observation.coordinateConvention.origin, /active capture rig centre/);
  assert.match(observation.coordinateConvention.origin, /capture-to-capture transforms are unregistered/);
  assert.equal(observation.matrices.length, 2);
  assert.equal(observation.capture.status, "not-loaded");
  assert.equal(observation.capture.widthPixels, null);
  assert.equal(observation.capture.heightPixels, null);
  assert.equal(observation.capture.aspectRatio, null);
  assert.equal(observation.capture.durationSeconds, null);
  assert.deepEqual(observation.sources, []);
  assert.deepEqual(observation.captureCollections, []);
  assert.deepEqual(observation.captureRelationships, []);
  assert.equal(observation.shells.length, 7);
  assert.deepEqual(observation.shells.filter((shell) => shell.visible).map((shell) => shell.shellIndex), [3]);
  assert.deepEqual(observation.shells.map((shell) => shell.reachScale), SHELLS.map((shell) => shell.nestedScale));
  assert.equal(observation.view.autoRotate, false);
  assert.equal(observation.view.rotationSpeedDegreesPerSecond, 4);
  assert.equal(isObservationPackage(observation), true);
  assert.equal(isObservationPackage({ ...observation, schemaVersion: "future" }), false);
  assert.equal(isObservationPackage({ ...observation, captureCollections: undefined }), false);
  assert.equal(isObservationPackage({ ...observation, shells: undefined }), false);
  assert.equal(
    isObservationPackage({
      ...observation,
      shells: observation.shells.map((shell) => shell.shellIndex === 0 ? { ...shell, reachScale: 0 } : shell),
    }),
    false,
  );
  assert.equal(isObservationPackage({ ...observation, view: undefined }), false);
});

test("starts with an honest, ordered and empty scene pipeline", () => {
  const observation = createObservationPackage();

  assert.deepEqual(observation.scenePipeline.map((stage) => stage.id), SCENE_PIPELINE_STAGE_IDS);
  assert.deepEqual(
    observation.scenePipeline.map((stage) => stage.status),
    ["manual-only", "not-connected", "not-connected", "not-connected", "not-connected"],
  );
  observation.scenePipeline.forEach((stage) => {
    assert.equal(stage.adapterId, null);
    assert.equal(stage.adapterVersion, null);
    assert.deepEqual(stage.inputSourceIds, []);
    assert.deepEqual(stage.outputIds, []);
    assert.equal(stage.lastRunAt, null);
    assert.equal(stage.error, null);
    assert.ok(stage.notes.length > 0);
  });
  assert.deepEqual(observation.rangeHypotheses, []);
  assert.deepEqual(observation.surfaceGroups, []);
  assert.deepEqual(observation.segments, []);
  assert.deepEqual(observation.detections, []);
  assert.deepEqual(observation.meshHypotheses, []);

  assert.equal(
    isObservationPackage({ ...observation, scenePipeline: [...observation.scenePipeline].reverse() }),
    false,
  );
  const untraceableComplete = observation.scenePipeline.map((stage) =>
    stage.id === "object-detection" ? { ...stage, status: "complete" as const } : stage,
  );
  assert.equal(isObservationPackage({ ...observation, scenePipeline: untraceableComplete }), false);
  const traceableComplete = observation.scenePipeline.map((stage) =>
    stage.id === "object-detection" ? {
      ...stage,
      status: "complete" as const,
      adapterId: "local-object-detector",
      adapterVersion: "1.0.0",
      inputSourceIds: ["capture-a"],
      outputIds: ["detection-a"],
      lastRunAt: "2026-08-14T04:30:00.000Z",
    } : stage,
  );
  assert.equal(isObservationPackage({ ...observation, scenePipeline: traceableComplete }), true);
  assert.equal(isObservationPackage({ ...observation, rangeHypotheses: undefined }), false);
  assert.equal(isObservationPackage({ ...observation, surfaceGroups: undefined }), false);
  assert.equal(isObservationPackage({ ...observation, segments: undefined }), false);
  assert.equal(isObservationPackage({ ...observation, detections: undefined }), false);
  assert.equal(isObservationPackage({ ...observation, meshHypotheses: undefined }), false);
});

test("keeps each torus reach independent", () => {
  const observation = createObservationPackage();
  const untouchedScales = observation.shells.map((shell) => shell.reachScale);

  observation.shells[3].reachScale = 2.25;

  assert.equal(observation.shells[3].reachScale, 2.25);
  observation.shells.forEach((shell, index) => {
    if (index !== 3) assert.equal(shell.reachScale, untouchedScales[index]);
  });
  assert.deepEqual(
    createObservationPackage().shells.map((shell) => shell.reachScale),
    SHELLS.map((shell) => shell.nestedScale),
  );
});

test("keeps collection membership and facet evidence scoped to individual captures", () => {
  const still: CaptureSource = {
    id: "local-site-photo-001",
    kind: "equirectangular-image",
    name: "local site panorama 001.jpg",
    mediaType: "image/jpeg",
    bytes: 1_000,
    lastModified: null,
    sha256: null,
    widthPixels: 5_760,
    heightPixels: 2_880,
    aspectRatio: 2,
    durationSeconds: null,
    nativePreserved: true,
    status: "ready",
  };
  const collection: CaptureCollection = {
    id: "local-site-collection",
    name: "Local site panorama collection",
    sourceIds: [still.id],
    activeSourceId: still.id,
    createdAt: "2026-08-14T02:00:00.000Z",
    notes: [],
  };
  const facet: FacetObservation = {
    sourceId: still.id,
    matrixId: "matrix-a",
    shellIndex: 0,
    facetNumber: 1,
    face: "exterior",
    rangeMetres: 3.2,
    evidence: [],
    manualNote: "Range belongs only to this source image.",
  };
  const observation = createObservationPackage();
  observation.sources = [still];
  observation.captureCollections = [collection];
  observation.facets = [facet];

  assert.equal(observation.captureCollections[0].activeSourceId, still.id);
  assert.equal(observation.facets[0].sourceId, still.id);
  assert.equal(isObservationPackage(observation), true);
});

test("keeps equirectangular video and native GoPro 360 as distinct source formats", () => {
  const videoDefaults = {
    name: null,
    bytes: null,
    lastModified: null,
    sha256: null,
    widthPixels: 5_760,
    heightPixels: 2_880,
    aspectRatio: 2,
    durationSeconds: 12,
    nativePreserved: true,
    status: "ready" as const,
  };
  const mp4: CaptureSource = {
    ...videoDefaults,
    id: "unrelated-video-mp4",
    kind: "equirectangular-video",
    mediaType: "video/mp4",
  };
  const native360: CaptureSource = {
    ...videoDefaults,
    id: "unrelated-video-360",
    kind: "gopro-max-360",
    mediaType: "application/octet-stream",
  };

  assert.equal(mp4.kind, "equirectangular-video");
  assert.equal(native360.kind, "gopro-max-360");
  assert.notEqual(mp4.kind, native360.kind);
});

test("keeps calibration facts, implied scale and disagreement visible", () => {
  const first = impliedRange(1, 20);
  const second = impliedRange(2, 40);
  assert.ok(Math.abs(first - 2.8356409098) < 1e-9);
  const summary = calibrationSummary([
    { id: "a", label: "a", knownLengthMetres: 1, angularSpanDegrees: 20, impliedRangeMetres: first, source: "manual" },
    { id: "b", label: "b", knownLengthMetres: 2, angularSpanDegrees: 40, impliedRangeMetres: second, source: "manual" },
  ]);
  assert.equal(summary.count, 2);
  assert.ok(summary.meanRangeMetres !== null);
  assert.ok(summary.residualMetres !== null && summary.residualMetres > 0);
});
