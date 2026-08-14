export type ViewportCameraMemory = {
  orbit: {
    theta: number;
    phi: number;
    distanceRatio: number;
    rootYaw: number;
  };
  inside: {
    yaw: number;
    pitch: number;
  };
};

export function createViewportCameraMemory(): ViewportCameraMemory {
  return {
    orbit: {
      theta: 0.65,
      phi: 1.05,
      distanceRatio: 1.72,
      rootYaw: 0,
    },
    inside: {
      yaw: 0,
      pitch: 0,
    },
  };
}

export function orbitDistance(searchRadius: number, distanceRatio: number): number {
  return searchRadius * distanceRatio;
}

export function nextOrbitDistanceRatio(
  currentRatio: number,
  wheelDeltaY: number,
  searchRadius: number,
): number {
  const minimumRatio = 2.5 / searchRadius;
  return Math.max(
    minimumRatio,
    Math.min(5, currentRatio * Math.exp(wheelDeltaY * 0.001)),
  );
}
