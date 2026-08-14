import assert from "node:assert/strict";
import test from "node:test";
import { knownSizeRangeEvidence, manualRangeEvidence, sobelEdgeEvidence } from "../lib/evidence";

function image(width: number, height: number, pixel: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = pixel(x, y);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

test("returns zero evidence for a flat image rather than invented texture", () => {
  const result = sobelEdgeEvidence(image(8, 8, () => 128));
  assert.equal(result.meanStrength, 0);
  assert.equal(result.peakStrength, 0);
  assert.equal(result.sampleCount, 48);
  assert.equal(result.seamWrapped, true);
});

test("detects a real luminance boundary", () => {
  const result = sobelEdgeEvidence(image(12, 8, (x) => x < 6 ? 0 : 255));
  assert.ok(result.meanStrength > 0);
  assert.ok(result.peakStrength > 0.3);
});

test("keeps a human estimate distinct from a physical measurement", () => {
  const estimate = manualRangeEvidence("manual-local", 2.4, "visual judgement", "estimated");
  assert.equal(estimate.status, "estimated");
  assert.equal(estimate.value.basis, "estimated");
  assert.equal(estimate.confidence, null);
  assert.match(estimate.provenance, /not inferred or independently verified/);
});

test("gives every range evidence record its own identity", () => {
  const records = Array.from({ length: 5 }, (_, index) => manualRangeEvidence(
    "manual-local",
    2.4,
    `neighbour ${index}`,
    "hypothesis",
  ));
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  assert.ok(records.every((record) => record.value.basis === "hypothesis"));
});

test("keeps a known-size angular calculation traceable and estimated", () => {
  const evidence = knownSizeRangeEvidence("photo-a", {
    id: "constraint-a",
    label: "one metre sign",
    knownLengthMetres: 1,
    angularSpanDegrees: 20,
    impliedRangeMetres: 2.8356409098088546,
  });
  assert.equal(evidence.sourceId, "photo-a");
  assert.equal(evidence.status, "estimated");
  assert.equal(evidence.value.basis, "estimated");
  assert.equal(evidence.value.constraintId, "constraint-a");
  assert.equal(evidence.value.metres, 2.8356409098088546);
  assert.match(evidence.algorithm, /known-size-angular-range/);
  assert.match(evidence.provenance, /estimate, not an independently verified surface hit/);
});
