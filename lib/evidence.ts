import type { UV } from "./projection";

export type EvidenceStatus = "observed" | "estimated" | "measured" | "not-connected";

export type EvidenceRecord = {
  id: string;
  kind: "edge" | "depth" | "normal" | "segment" | "feature" | "manual-range";
  status: EvidenceStatus;
  sourceId: string;
  sourceProjection: string;
  algorithm: string;
  confidence: number | null;
  value: Record<string, number | string | boolean | null>;
  createdAt: string;
  provenance: string;
};

export type EdgeResult = {
  meanStrength: number;
  peakStrength: number;
  sampleCount: number;
  seamWrapped: boolean;
};

export type ManualRangeBasis = "measured" | "estimated" | "hypothesis";

let evidenceSequence = 0;

function nextEvidenceId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  evidenceSequence += 1;
  return `${prefix}-${Date.now()}-${evidenceSequence}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Real, deterministic Sobel evidence over an ImageData patch. Horizontal
 * neighbours wrap so an equirectangular seam is not treated as an image edge.
 */
export function sobelEdgeEvidence(image: ImageData): EdgeResult {
  const { width, height, data } = image;
  if (width < 3 || height < 3) {
    return { meanStrength: 0, peakStrength: 0, sampleCount: 0, seamWrapped: true };
  }
  const valueAt = (x: number, y: number): number => {
    const wrappedX = ((x % width) + width) % width;
    const clampedY = Math.max(0, Math.min(height - 1, y));
    const offset = (clampedY * width + wrappedX) * 4;
    return luminance(data[offset], data[offset + 1], data[offset + 2]);
  };
  let total = 0;
  let peak = 0;
  let samples = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx =
        -valueAt(x - 1, y - 1) + valueAt(x + 1, y - 1) +
        -2 * valueAt(x - 1, y) + 2 * valueAt(x + 1, y) +
        -valueAt(x - 1, y + 1) + valueAt(x + 1, y + 1);
      const gy =
        -valueAt(x - 1, y - 1) - 2 * valueAt(x, y - 1) - valueAt(x + 1, y - 1) +
        valueAt(x - 1, y + 1) + 2 * valueAt(x, y + 1) + valueAt(x + 1, y + 1);
      const strength = Math.min(1, Math.hypot(gx, gy) / (255 * Math.SQRT2 * 4));
      total += strength;
      peak = Math.max(peak, strength);
      samples += 1;
    }
  }
  return {
    meanStrength: samples ? total / samples : 0,
    peakStrength: peak,
    sampleCount: samples,
    seamWrapped: true,
  };
}

export function patchBounds(polygon: readonly UV[], width: number, height: number) {
  const us = polygon.map(([u]) => u);
  const vs = polygon.map(([, v]) => v);
  return {
    x: Math.floor(Math.max(0, Math.min(...us)) * width),
    y: Math.floor(Math.max(0, Math.min(...vs)) * height),
    width: Math.max(1, Math.ceil((Math.min(1, Math.max(...us)) - Math.max(0, Math.min(...us))) * width)),
    height: Math.max(1, Math.ceil((Math.min(1, Math.max(...vs)) - Math.max(0, Math.min(...vs))) * height)),
  };
}

export function manualRangeEvidence(
  sourceId: string,
  metres: number,
  note: string,
  basis: ManualRangeBasis,
): EvidenceRecord {
  return {
    id: nextEvidenceId("manual-range"),
    kind: "manual-range",
    status: basis === "measured" ? "measured" : "estimated",
    sourceId,
    sourceProjection: basis === "measured" ? "human/site measurement" : "manual spatial judgement",
    algorithm: "manual-range-constraint/1.1",
    confidence: null,
    value: { metres, note, basis },
    createdAt: new Date().toISOString(),
    provenance: `Entered by the local user as ${basis}; not inferred or independently verified by a model.`,
  };
}

export function knownSizeRangeEvidence(
  sourceId: string,
  constraint: {
    id: string;
    label: string;
    knownLengthMetres: number;
    angularSpanDegrees: number;
    impliedRangeMetres: number;
  },
): EvidenceRecord {
  return {
    id: nextEvidenceId("known-size-range"),
    kind: "manual-range",
    status: "estimated",
    sourceId,
    sourceProjection: "known-size angular calculation",
    algorithm: "known-size-angular-range/1.0",
    confidence: null,
    value: {
      metres: constraint.impliedRangeMetres,
      basis: "estimated",
      constraintId: constraint.id,
      label: constraint.label,
      knownLengthMetres: constraint.knownLengthMetres,
      angularSpanDegrees: constraint.angularSpanDegrees,
    },
    createdAt: new Date().toISOString(),
    provenance: "Calculated locally from a user-entered real length and angular span. It assumes the marked span represents that length across the viewing direction; it is an estimate, not an independently verified surface hit.",
  };
}
