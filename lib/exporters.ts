import {
  SHELLS,
  facetDefinition,
  rotateY,
  scale,
  type Vec3,
} from "./aura-geometry";
import type { FacetObservation, MatrixState, SpatialObservationPackage } from "./observation";

type RangedFacetObservation = FacetObservation & { rangeMetres: number };

function isRangedFacetForSource(
  facet: FacetObservation,
  sourceId: string,
): facet is RangedFacetObservation {
  return (
    facet.sourceId === sourceId &&
    typeof facet.rangeMetres === "number" &&
    Number.isFinite(facet.rangeMetres) &&
    facet.rangeMetres > 0
  );
}

function pointForFacet(
  facet: RangedFacetObservation,
  matrix: MatrixState,
): Vec3 {
  const definition = facetDefinition(facet.shellIndex, facet.face, facet.facetNumber);
  return rotateY(scale(definition.centre.direction, facet.rangeMetres), matrix.yawDegrees);
}

export function observationToPly(observation: SpatialObservationPackage, sourceId: string): string {
  const facets = observation.facets.filter((facet) => isRangedFacetForSource(facet, sourceId));
  const rows = facets.map((facet) => {
    const matrix = observation.matrices.find((candidate) => candidate.id === facet.matrixId) ?? observation.matrices[0];
    const point = pointForFacet(facet, matrix);
    const shell = SHELLS[facet.shellIndex];
    const colour = shell.colour.match(/[a-f0-9]{2}/gi)?.map((hex) => parseInt(hex, 16)) ?? [255, 255, 255];
    return `${point[0].toFixed(8)} ${point[1].toFixed(8)} ${point[2].toFixed(8)} ${colour[0]} ${colour[1]} ${colour[2]} ${facet.facetNumber}`;
  });
  return [
    "ply",
    "format ascii 1.0",
    "comment Aura Spatial Perception range-constrained point samples; not a mesh",
    `comment schema ${observation.schemaVersion}`,
    `comment source ${sourceId}`,
    `element vertex ${rows.length}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "property int aura_facet",
    "end_header",
    ...rows,
    "",
  ].join("\n");
}

export function observationToObj(observation: SpatialObservationPackage, sourceId: string): string {
  const facets = observation.facets.filter((facet) => isRangedFacetForSource(facet, sourceId));
  const lines = [
    "# Aura Spatial Perception range-constrained point samples; not a mesh",
    `# schema ${observation.schemaVersion}`,
    `# source ${sourceId}`,
  ];
  facets.forEach((facet) => {
    const matrix = observation.matrices.find((candidate) => candidate.id === facet.matrixId) ?? observation.matrices[0];
    const point = pointForFacet(facet, matrix);
    lines.push(`v ${point[0].toFixed(8)} ${point[1].toFixed(8)} ${point[2].toFixed(8)}`);
  });
  if (facets.length) {
    lines.push(`p ${facets.map((_, index) => index + 1).join(" ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function downloadText(filename: string, content: string, mediaType: string): void {
  const blob = new Blob([content], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
