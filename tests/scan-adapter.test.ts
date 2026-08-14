import assert from "node:assert/strict";
import test from "node:test";
import { normaliseScanMetadata, safeRelativePath, scanPointToAura } from "../lib/scan-adapter";

const metadata = {
  schema: "aura-scan-metadata/2.0",
  id: "run-uuid",
  name: "test-scan",
  frame: { up_axis: "Z", units: "m" },
  geometry_files: {
    pointcloud_ply: "test_points.ply",
    lod2_ply: "test_lod2.ply",
    lod2_obj: "test_lod2.obj",
    lod1_glb: "test_lod1.glb",
  },
  pipeline: { version: "0.1.0" },
  scale: { verified: false },
  projection: {},
  location: {},
  permissions: {},
};

test("normalises the current real scan-pipeline contract without inventing registration", () => {
  const bundle = normaliseScanMetadata(metadata, "abc123", { "test_points.ply": "def456" });
  assert.equal(bundle.geometry.pointCloud.frame, "RH_Z_UP_METRES");
  assert.equal(bundle.geometry.webMesh?.frame, "RH_Y_UP_METRES");
  assert.equal(bundle.scanToPerception.originStatus, "unregistered");
  assert.equal(bundle.scanToPerception.headingStatus, "unknown");
  assert.equal(bundle.review.publicationAllowed, false);
  assert.deepEqual(scanPointToAura([1, 2, 3]), [1, 3, -2]);
});

test("rejects path escape and schema/frame drift", () => {
  assert.throws(() => safeRelativePath("../private.ply", "pointcloud"));
  assert.throws(() => safeRelativePath("C:\\private.ply", "pointcloud"));
  assert.throws(() => normaliseScanMetadata({ ...metadata, schema: "future" }, "hash"));
  assert.throws(() => normaliseScanMetadata({ ...metadata, frame: { up_axis: "Y", units: "m" } }, "hash"));
});
