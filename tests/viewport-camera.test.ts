import assert from "node:assert/strict";
import test from "node:test";
import {
  createViewportCameraMemory,
  nextOrbitDistanceRatio,
  orbitDistance,
} from "../lib/viewport-camera";

test("outside orbit and inside look directions have independent camera memory", () => {
  const memory = createViewportCameraMemory();
  memory.orbit.theta = 1.4;
  memory.orbit.phi = 0.8;
  memory.inside.yaw = -0.9;
  memory.inside.pitch = 0.3;

  assert.deepEqual(memory.orbit, {
    theta: 1.4,
    phi: 0.8,
    distanceRatio: 1.72,
    rootYaw: 0,
  });
  assert.deepEqual(memory.inside, { yaw: -0.9, pitch: 0.3 });
});

test("orbit distance preserves framing when the scene search radius changes", () => {
  assert.equal(orbitDistance(10, 1.72), 17.2);
  assert.equal(orbitDistance(25, 1.72), 43);
});

test("orbit wheel zoom remains within the existing display limits", () => {
  assert.equal(nextOrbitDistanceRatio(1, -100_000, 10), 0.25);
  assert.equal(nextOrbitDistanceRatio(1, 100_000, 10), 5);
  assert.ok(nextOrbitDistanceRatio(1.72, -100, 10) < 1.72);
  assert.ok(nextOrbitDistanceRatio(1.72, 100, 10) > 1.72);
});
