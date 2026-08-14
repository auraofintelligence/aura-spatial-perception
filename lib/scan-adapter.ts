/** Read-only bridge for aura-scan-pipeline metadata schema 2.0. */

export const SCAN_ADAPTER_VERSION = "aura-spatial-scan-adapter/0.1.0" as const;
export const SCAN_SOURCE_SCHEMA = "aura-scan-metadata/2.0" as const;

export type Vec3Mutable = [number, number, number];

export const SCAN_Z_UP_TO_AURA_Y_UP_ROW_MAJOR = [
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
] as const;

export type ScanGeometryReference = {
  path: string;
  format: "ply" | "obj" | "glb";
  frame: "RH_Z_UP_METRES" | "RH_Y_UP_METRES";
};

export type ScanBundle = {
  schemaVersion: typeof SCAN_ADAPTER_VERSION;
  sourceSchema: typeof SCAN_SOURCE_SCHEMA;
  pipelineRunId: string;
  sourcePipelineVersion: string;
  name: string;
  geometry: {
    pointCloud: ScanGeometryReference;
    archivalMesh: ScanGeometryReference;
    webMesh: ScanGeometryReference | null;
  };
  scanToPerception: {
    matrixRowMajor: typeof SCAN_Z_UP_TO_AURA_Y_UP_ROW_MAJOR;
    headingStatus: "unknown";
    originStatus: "unregistered";
  };
  scale: unknown;
  projection: unknown;
  location: unknown;
  permissions: unknown;
  provenance: {
    metadataSha256: string;
    geometrySha256: Record<string, string>;
    transformHistory: string[];
  };
  review: {
    status: "unreviewed";
    publicationAllowed: false;
  };
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}

export function safeRelativePath(value: unknown, label: string): string {
  const path = requiredText(value, label).replaceAll("\\", "/");
  if (/^[a-zA-Z]:/.test(path) || path.startsWith("/") || path.split("/").includes("..")) {
    throw new TypeError(`${label} must stay inside the exports directory`);
  }
  return path;
}

export function scanPointToAura(point: readonly [number, number, number]): Vec3Mutable {
  return [point[0], point[2], -point[1]];
}

export function normaliseScanMetadata(
  value: unknown,
  metadataSha256: string,
  geometrySha256: Record<string, string> = {},
): ScanBundle {
  const metadata = record(value, "metadata");
  if (metadata.schema !== SCAN_SOURCE_SCHEMA) {
    throw new TypeError(`Unsupported scan schema ${String(metadata.schema)}`);
  }
  const frame = record(metadata.frame, "metadata.frame");
  if (frame.up_axis !== "Z" || frame.units !== "m") {
    throw new TypeError("Scan geometry must declare Z-up metres before adaptation");
  }
  const files = record(metadata.geometry_files, "metadata.geometry_files");
  const pointCloudPath = safeRelativePath(files.pointcloud_ply, "pointcloud_ply");
  const ply = typeof files.lod2_ply === "string" && files.lod2_ply
    ? safeRelativePath(files.lod2_ply, "lod2_ply")
    : null;
  const obj = typeof files.lod2_obj === "string" && files.lod2_obj
    ? safeRelativePath(files.lod2_obj, "lod2_obj")
    : null;
  if (!ply && !obj) throw new TypeError("A lod2_ply or lod2_obj archival mesh is required");
  const web = typeof files.lod1_glb === "string" && files.lod1_glb
    ? safeRelativePath(files.lod1_glb, "lod1_glb")
    : null;
  const pipeline = record(metadata.pipeline, "metadata.pipeline");
  return {
    schemaVersion: SCAN_ADAPTER_VERSION,
    sourceSchema: SCAN_SOURCE_SCHEMA,
    pipelineRunId: requiredText(metadata.id, "metadata.id"),
    sourcePipelineVersion: requiredText(pipeline.version, "metadata.pipeline.version"),
    name: requiredText(metadata.name, "metadata.name"),
    geometry: {
      pointCloud: { path: pointCloudPath, format: "ply", frame: "RH_Z_UP_METRES" },
      archivalMesh: {
        path: ply ?? obj!,
        format: ply ? "ply" : "obj",
        frame: "RH_Z_UP_METRES",
      },
      webMesh: web ? { path: web, format: "glb", frame: "RH_Y_UP_METRES" } : null,
    },
    scanToPerception: {
      matrixRowMajor: SCAN_Z_UP_TO_AURA_Y_UP_ROW_MAJOR,
      headingStatus: "unknown",
      originStatus: "unregistered",
    },
    scale: metadata.scale,
    projection: metadata.projection,
    location: metadata.location,
    permissions: metadata.permissions,
    provenance: {
      metadataSha256,
      geometrySha256,
      transformHistory: [
        "Numerical scan geometry frame declared RH Z-up metres.",
        "Adapter frame rotation [x,y,z] -> [x,z,-y] declared but not silently applied to source files.",
        "Heading remains unknown and scan origin remains unregistered to the Aura observer centre.",
      ],
    },
    review: { status: "unreviewed", publicationAllowed: false },
  };
}
