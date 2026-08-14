import {
  COLS,
  ROWS,
  TAU,
  type Vec3,
  facetDefinition,
  rotateY,
} from "./aura-geometry";

export type UV = readonly [number, number];

/**
 * Three.js starts an unmirrored sphere's horizontal texture register at -X.
 * Rotating it by -90 degrees puts u=0 on -Z, matching the projection
 * convention used by every facet and panorama-map calculation in this app.
 */
export const EQUIRECTANGULAR_PHOTOSPHERE_YAW_RADIANS = -Math.PI / 2;

export type ProjectionTransform = {
  id: string;
  sourceProjection: "equirectangular" | "native-eac-paired" | "cubemap" | "perspective";
  targetProjection: "equirectangular";
  yawDegrees: number;
  convention: "u-right-v-down-y-up-seam-at-minus-z";
};

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function directionToEquirectangular(direction: Vec3, yawDegrees = 0): UV {
  const rotated = rotateY(direction, yawDegrees);
  const u = wrapUnit(Math.atan2(rotated[0], rotated[2]) / TAU + 0.5);
  const v = Math.acos(clamp(rotated[1], -1, 1)) / Math.PI;
  return [u, v];
}

export function equirectangularToDirection(u: number, v: number, yawDegrees = 0): Vec3 {
  const longitude = (wrapUnit(u) - 0.5) * TAU;
  const latitude = Math.PI / 2 - clamp(v, 0, 1) * Math.PI;
  const cosLatitude = Math.cos(latitude);
  const direction: Vec3 = [
    cosLatitude * Math.sin(longitude),
    Math.sin(latitude),
    cosLatitude * Math.cos(longitude),
  ];
  return rotateY(direction, -yawDegrees);
}

/**
 * Corner-ray polygon in equirectangular coordinates. It intentionally retains
 * the horn singularity: ring-one registers coincide at the north axis while
 * keeping 24 different addresses.
 */
export function facetProjectionPolygon(
  shellIndex: number,
  facetNumber: number,
  yawDegrees = 0,
): readonly [UV, UV, UV, UV] {
  const facet = facetDefinition(shellIndex, "exterior", facetNumber);
  const [topLeft, topRight, bottomLeft, bottomRight] = facet.corners;
  return [
    directionToEquirectangular(topLeft.direction, yawDegrees),
    directionToEquirectangular(topRight.direction, yawDegrees),
    directionToEquirectangular(bottomRight.direction, yawDegrees),
    directionToEquirectangular(bottomLeft.direction, yawDegrees),
  ];
}

/**
 * The continuous image patch reached by the facet interior. This differs from
 * the exact corner-ray polygon for row one because the horn point is singular:
 * the source assigns its coincident register rays to north while the surface
 * approaches that point from the south. Both are exposed in the instrument.
 */
export function facetParameterPatchPolygon(
  facetNumber: number,
  yawDegrees = 0,
): readonly [UV, UV, UV, UV] {
  const zero = facetNumber - 1;
  const row = Math.floor(zero / COLS);
  const column = zero % COLS;
  const yaw = yawDegrees / 360;
  const left = wrapUnit(column / COLS + yaw);
  const right = wrapUnit((column + 1) / COLS + yaw);
  const top = 1 - (row + 1) / ROWS;
  const bottom = 1 - row / ROWS;
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

export function centreProjection(
  shellIndex: number,
  facetNumber: number,
  yawDegrees = 0,
): UV {
  const centre = facetDefinition(shellIndex, "exterior", facetNumber).centre.direction;
  return directionToEquirectangular(centre, yawDegrees);
}

export function facetFromEquirectangular(u: number, v: number, yawDegrees = 0): number {
  const direction = equirectangularToDirection(u, v, yawDegrees);
  // Invert the source horn-ray direction. For all non-singular directions,
  // source v relates to spherical colatitude by sourceV = 1 - imageV.
  const sourceU = wrapUnit(Math.atan2(direction[0], direction[2]) / TAU + 0.5);
  const imageV = Math.acos(clamp(direction[1], -1, 1)) / Math.PI;
  const sourceV = wrapUnit(1 - imageV);
  const column = Math.min(COLS - 1, Math.floor(sourceU * COLS));
  const row = Math.min(ROWS - 1, Math.floor(sourceV * ROWS));
  return row * COLS + column + 1;
}

export function unwrapPolygonForCanvas(polygon: readonly UV[]): UV[] {
  if (polygon.length === 0) return [];
  const result: [number, number][] = [[polygon[0][0], polygon[0][1]]];
  for (let index = 1; index < polygon.length; index += 1) {
    let u = polygon[index][0];
    const previous = result[index - 1][0];
    while (u - previous > 0.5) u -= 1;
    while (u - previous < -0.5) u += 1;
    result.push([u, polygon[index][1]]);
  }
  return result;
}

export function seamCopies(polygon: readonly UV[]): UV[][] {
  const unwrapped = unwrapPolygonForCanvas(polygon);
  const minimum = Math.min(...unwrapped.map(([u]) => u));
  const maximum = Math.max(...unwrapped.map(([u]) => u));
  const copies: UV[][] = [unwrapped];
  if (minimum < 0) copies.push(unwrapped.map(([u, v]) => [u + 1, v] as UV));
  if (maximum > 1) copies.push(unwrapped.map(([u, v]) => [u - 1, v] as UV));
  return copies;
}
