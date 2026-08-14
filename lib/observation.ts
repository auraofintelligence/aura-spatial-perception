import { LATTICE_VERSION, SHELLS, type Face } from "./aura-geometry";
import type { EvidenceRecord } from "./evidence";

export const OBSERVATION_VERSION = "aura-spatial-observation/0.4.0" as const;

export type CaptureSource = {
  id: string;
  kind:
    | "equirectangular-image"
    | "equirectangular-video"
    | "gopro-max-360"
    | "aura-scan-bundle"
    | "unloaded";
  name: string | null;
  mediaType: string | null;
  bytes: number | null;
  lastModified: string | null;
  sha256: string | null;
  widthPixels: number | null;
  heightPixels: number | null;
  aspectRatio: number | null;
  durationSeconds: number | null;
  nativePreserved: boolean;
  status: "ready" | "browser-inspected" | "awaiting-local-stream-inspection" | "not-loaded";
};

export type CaptureCollection = {
  id: string;
  name: string;
  sourceIds: string[];
  activeSourceId: string | null;
  createdAt: string;
  notes: string[];
};

export type CaptureRelationship = {
  sourceId: string;
  derivedId: string;
  kind: "working-view-of";
  status: "user-associated" | "transform-verified";
  transform: string;
  notes: string[];
};

export type MatrixState = {
  id: string;
  name: string;
  yawDegrees: number;
  radialScale: number;
  visible: boolean;
  purpose: string;
};

export type ShellState = {
  shellIndex: number;
  visible: boolean;
  /** Dimensionless reach of this shell, independent of the other shells. */
  reachScale: number;
};

export const SCENE_PIPELINE_STAGE_IDS = [
  "range-estimation",
  "surface-grouping",
  "segmentation",
  "object-detection",
  "provisional-mesh",
] as const;

export type ScenePipelineStageId = (typeof SCENE_PIPELINE_STAGE_IDS)[number];

export type ScenePipelineStageStatus =
  | "manual-only"
  | "not-connected"
  | "ready"
  | "running"
  | "complete"
  | "error";

export type ScenePipelineStage = {
  id: ScenePipelineStageId;
  label: string;
  status: ScenePipelineStageStatus;
  adapterId: string | null;
  adapterVersion: string | null;
  inputSourceIds: string[];
  outputIds: string[];
  lastRunAt: string | null;
  error: string | null;
  notes: string[];
};

/** A source-local frame. It is not registered into a shared scene by default. */
export type SceneFrameReference = {
  frameIndex: number | null;
  timestampSeconds: number | null;
  coordinateFrameId: string;
  registrationStatus: "source-local" | "registered";
};

export type SceneArtifactProvenance = {
  stageId: ScenePipelineStageId;
  adapterId: string | null;
  adapterVersion: string | null;
  createdAt: string;
  inputIds: string[];
  notes: string[];
};

export type EquirectangularBoundary = {
  projection: "equirectangular";
  /** Ordered [u, v] points in normalised image coordinates. */
  points: Array<[number, number]>;
  wrapsSeam: boolean;
};

export type RangeHypothesis = {
  id: string;
  sourceId: string;
  frame: SceneFrameReference;
  provenance: SceneArtifactProvenance;
  matrixId: string;
  shellIndex: number;
  facetNumber: number;
  face: Face;
  rangeMetres: number;
  confidence: number | null;
};

export type SurfaceGroup = {
  id: string;
  sourceId: string;
  frame: SceneFrameReference;
  provenance: SceneArtifactProvenance;
  rangeHypothesisIds: string[];
  boundary: EquirectangularBoundary | null;
  label: string | null;
  confidence: number | null;
};

export type SceneSegment = {
  id: string;
  sourceId: string;
  frame: SceneFrameReference;
  provenance: SceneArtifactProvenance;
  surfaceGroupIds: string[];
  boundary: EquirectangularBoundary;
  label: string | null;
  confidence: number | null;
};

export type SceneDetection = {
  id: string;
  sourceId: string;
  frame: SceneFrameReference;
  provenance: SceneArtifactProvenance;
  segmentIds: string[];
  boundary: EquirectangularBoundary;
  label: string;
  confidence: number | null;
};

export type MeshHypothesis = {
  id: string;
  sourceId: string;
  frame: SceneFrameReference;
  provenance: SceneArtifactProvenance;
  surfaceGroupIds: string[];
  segmentIds: string[];
  detectionIds: string[];
  vertexCount: number;
  triangleCount: number;
  assetReference: string | null;
};

export type FacetObservation = {
  sourceId: string;
  matrixId: string;
  shellIndex: number;
  facetNumber: number;
  face: Face;
  rangeMetres: number | null;
  evidence: EvidenceRecord[];
  manualNote: string;
};

export type CalibrationConstraint = {
  id: string;
  label: string;
  knownLengthMetres: number;
  angularSpanDegrees: number;
  impliedRangeMetres: number;
  source: "body-profile" | "site-measurement" | "manual";
};

export type BodyProfile = {
  standingHeightMetres: number | null;
  eyeHeightMetres: number | null;
  headWidthMetres: number | null;
  interpupillaryDistanceMetres: number | null;
};

export type SpatialObservationPackage = {
  schemaVersion: typeof OBSERVATION_VERSION;
  latticeVersion: typeof LATTICE_VERSION;
  packageId: string;
  createdAt: string;
  updatedAt: string;
  coordinateConvention: {
    handedness: "right";
    axes: "+x right, +y up, +z forward";
    origin: "active capture rig centre / observer centre; capture-to-capture transforms are unregistered";
    angular: "u around +y, v around horn tube; equirectangular v points down";
    units: "metres when calibrated; relative units otherwise";
  };
  capture: CaptureSource;
  sources: CaptureSource[];
  captureCollections: CaptureCollection[];
  captureRelationships: CaptureRelationship[];
  shells: ShellState[];
  scenePipeline: ScenePipelineStage[];
  rangeHypotheses: RangeHypothesis[];
  surfaceGroups: SurfaceGroup[];
  segments: SceneSegment[];
  detections: SceneDetection[];
  meshHypotheses: MeshHypothesis[];
  view: {
    autoRotate: boolean;
    rotationSpeedDegreesPerSecond: number;
  };
  matrices: MatrixState[];
  facets: FacetObservation[];
  bodyProfile: BodyProfile;
  calibration: CalibrationConstraint[];
  externalFrames: Array<{
    id: string;
    kind: "aura-scan-bundle" | "control-frame";
    transformStatus: "unregistered" | "registered";
    headingStatus: "unknown" | "known";
    sourceSchema: string;
    notes: string[];
  }>;
  provenance: {
    sourceRepositories: string[];
    transformHistory: string[];
    notes: string[];
  };
};

export function emptyCapture(): CaptureSource {
  return {
    id: "capture-unloaded",
    kind: "unloaded",
    name: null,
    mediaType: null,
    bytes: null,
    lastModified: null,
    sha256: null,
    widthPixels: null,
    heightPixels: null,
    aspectRatio: null,
    durationSeconds: null,
    nativePreserved: false,
    status: "not-loaded",
  };
}

export function createObservationPackage(): SpatialObservationPackage {
  const now = new Date().toISOString();
  return {
    schemaVersion: OBSERVATION_VERSION,
    latticeVersion: LATTICE_VERSION,
    packageId: globalThis.crypto?.randomUUID?.() ?? `aura-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    coordinateConvention: {
      handedness: "right",
      axes: "+x right, +y up, +z forward",
      origin: "active capture rig centre / observer centre; capture-to-capture transforms are unregistered",
      angular: "u around +y, v around horn tube; equirectangular v points down",
      units: "metres when calibrated; relative units otherwise",
    },
    capture: emptyCapture(),
    sources: [],
    captureCollections: [],
    captureRelationships: [],
    shells: SHELLS.map((shell) => ({
      shellIndex: shell.index,
      visible: shell.index === 3,
      reachScale: shell.nestedScale,
    })),
    scenePipeline: [
      {
        id: "range-estimation",
        label: "Range estimation",
        status: "manual-only",
        adapterId: null,
        adapterVersion: null,
        inputSourceIds: [],
        outputIds: [],
        lastRunAt: null,
        error: null,
        notes: ["Manual range entries are supported; no automatic estimator is connected."],
      },
      ...([
        { id: "surface-grouping", label: "Surface grouping" },
        { id: "segmentation", label: "Segmentation" },
        { id: "object-detection", label: "Object detection" },
        { id: "provisional-mesh", label: "Provisional mesh" },
      ] as const).map(({ id, label }) => ({
        id,
        label,
        status: "not-connected" as const,
        adapterId: null,
        adapterVersion: null,
        inputSourceIds: [],
        outputIds: [],
        lastRunAt: null,
        error: null,
        notes: ["No adapter is connected and no output has been generated."],
      })),
    ],
    rangeHypotheses: [],
    surfaceGroups: [],
    segments: [],
    detections: [],
    meshHypotheses: [],
    view: {
      autoRotate: false,
      rotationSpeedDegreesPerSecond: 4,
    },
    matrices: [
      {
        id: "matrix-a",
        name: "Primary matrix",
        yawDegrees: 0,
        radialScale: 1,
        visible: true,
        purpose: "Canonical observer-centred sampling matrix",
      },
      {
        id: "matrix-b",
        name: "Edge-seeking matrix",
        yawDegrees: 7.5,
        radialScale: 1.08,
        visible: false,
        purpose: "Alternative sampling around boundaries and occlusions",
      },
    ],
    facets: [],
    bodyProfile: {
      standingHeightMetres: null,
      eyeHeightMetres: null,
      headWidthMetres: null,
      interpupillaryDistanceMetres: null,
    },
    calibration: [],
    externalFrames: [],
    provenance: {
      sourceRepositories: [
        "https://github.com/auraofintelligence/aura-horn-torus",
        "https://github.com/auraofintelligence/aura-scan-pipeline",
      ],
      transformHistory: [],
      notes: ["No model inference is present unless an evidence record says otherwise."],
    },
  };
}

export function impliedRange(knownLengthMetres: number, angularSpanDegrees: number): number {
  if (!(knownLengthMetres > 0) || !(angularSpanDegrees > 0 && angularSpanDegrees < 180)) {
    return Number.NaN;
  }
  return knownLengthMetres / (2 * Math.tan((angularSpanDegrees * Math.PI) / 360));
}

export function calibrationSummary(constraints: readonly CalibrationConstraint[]) {
  const valid = constraints.filter((item) => Number.isFinite(item.impliedRangeMetres));
  if (!valid.length) return { meanRangeMetres: null, residualMetres: null, count: 0 };
  const mean = valid.reduce((sum, item) => sum + item.impliedRangeMetres, 0) / valid.length;
  const residual = Math.sqrt(
    valid.reduce((sum, item) => sum + (item.impliedRangeMetres - mean) ** 2, 0) / valid.length,
  );
  return { meanRangeMetres: mean, residualMetres: residual, count: valid.length };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isShellState(value: unknown, expectedIndex: number): value is ShellState {
  if (!isRecord(value)) return false;
  return (
    value.shellIndex === SHELLS[expectedIndex].index &&
    typeof value.visible === "boolean" &&
    typeof value.reachScale === "number" &&
    Number.isFinite(value.reachScale) &&
    value.reachScale > 0
  );
}

function isScenePipelineStage(value: unknown, expectedIndex: number): value is ScenePipelineStage {
  if (!isRecord(value)) return false;
  const validStatuses: readonly ScenePipelineStageStatus[] = [
    "manual-only",
    "not-connected",
    "ready",
    "running",
    "complete",
    "error",
  ];
  const baseIsValid = (
    value.id === SCENE_PIPELINE_STAGE_IDS[expectedIndex] &&
    typeof value.label === "string" &&
    validStatuses.includes(value.status as ScenePipelineStageStatus) &&
    isNullableString(value.adapterId) &&
    isNullableString(value.adapterVersion) &&
    isStringArray(value.inputSourceIds) &&
    isStringArray(value.outputIds) &&
    isNullableString(value.lastRunAt) &&
    isNullableString(value.error) &&
    isStringArray(value.notes)
  );
  if (!baseIsValid) return false;

  const status = value.status as ScenePipelineStageStatus;
  if (status === "manual-only") {
    return expectedIndex === 0
      && value.adapterId === null
      && value.adapterVersion === null
      && (value.outputIds as string[]).length === 0
      && value.lastRunAt === null
      && value.error === null;
  }
  if (status === "not-connected") {
    return expectedIndex > 0
      && value.adapterId === null
      && value.adapterVersion === null
      && (value.inputSourceIds as string[]).length === 0
      && (value.outputIds as string[]).length === 0
      && value.lastRunAt === null
      && value.error === null;
  }

  const hasTraceableRun = isNonEmptyString(value.adapterId)
    && isNonEmptyString(value.adapterVersion)
    && (value.inputSourceIds as string[]).length > 0;
  if (status === "ready") {
    return hasTraceableRun
      && (value.outputIds as string[]).length === 0
      && value.lastRunAt === null
      && value.error === null;
  }
  if (status === "running") {
    return hasTraceableRun
      && (value.outputIds as string[]).length === 0
      && isNonEmptyString(value.lastRunAt)
      && value.error === null;
  }
  if (status === "complete") {
    return hasTraceableRun
      && (value.outputIds as string[]).length > 0
      && isNonEmptyString(value.lastRunAt)
      && value.error === null;
  }
  return hasTraceableRun
    && isNonEmptyString(value.lastRunAt)
    && isNonEmptyString(value.error);
}

export function isObservationPackage(value: unknown): value is SpatialObservationPackage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === OBSERVATION_VERSION &&
    record.latticeVersion === LATTICE_VERSION &&
    Array.isArray(record.matrices) &&
    Array.isArray(record.facets) &&
    Array.isArray(record.sources) &&
    Array.isArray(record.captureCollections) &&
    Array.isArray(record.captureRelationships) &&
    Array.isArray(record.shells) &&
    record.shells.length === SHELLS.length &&
    record.shells.every((shell, index) => isShellState(shell, index)) &&
    Array.isArray(record.scenePipeline) &&
    record.scenePipeline.length === SCENE_PIPELINE_STAGE_IDS.length &&
    record.scenePipeline.every((stage, index) => isScenePipelineStage(stage, index)) &&
    Array.isArray(record.rangeHypotheses) &&
    Array.isArray(record.surfaceGroups) &&
    Array.isArray(record.segments) &&
    Array.isArray(record.detections) &&
    Array.isArray(record.meshHypotheses) &&
    isRecord(record.view) &&
    isRecord(record.capture)
  );
}
