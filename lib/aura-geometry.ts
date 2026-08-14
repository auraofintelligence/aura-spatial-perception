/**
 * Canonical Aura lattice, version 1.
 *
 * This is a direct TypeScript translation of the closed roll-path geometry,
 * addressing, shell colours and ray register rules in aura-horn-torus.
 * See PROVENANCE.md before changing any convention in this file.
 */

export const LATTICE_VERSION = "aura-lattice/1.0.0" as const;
export const ROWS = 12 as const;
export const COLS = 24 as const;
export const FACETS_PER_SHELL = ROWS * COLS;
export const TAU = Math.PI * 2;
export const BASE_RADIUS = ROWS / TAU;
export const MINIMUM_DISPLAY_SEARCH_RADIUS = 6.2;

export type Face = "interior" | "exterior";
export type Vec3 = readonly [number, number, number];
export type ParameterPoint = readonly [number, number];

export type ShellDefinition = {
  index: number;
  id: "red" | "orange" | "yellow" | "green" | "blue" | "indigo" | "violet";
  name: "Red" | "Orange" | "Yellow" | "Green" | "Blue" | "Indigo" | "Violet";
  colour: string;
  nestedScale: number;
};

export const SHELLS: readonly ShellDefinition[] = [
  { index: 0, id: "red", name: "Red", colour: "#e23a2e", nestedScale: 1 / 7 },
  { index: 1, id: "orange", name: "Orange", colour: "#f2801f", nestedScale: 2 / 7 },
  { index: 2, id: "yellow", name: "Yellow", colour: "#f0c414", nestedScale: 3 / 7 },
  { index: 3, id: "green", name: "Green", colour: "#35a24f", nestedScale: 4 / 7 },
  { index: 4, id: "blue", name: "Blue", colour: "#2f6fed", nestedScale: 5 / 7 },
  { index: 5, id: "indigo", name: "Indigo", colour: "#5546c8", nestedScale: 6 / 7 },
  { index: 6, id: "violet", name: "Violet", colour: "#9a4fd6", nestedScale: 1 },
] as const;

export type RayRegister = {
  id: string;
  kind: "vertex" | "centre";
  shellIndex: number;
  ring: number;
  column: number;
  u: number;
  v: number;
  horn: boolean;
  direction: Vec3;
  binding: null;
};

export type FacetDefinition = {
  number: number;
  row: number;
  column: number;
  shellIndex: number;
  face: Face;
  address: string;
  centre: RayRegister;
  corners: readonly [RayRegister, RayRegister, RayRegister, RayRegister];
  neighbours: {
    north: number;
    east: number;
    south: number;
    west: number;
  };
};

export function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

export function wrap(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(vector: Vec3, amount: number): Vec3 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

export function length(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function normalise(vector: Vec3): Vec3 {
  const magnitude = length(vector);
  if (magnitude < 1e-12) return [0, 1, 0];
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

/** Closed horn-torus surface point from the source roll path. */
export function torusPoint(u: number, v: number): Vec3 {
  const w = v * TAU;
  const psi = (u - 0.5) * TAU;
  const q = BASE_RADIUS * (1 - Math.cos(w));
  return [q * Math.sin(psi), -BASE_RADIUS * Math.sin(w), q * Math.cos(psi)];
}

/**
 * Continuous viewing direction used when the observer is at the horn nexus.
 *
 * Away from the horn this is exactly `normalise(torusPoint(u, v))`. At the
 * coincident horn itself, the physical point has no usable size or direction,
 * so the two approach limits are opened into the north and south poles of an
 * angular guide. This is display geometry only: it does not change the source
 * ray-register convention or the canonical horn surface.
 */
export function angularGuideDirection(u: number, v: number): Vec3 {
  const polar = Math.PI * v;
  const psi = (u - 0.5) * TAU;
  const radial = Math.sin(polar);
  if (Math.abs(radial) < 1e-12) return [0, v < 0.5 ? -1 : 1, 0];
  return [radial * Math.sin(psi), -Math.cos(polar), radial * Math.cos(psi)];
}

/** The unwrapped parameter rectangle for one address in the at-zero guide. */
export function angularFacetParameterCorners(
  facetNumber: number,
): readonly [ParameterPoint, ParameterPoint, ParameterPoint, ParameterPoint] {
  if (!Number.isInteger(facetNumber) || facetNumber < 1 || facetNumber > FACETS_PER_SHELL) {
    throw new RangeError(`Facet number must be 1-${FACETS_PER_SHELL}`);
  }
  const index = facetNumber - 1;
  const row = Math.floor(index / COLS);
  const column = index % COLS;
  const u0 = column / COLS;
  const u1 = (column + 1) / COLS;
  const v0 = row / ROWS;
  const v1 = (row + 1) / ROWS;
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

/**
 * Adaptive drawing boundary for an open search ray. This is not a measured
 * sensor range: it simply keeps the line visibly beyond every horn envelope
 * and every positive range point currently present in the view.
 */
export function displaySearchRadius(
  maximumShellReach: number,
  maximumRange: number,
): number {
  const shellReach = Number.isFinite(maximumShellReach) && maximumShellReach > 0
    ? maximumShellReach
    : 0;
  const range = Number.isFinite(maximumRange) && maximumRange > 0 ? maximumRange : 0;
  return Math.max(MINIMUM_DISPLAY_SEARCH_RADIUS, shellReach * 2.5, range * 1.25);
}

/**
 * Unit ray from the observer-centred zero point.
 * The exact horn is singular. The source explicitly assigns [0, 1, 0] to all
 * 24 coincident seam registers and preserves their separate identities.
 */
export function rayDirection(u: number, v: number): Vec3 {
  const w = v * TAU;
  const psi = (u - 0.5) * TAU;
  const q = 1 - Math.cos(w);
  const raw: Vec3 = [q * Math.sin(psi), -Math.sin(w), q * Math.cos(psi)];
  return normalise(raw);
}

export function vertexRay(shellIndex: number, ring: number, column: number): RayRegister {
  const shell = SHELLS[shellIndex];
  if (!shell) throw new RangeError(`Unknown shell index ${shellIndex}`);
  const wrappedRing = wrap(ring - 1, ROWS) + 1;
  const wrappedColumn = wrap(column, COLS);
  const u = wrappedColumn / COLS;
  const v = (wrappedRing - 1) / ROWS;
  const register = (wrappedRing - 1) * COLS + wrappedColumn + 1;
  const horn = wrappedRing === 1;
  return {
    id: `${shell.name} R${wrappedRing},L${pad3(register)}`,
    kind: "vertex",
    shellIndex,
    ring: wrappedRing,
    column: wrappedColumn,
    u,
    v,
    horn,
    direction: horn ? [0, 1, 0] : rayDirection(u, v),
    binding: null,
  };
}

export function centreRay(shellIndex: number, row: number, column: number): RayRegister {
  const shell = SHELLS[shellIndex];
  if (!shell) throw new RangeError(`Unknown shell index ${shellIndex}`);
  const wrappedRow = wrap(row, ROWS);
  const wrappedColumn = wrap(column, COLS);
  const u = (wrappedColumn + 0.5) / COLS;
  const v = (wrappedRow + 0.5) / ROWS;
  const register = wrappedRow * COLS + wrappedColumn + 1;
  return {
    id: `${shell.name} FR${wrappedRow + 1},L${pad3(register)}`,
    kind: "centre",
    shellIndex,
    ring: wrappedRow + 1,
    column: wrappedColumn,
    u,
    v,
    horn: false,
    direction: rayDirection(u, v),
    binding: null,
  };
}

export function facetNumber(row: number, column: number): number {
  return wrap(row, ROWS) * COLS + wrap(column, COLS) + 1;
}

export function rowColumn(number: number): { row: number; column: number } {
  if (!Number.isInteger(number) || number < 1 || number > FACETS_PER_SHELL) {
    throw new RangeError(`Facet number must be 1–${FACETS_PER_SHELL}`);
  }
  const zero = number - 1;
  return { row: Math.floor(zero / COLS), column: zero % COLS };
}

export function facetAddress(shellIndex: number, face: Face, number: number): string {
  const shell = SHELLS[shellIndex];
  if (!shell) throw new RangeError(`Unknown shell index ${shellIndex}`);
  const register = face === "interior" ? "I" : "O";
  return `${shell.name} ${register}${number}`;
}

export function facetDefinition(
  shellIndex: number,
  face: Face,
  number: number,
): FacetDefinition {
  const { row, column } = rowColumn(number);
  const topRing = row + 1;
  const bottomRing = wrap(row + 1, ROWS) + 1;
  return {
    number,
    row,
    column,
    shellIndex,
    face,
    address: facetAddress(shellIndex, face, number),
    centre: centreRay(shellIndex, row, column),
    corners: [
      vertexRay(shellIndex, topRing, column),
      vertexRay(shellIndex, topRing, column + 1),
      vertexRay(shellIndex, bottomRing, column),
      vertexRay(shellIndex, bottomRing, column + 1),
    ],
    neighbours: {
      north: facetNumber(row - 1, column),
      east: facetNumber(row, column + 1),
      south: facetNumber(row + 1, column),
      west: facetNumber(row, column - 1),
    },
  };
}

export function allFacetDefinitions(shellIndex: number, face: Face): FacetDefinition[] {
  return Array.from({ length: FACETS_PER_SHELL }, (_, index) =>
    facetDefinition(shellIndex, face, index + 1),
  );
}

export function allRayRegisters(shellIndex: number): RayRegister[] {
  const rays: RayRegister[] = [];
  for (let ring = 1; ring <= ROWS; ring += 1) {
    for (let column = 0; column < COLS; column += 1) {
      rays.push(vertexRay(shellIndex, ring, column));
    }
  }
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      rays.push(centreRay(shellIndex, row, column));
    }
  }
  return rays;
}

export function rotateY(vector: Vec3, degrees: number): Vec3 {
  const angle = (degrees * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    vector[0] * cosine + vector[2] * sine,
    vector[1],
    -vector[0] * sine + vector[2] * cosine,
  ];
}

export function representativeGeometry(): Record<string, unknown> {
  return {
    version: LATTICE_VERSION,
    rows: ROWS,
    columns: COLS,
    facetsPerShell: FACETS_PER_SHELL,
    shells: SHELLS.length,
    addresses: SHELLS.length * FACETS_PER_SHELL * 2,
    raysPerShell: FACETS_PER_SHELL * 2,
    representatives: [
      vertexRay(0, 1, 0),
      vertexRay(0, 2, 0),
      centreRay(3, 0, 0),
      facetDefinition(6, "exterior", 288),
    ],
  };
}
