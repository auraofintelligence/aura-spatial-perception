"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BASE_RADIUS,
  COLS,
  FACETS_PER_SHELL,
  LATTICE_VERSION,
  ROWS,
  SHELLS,
  facetDefinition,
  type Face,
} from "@/lib/aura-geometry";
import {
  knownSizeRangeEvidence,
  manualRangeEvidence,
  patchBounds,
  sobelEdgeEvidence,
  type EvidenceRecord,
  type ManualRangeBasis,
} from "@/lib/evidence";
import { downloadText, observationToObj, observationToPly } from "@/lib/exporters";
import {
  OBSERVATION_VERSION,
  calibrationSummary,
  createObservationPackage,
  impliedRange,
  isObservationPackage,
  type CalibrationConstraint,
  type CaptureCollection,
  type CaptureSource,
  type FacetObservation,
  type MatrixState,
  type SpatialObservationPackage,
} from "@/lib/observation";
import {
  centreProjection,
  facetParameterPatchPolygon,
} from "@/lib/projection";
import { AuraViewport, type ViewMode } from "./AuraViewport";
import { PanoramaMap } from "./PanoramaMap";

type Panel = "enter" | "facet" | "capture" | "evidence" | "matrices" | "calibrate" | "export";

const PANELS: readonly { id: Panel; number: string; label: string; eyebrow: string }[] = [
  { id: "enter", number: "01", label: "Enter the Aura", eyebrow: "zero point" },
  { id: "facet", number: "02", label: "Read a facet", eyebrow: "address + rays" },
  { id: "capture", number: "03", label: "Enter a capture", eyebrow: "source imagery" },
  { id: "evidence", number: "04", label: "Build scene evidence", eyebrow: "honest pipeline" },
  { id: "matrices", number: "05", label: "Shift attention", eyebrow: "another matrix" },
  { id: "calibrate", number: "06", label: "Make it metric", eyebrow: "known measures" },
  { id: "export", number: "07", label: "Carry it onward", eyebrow: "open package" },
] as const;

function rangeKey(matrixId: string, shellIndex: number, facetNumber: number): string {
  return `${matrixId}:${shellIndex}:${facetNumber}`;
}

function formatVector(vector: readonly number[]): string {
  return vector.map((value) => (Math.abs(value) < 1e-9 ? "0.000" : value.toFixed(3))).join(" · ");
}

function formatMetres(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "not established" : `${value.toFixed(3)} m`;
}

function safeNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const naturalFilenameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function captureMatchesFile(source: CaptureSource, file: File): boolean {
  return source.kind === "equirectangular-image"
    && source.name === file.name
    && source.bytes === file.size
    && source.lastModified === new Date(file.lastModified).toISOString();
}

function sourceIdsMatch(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  if (new Set(left).size !== left.length) return false;
  const rightIds = new Set(right);
  return rightIds.size === left.length && left.every((sourceId) => rightIds.has(sourceId));
}

function makeCapture(file: File, kind: CaptureSource["kind"], status: CaptureSource["status"]): CaptureSource {
  return {
    id: `capture-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
    kind,
    name: file.name,
    mediaType: file.type || null,
    bytes: file.size,
    lastModified: new Date(file.lastModified).toISOString(),
    sha256: null,
    widthPixels: null,
    heightPixels: null,
    aspectRatio: null,
    durationSeconds: null,
    nativePreserved: true,
    status,
  };
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readVideoMetadata(file: File): Promise<Pick<CaptureSource, "widthPixels" | "heightPixels" | "aspectRatio" | "durationSeconds">> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
      reject(new Error("video metadata inspection timed out"));
    }, 15_000);
    const finish = () => {
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (settled) return;
      const widthPixels = video.videoWidth || null;
      const heightPixels = video.videoHeight || null;
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;
      finish();
      resolve({
        widthPixels,
        heightPixels,
        aspectRatio: widthPixels && heightPixels ? widthPixels / heightPixels : null,
        durationSeconds,
      });
    };
    video.onerror = () => {
      if (settled) return;
      finish();
      reject(new Error("this browser could not read its video metadata"));
    };
    video.src = url;
  });
}

function replaceFacet(
  facets: FacetObservation[],
  target: Omit<FacetObservation, "evidence" | "rangeMetres" | "manualNote">,
  update: (existing: FacetObservation) => FacetObservation,
): FacetObservation[] {
  const index = facets.findIndex((facet) =>
    facet.sourceId === target.sourceId &&
    facet.matrixId === target.matrixId &&
    facet.shellIndex === target.shellIndex &&
    facet.facetNumber === target.facetNumber &&
    facet.face === target.face,
  );
  const existing: FacetObservation = index >= 0 ? facets[index] : {
    ...target,
    rangeMetres: null,
    evidence: [],
    manualNote: "",
  };
  const next = update(existing);
  if (index < 0) return [...facets, next];
  return facets.map((facet, facetIndex) => facetIndex === index ? next : facet);
}

function statusLabel(capture: CaptureSource): string {
  if (capture.kind === "unloaded") return "waiting for a genuine capture";
  if (capture.kind === "gopro-max-360") return "native source registered · stream inspection pending";
  if (capture.kind === "equirectangular-video") {
    return capture.status === "browser-inspected"
      ? "reference video inspected · playback not connected"
      : "reference video registered · metadata pending";
  }
  return "equirectangular source ready";
}

export function SpatialInstrument() {
  const [observation, setObservation] = useState<SpatialObservationPackage>(() => createObservationPackage());
  const [activePanel, setActivePanel] = useState<Panel>("enter");
  const [shellIndex, setShellIndex] = useState(3);
  const [facetNumber, setFacetNumber] = useState(133);
  const [face, setFace] = useState<Face>("exterior");
  const [selectedMatrixId, setSelectedMatrixId] = useState("matrix-a");
  const [viewMode, setViewMode] = useState<ViewMode>("orbit");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [activePhotoSourceId, setActivePhotoSourceId] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [layers, setLayers] = useState({
    lattice: true,
    photosphere: true,
    rays: true,
    points: true,
  });
  const [rangeInput, setRangeInput] = useState("");
  const [rangeNote, setRangeNote] = useState("");
  const [rangeBasis, setRangeBasis] = useState<ManualRangeBasis>("estimated");
  const [reinforceNeighbours, setReinforceNeighbours] = useState(false);
  const [constraintLabel, setConstraintLabel] = useState("known site measure");
  const [constraintLength, setConstraintLength] = useState("1.000");
  const [constraintAngle, setConstraintAngle] = useState("20");
  const [notice, setNotice] = useState("Local workspace ready. No source image or inference has been invented.");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const photoFileRef = useRef<File | null>(null);
  const localFilesRef = useRef<Map<string, File>>(new Map());
  const activePhotoSourceIdRef = useRef<string | null>(null);
  const fingerprintJobsRef = useRef<Map<string, { file: File; token: symbol }>>(new Map());
  const verifiedFilesRef = useRef<Map<string, File>>(new Map());
  const reattachmentCandidatesRef = useRef<Set<string>>(new Set());
  const reloadRef = useRef<HTMLInputElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const matrices = observation.matrices;
  const visibleShells = useMemo(
    () => SHELLS.map((shell) => observation.shells.find((state) => state.shellIndex === shell.index)?.visible ?? shell.index === 3),
    [observation.shells],
  );
  const shellScales = useMemo(
    () => SHELLS.map((shell) => observation.shells.find((state) => state.shellIndex === shell.index)?.reachScale ?? shell.nestedScale),
    [observation.shells],
  );
  const visibleShellCount = visibleShells.filter(Boolean).length;
  const focusedShellScale = shellScales[shellIndex] ?? SHELLS[shellIndex].nestedScale;
  const focusedReachControlMax = Math.max(2, Math.ceil(focusedShellScale));
  const focusedOuterEnvelope = 2 * BASE_RADIUS * focusedShellScale;
  const selectedMatrix = matrices.find((matrix) => matrix.id === selectedMatrixId) ?? matrices[0];
  const facet = useMemo(
    () => facetDefinition(shellIndex, face, facetNumber),
    [shellIndex, face, facetNumber],
  );
  const activeCollection = observation.captureCollections.find((collection) => collection.id === activeCollectionId)
    ?? observation.captureCollections.find((collection) => collection.sourceIds.includes(activePhotoSourceId ?? ""))
    ?? null;
  const activeCollectionSources = (activeCollection?.sourceIds ?? [])
    .map((sourceId) => observation.sources.find((source) => source.id === sourceId))
    .filter((source): source is CaptureSource => Boolean(source));
  const activePhotoIndex = activeCollectionSources.findIndex((source) => source.id === activePhotoSourceId);
  const activePhotoSource = activeCollectionSources[activePhotoIndex] ?? null;
  const referenceSources = observation.sources.filter((source) =>
    source.kind === "equirectangular-video" || source.kind === "gopro-max-360",
  );
  const selectedFacetObservation = observation.facets.find((item) =>
    item.sourceId === activePhotoSourceId &&
    item.matrixId === selectedMatrix.id &&
    item.shellIndex === shellIndex &&
    item.facetNumber === facetNumber &&
    item.face === face,
  );
  const selectedEvidence = [...(selectedFacetObservation?.evidence ?? [])]
    .reverse()
    .find((item) => item.kind === "edge") ?? null;
  const selectedRange = selectedFacetObservation?.rangeMetres ?? null;
  const ranges = useMemo(() => {
    if (!activePhotoSourceId) return {};
    return observation.facets.reduce<Record<string, number>>((current, item) => {
      if (
        item.sourceId === activePhotoSourceId
        && item.face === face
        && item.rangeMetres !== null
        && Number.isFinite(item.rangeMetres)
        && item.rangeMetres > 0
      ) {
        current[rangeKey(item.matrixId, item.shellIndex, item.facetNumber)] = item.rangeMetres;
      }
      return current;
    }, {});
  }, [activePhotoSourceId, face, observation.facets]);
  const selectedRangeEvidence = [...(selectedFacetObservation?.evidence ?? [])]
    .reverse()
    .find((item) => item.kind === "manual-range");
  const selectedRangeBasis = (selectedRangeEvidence?.value.basis as ManualRangeBasis | undefined) ?? null;
  const exportSourceId = activePhotoSourceId
    ?? (observation.capture.kind === "unloaded" ? "manual-local" : observation.capture.id);
  const activeRangePointCount = observation.facets.filter((item) =>
    item.sourceId === exportSourceId
    && item.rangeMetres !== null
    && Number.isFinite(item.rangeMetres)
    && item.rangeMetres > 0,
  ).length;
  const calibration = useMemo(() => calibrationSummary(observation.calibration), [observation.calibration]);
  const patchPolygon = useMemo(
    () => facetParameterPatchPolygon(facetNumber, selectedMatrix.yawDegrees),
    [facetNumber, selectedMatrix.yawDegrees],
  );
  const selectFacet = useCallback((nextShell: number, nextFacet: number) => {
    setShellIndex(Math.max(0, Math.min(6, nextShell)));
    setFacetNumber(Math.max(1, Math.min(FACETS_PER_SHELL, nextFacet)));
  }, []);

  const choosePanel = (panel: Panel) => {
    setActivePanel(panel);
    const stackedLayout = window.matchMedia("(max-width: 1500px), (max-height: 900px)").matches;
    if (stackedLayout) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      }));
    }
  };

  const updateObservation = useCallback((mutate: (current: SpatialObservationPackage) => SpatialObservationPackage) => {
    setObservation((current) => ({ ...mutate(current), updatedAt: new Date().toISOString() }));
  }, []);

  const setShellVisible = (targetShellIndex: number, visible: boolean) => {
    updateObservation((current) => ({
      ...current,
      shells: current.shells.map((shell) => shell.shellIndex === targetShellIndex ? { ...shell, visible } : shell),
    }));
    if (!visible && shellIndex === targetShellIndex) {
      const next = observation.shells.find((shell) => shell.shellIndex !== targetShellIndex && shell.visible);
      if (next) setShellIndex(next.shellIndex);
    }
    const alreadyVisible = visibleShells[targetShellIndex];
    const nextCount = visibleShellCount + (visible === alreadyVisible ? 0 : visible ? 1 : -1);
    setNotice(visible
      ? `${SHELLS[targetShellIndex].name} added as a deliberate comparison layer. ${nextCount} of 7 visible.`
      : `${SHELLS[targetShellIndex].name} torus hidden. ${nextCount} of 7 visible.`);
  };

  const showOnlyShell = (targetShellIndex: number) => {
    updateObservation((current) => ({
      ...current,
      shells: current.shells.map((shell) => ({ ...shell, visible: shell.shellIndex === targetShellIndex })),
    }));
    setShellIndex(targetShellIndex);
    setNotice(`${SHELLS[targetShellIndex].name} is the one active measuring torus. Its 12 × 24 address grammar is unchanged.`);
  };

  const setAllShellsVisible = (visible: boolean) => {
    updateObservation((current) => ({
      ...current,
      shells: current.shells.map((shell) => ({ ...shell, visible })),
    }));
    setNotice(visible
      ? "All seven comparison layers shown intentionally. They are not seven scene solutions."
      : "All horn tori hidden. The observer-centred workspace remains available.");
  };

  const updateShellReach = (targetShellIndex: number, reachScale: number) => {
    if (!Number.isFinite(reachScale) || reachScale <= 0) return;
    updateObservation((current) => ({
      ...current,
      shells: current.shells.map((shell) =>
        shell.shellIndex === targetShellIndex ? { ...shell, reachScale } : shell,
      ),
    }));
  };

  const updateView = (change: Partial<SpatialObservationPackage["view"]>) => {
    updateObservation((current) => ({ ...current, view: { ...current.view, ...change } }));
  };

  const updateSource = useCallback((sourceId: string, change: Partial<CaptureSource>) => {
    updateObservation((current) => ({
      ...current,
      capture: current.capture.id === sourceId ? { ...current.capture, ...change } : current.capture,
      sources: current.sources.map((source) => source.id === sourceId ? { ...source, ...change } : source),
    }));
  }, [updateObservation]);

  const activatePhotoSource = useCallback((sourceId: string, collectionId?: string, reattachmentNotice?: string) => {
    const noticeLead = reattachmentNotice ? `${reattachmentNotice} ` : "";
    const savedFingerprint = observation.sources.find((source) => source.id === sourceId)?.sha256 ?? null;
    activePhotoSourceIdRef.current = sourceId;
    setActivePhotoSourceId(sourceId);
    setPhotoWarning(null);
    updateObservation((current) => {
      const source = current.sources.find((item) => item.id === sourceId && item.kind === "equirectangular-image");
      if (!source) return current;
      const owningCollectionId = collectionId
        ?? current.captureCollections.find((collection) => collection.sourceIds.includes(sourceId))?.id;
      return {
        ...current,
        capture: source,
        captureCollections: current.captureCollections.map((collection) =>
          collection.id === owningCollectionId ? { ...collection, activeSourceId: sourceId } : collection,
        ),
      };
    });

    const file = localFilesRef.current.get(sourceId) ?? null;
    setPhotoUrl(null);
    photoFileRef.current = file;
    if (!file) {
      setNotice(`${noticeLead}That source record is selected, but its local image must be reattached before its pixels can be viewed.`);
      return;
    }

    const openPixels = () => {
      if (activePhotoSourceIdRef.current !== sourceId || localFilesRef.current.get(sourceId) !== file) return;
      photoFileRef.current = file;
      const nextUrl = URL.createObjectURL(file);
      setPhotoUrl(nextUrl);
      setViewMode("zero");
      const image = new Image();
      image.onload = () => {
        const widthPixels = image.naturalWidth;
        const heightPixels = image.naturalHeight;
        const ratio = widthPixels / heightPixels;
        updateSource(sourceId, { widthPixels, heightPixels, aspectRatio: ratio });
        if (activePhotoSourceIdRef.current === sourceId) {
          setPhotoWarning(Math.abs(ratio - 2) > 0.06
            ? `This image is ${ratio.toFixed(2)}:1, not the expected 2:1 equirectangular shape.`
            : null);
        }
      };
      image.onerror = () => {
        if (activePhotoSourceIdRef.current === sourceId) {
          setPhotoWarning("This browser could not read that image's dimensions.");
        }
      };
      image.src = nextUrl;
    };

    if (verifiedFilesRef.current.get(sourceId) === file) {
      openPixels();
      setNotice(`${noticeLead}${file.name} active · local pixels ready · nothing uploaded.`);
      return;
    }
    const runningJob = fingerprintJobsRef.current.get(sourceId);
    if (runningJob?.file === file) {
      if (!savedFingerprint) openPixels();
      setNotice(savedFingerprint
        ? `${noticeLead}Verifying ${file.name} against its saved fingerprint before opening its pixels…`
        : `${noticeLead}${file.name} active · local fingerprint calculation still running.`);
      return;
    }
    const fingerprintToken = Symbol(sourceId);
    fingerprintJobsRef.current.set(sourceId, { file, token: fingerprintToken });
    if (!savedFingerprint) openPixels();
    setNotice(savedFingerprint
      ? `${noticeLead}Verifying ${file.name} against its saved fingerprint before opening its pixels…`
      : `${noticeLead}${file.name} active. Calculating this active source's fingerprint locally…`);
    void sha256(file).then((digest) => {
      const currentJob = fingerprintJobsRef.current.get(sourceId);
      if (currentJob?.token !== fingerprintToken || localFilesRef.current.get(sourceId) !== file) return;
      if (savedFingerprint && digest.toLowerCase() !== savedFingerprint.toLowerCase()) {
        localFilesRef.current.delete(sourceId);
        verifiedFilesRef.current.delete(sourceId);
        if (activePhotoSourceIdRef.current === sourceId) {
          photoFileRef.current = null;
          setPhotoUrl(null);
          setPhotoWarning("Fingerprint mismatch: this local file was not attached to the saved source record.");
          setNotice(`Fingerprint mismatch for ${file.name}. Expected ${savedFingerprint.slice(0, 12)}… but read ${digest.slice(0, 12)}…. The file was unbound and cannot supply pixel evidence.`);
        }
        return;
      }
      verifiedFilesRef.current.set(sourceId, file);
      const reattachmentCandidate = reattachmentCandidatesRef.current.has(sourceId);
      if (!savedFingerprint) updateSource(sourceId, { sha256: digest });
      if (reattachmentCandidate) {
        reattachmentCandidatesRef.current.delete(sourceId);
        updateObservation((current) => ({
          ...current,
          provenance: {
            ...current.provenance,
            transformHistory: [
              ...current.provenance.transformHistory,
              `Reattached ${file.name} to saved source ${sourceId}; ${savedFingerprint ? "saved SHA-256 verified" : "first SHA-256 recorded after file-detail match"}.`,
            ],
          },
        }));
      }
      if (activePhotoSourceIdRef.current === sourceId) {
        if (savedFingerprint) openPixels();
        setNotice(savedFingerprint
          ? `${noticeLead}Saved fingerprint verified. ${file.name} is ${reattachmentCandidate ? "reattached and " : ""}ready for local pixel evidence.`
          : reattachmentCandidate
            ? `${noticeLead}${file.name} is reattached with its first local SHA-256 fingerprint · ${digest.slice(0, 12)}…`
            : `${noticeLead}Active source ready · SHA-256 ${digest.slice(0, 12)}… · nothing uploaded.`);
      }
    }).catch(() => {
      const currentJob = fingerprintJobsRef.current.get(sourceId);
      if (currentJob?.token !== fingerprintToken || localFilesRef.current.get(sourceId) !== file) return;
      if (activePhotoSourceIdRef.current === sourceId) {
        if (savedFingerprint) {
          photoFileRef.current = null;
          setPhotoUrl(null);
          setNotice(`Could not verify ${file.name} against its saved fingerprint. Its pixels remain blocked; choose the file again to retry.`);
        } else {
          setNotice(`${noticeLead}Active source ready locally. Its fingerprint could not be calculated in this browser session.`);
        }
      }
    }).finally(() => {
      if (fingerprintJobsRef.current.get(sourceId)?.token === fingerprintToken) {
        fingerprintJobsRef.current.delete(sourceId);
      }
    });
  }, [observation.sources, updateObservation, updateSource]);

  const loadPhotoCollection = (files: File[]) => {
    const sortedFiles = files
      .filter((file) => /\.(jpe?g|png|webp)$/i.test(file.name))
      .sort((left, right) => naturalFilenameOrder.compare(left.name, right.name));
    if (!sortedFiles.length) {
      setNotice("Choose one or more JPG, PNG or WebP images.");
      return;
    }
    const reusedSourceIds = new Set<string>();
    const captures = sortedFiles.map((file) => {
      const existing = observation.sources.find((source) =>
        !reusedSourceIds.has(source.id) && captureMatchesFile(source, file),
      );
      if (existing) {
        reusedSourceIds.add(existing.id);
        return existing;
      }
      return makeCapture(file, "equirectangular-image", "ready");
    });
    reusedSourceIds.forEach((sourceId) => reattachmentCandidatesRef.current.add(sourceId));
    captures.forEach((capture, index) => localFilesRef.current.set(capture.id, sortedFiles[index]));
    const first = captures[0];
    const sourceIds = captures.map((capture) => capture.id);
    const savedCollection = observation.captureCollections.find((collection) => sourceIdsMatch(collection.sourceIds, sourceIds));
    const activeSourceId = savedCollection?.activeSourceId && sourceIds.includes(savedCollection.activeSourceId)
      ? savedCollection.activeSourceId
      : first.id;
    const collection: CaptureCollection = savedCollection ? { ...savedCollection, sourceIds } : {
      id: `collection-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      name: captures.length === 1 ? (first.name ?? "Local image") : `${first.name ?? "Local image"} + ${captures.length - 1} more`,
      sourceIds,
      activeSourceId,
      createdAt: new Date().toISOString(),
      notes: ["Natural filename order; browser-local File objects are not serialised or uploaded."],
    };
    const newCaptures = captures.filter((capture) => !reusedSourceIds.has(capture.id));
    const reattachmentNotice = reusedSourceIds.size
      ? `Matched ${reusedSourceIds.size} saved photo record${reusedSourceIds.size === 1 ? "" : "s"} by name, size and modified time${savedCollection ? "; saved collection reused." : "."}`
      : undefined;
    updateObservation((current) => {
      const currentSourceIds = new Set(current.sources.map((source) => source.id));
      const sourcesToAdd = newCaptures.filter((capture) => !currentSourceIds.has(capture.id));
      const activeCapture = current.sources.find((source) => source.id === activeSourceId)
        ?? sourcesToAdd.find((source) => source.id === activeSourceId)
        ?? first;
      const collectionExists = current.captureCollections.some((item) => item.id === collection.id);
      const history = reusedSourceIds.size
        ? `Matched ${reusedSourceIds.size} saved image source candidate${reusedSourceIds.size === 1 ? "" : "s"} by name, byte size and modified time${sourcesToAdd.length ? ` and registered ${sourcesToAdd.length} new source${sourcesToAdd.length === 1 ? "" : "s"}` : ""}${savedCollection ? " without duplicating its collection" : ""}; saved fingerprints still govern pixel reattachment.`
        : `Registered ${captures.length} browser-local image source${captures.length === 1 ? "" : "s"} in natural filename order.`;
      return {
        ...current,
        capture: activeCapture,
        sources: [...current.sources, ...sourcesToAdd],
        captureCollections: collectionExists
          ? current.captureCollections.map((item) => item.id === collection.id ? collection : item)
          : [...current.captureCollections, collection],
        provenance: {
          ...current.provenance,
          transformHistory: [...current.provenance.transformHistory, history],
        },
      };
    });
    setActiveCollectionId(collection.id);
    setActivePanel("capture");
    activatePhotoSource(activeSourceId, collection.id, reattachmentNotice);
  };

  const openCollection = (collectionId: string) => {
    const collection = observation.captureCollections.find((item) => item.id === collectionId);
    const sourceId = collection?.activeSourceId ?? collection?.sourceIds[0];
    if (!collection || !sourceId) return;
    setActiveCollectionId(collection.id);
    activatePhotoSource(sourceId, collection.id);
  };

  const stepPhoto = (direction: -1 | 1) => {
    if (!activeCollection || activePhotoIndex < 0) return;
    const source = activeCollectionSources[activePhotoIndex + direction];
    if (source) activatePhotoSource(source.id, activeCollection.id);
  };

  const registerEquirectangularVideo = async (file: File) => {
    if (!/\.mp4$/i.test(file.name) && file.type !== "video/mp4") {
      setNotice("Choose an MP4 file for the separate video fixture.");
      return;
    }
    const capture = makeCapture(file, "equirectangular-video", "ready");
    localFilesRef.current.set(capture.id, file);
    updateObservation((current) => ({
      ...current,
      sources: [...current.sources, capture],
      provenance: {
        ...current.provenance,
        notes: [...current.provenance.notes, `Reference MP4 ${file.name} registered with no relationship to the photo collection.`],
      },
    }));
    setActivePanel("capture");
    setNotice(`Inspecting ${file.name} metadata and fingerprint locally…`);
    const metadataTask = readVideoMetadata(file).then((metadata) => {
      updateSource(capture.id, { ...metadata, status: "browser-inspected" });
      return metadata;
    }).catch(() => null);
    const digestTask = sha256(file).then((value) => {
      updateSource(capture.id, { sha256: value });
      return value;
    }).catch(() => null);
    const [metadata, digest] = await Promise.all([metadataTask, digestTask]);
    setNotice(metadata
      ? `Reference MP4 inspected${digest ? ` · SHA-256 ${digest.slice(0, 12)}…` : ""}. Playback and frame evidence are not connected.`
      : `Reference MP4 registered${digest ? ` · SHA-256 ${digest.slice(0, 12)}…` : ""}, but browser metadata could not be read. Playback is not connected.`);
  };

  const registerNative360 = (file: File) => {
    if (!/\.360$/i.test(file.name)) {
      setNotice("Choose a file ending in .360 for the native GoPro MAX fixture.");
      return;
    }
    const capture = makeCapture(file, "gopro-max-360", "awaiting-local-stream-inspection");
    localFilesRef.current.set(capture.id, file);
    updateObservation((current) => ({
      ...current,
      sources: [...current.sources, capture],
      provenance: {
        ...current.provenance,
        notes: [
          ...current.provenance.notes,
          `Native source ${file.name} registered unchanged and unrelated to the photo collection. Browser decoding was not claimed.`,
        ],
      },
    }));
    setActivePanel("capture");
    setNotice("Native .360 fixture registered without transcoding or automatic association. Local codec and GPMF inspection remains a separate adapter step.");
  };

  const analyseSelectedPatch = async () => {
    const sourceUrl = photoUrl;
    const sourceFile = photoFileRef.current;
    const sourceId = activePhotoSourceId;
    if (!sourceUrl || !sourceFile || !sourceId) {
      setNotice("Load a genuine equirectangular image before asking this facet to observe an edge.");
      return;
    }
    setIsAnalysing(true);
    try {
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();
      const width = 960;
      const height = 480;
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) throw new Error("Canvas unavailable");
      sourceContext.drawImage(image, 0, 0, width, height);
      const bounds = patchBounds(patchPolygon, width, height);
      const patchWidth = Math.max(3, Math.min(width, bounds.width));
      const patchHeight = Math.max(3, Math.min(height, bounds.height));
      const patchCanvas = document.createElement("canvas");
      patchCanvas.width = patchWidth;
      patchCanvas.height = patchHeight;
      const patchContext = patchCanvas.getContext("2d", { willReadFrequently: true });
      if (!patchContext) throw new Error("Patch canvas unavailable");
      patchContext.drawImage(sourceCanvas, bounds.x, bounds.y, patchWidth, patchHeight, 0, 0, patchWidth, patchHeight);
      const result = sobelEdgeEvidence(patchContext.getImageData(0, 0, patchWidth, patchHeight));
      const evidence: EvidenceRecord = {
        id: `edge-${Date.now()}`,
        kind: "edge",
        status: "observed",
        sourceId,
        sourceProjection: "equirectangular",
        algorithm: "seam-wrapped-sobel-luminance/1.0",
        confidence: null,
        value: {
          meanStrength: Number(result.meanStrength.toFixed(6)),
          peakStrength: Number(result.peakStrength.toFixed(6)),
          sampleCount: result.sampleCount,
          seamWrapped: result.seamWrapped,
        },
        createdAt: new Date().toISOString(),
        provenance: `Pixels from ${sourceFile.name}; local deterministic calculation; no model and no upload.`,
      };
      updateObservation((current) => ({
        ...current,
        facets: replaceFacet(
          current.facets,
          { sourceId, matrixId: selectedMatrix.id, shellIndex, facetNumber, face },
          (existing) => ({ ...existing, evidence: [...existing.evidence, evidence] }),
        ),
      }));
      setNotice(`Real edge evidence recorded · mean ${result.meanStrength.toFixed(3)} · peak ${result.peakStrength.toFixed(3)}.`);
    } catch (error) {
      setNotice(`The local edge pass could not finish: ${error instanceof Error ? error.message : "unknown error"}.`);
    } finally {
      setIsAnalysing(false);
    }
  };

  const applyManualRange = () => {
    const metres = safeNumber(rangeInput);
    if (!metres) {
      setNotice("Enter a positive range in metres.");
      return;
    }
    const sourceId = activePhotoSourceId;
    if (!sourceId) {
      setNotice("Select a photo source before recording a range so the evidence cannot leak into another capture.");
      return;
    }
    const defaultRangeNote = rangeBasis === "measured"
      ? "physically measured range entered locally"
      : rangeBasis === "estimated"
        ? "human range estimate entered locally"
        : "working range hypothesis entered locally";
    const evidenceNote = rangeNote.trim() || defaultRangeNote;
    const evidence = manualRangeEvidence(
      sourceId,
      metres,
      evidenceNote,
      rangeBasis,
    );
    const keys: { number: number; amount: number; relation: string; evidence: typeof evidence }[] = [
      { number: facetNumber, amount: metres, relation: "selected", evidence },
    ];
    const edgeMean = selectedEvidence?.value.meanStrength;
    const mayReinforce = reinforceNeighbours && typeof edgeMean === "number" && edgeMean < 0.12;
    if (mayReinforce) {
      Object.entries(facet.neighbours).forEach(([direction, number]) => {
        const derivedEvidence = manualRangeEvidence(
          sourceId,
          metres,
          `Derived working hypothesis from ${facet.address} via its ${direction} neighbour; low edge strength is not a measurement.`,
          "hypothesis",
        );
        keys.push({
          number,
          amount: metres,
          relation: `low-edge ${direction} neighbour`,
          evidence: derivedEvidence,
        });
      });
    }
    updateObservation((current) => {
      let facets = current.facets;
      keys.forEach(({ number, amount, relation, evidence: rangeEvidence }) => {
        facets = replaceFacet(
          facets,
          { sourceId, matrixId: selectedMatrix.id, shellIndex, facetNumber: number, face },
          (existing) => ({
            ...existing,
            rangeMetres: amount,
            manualNote: relation === "selected" ? evidenceNote : `Derived from facet ${facetNumber}; ${relation}`,
            evidence: [...existing.evidence, rangeEvidence],
          }),
        );
      });
      return {
        ...current,
        facets,
        provenance: {
          ...current.provenance,
          transformHistory: [
            ...current.provenance.transformHistory,
            `Applied ${metres} m ${rangeBasis} range to ${selectedMatrix.id} / ${SHELLS[shellIndex].name} / facet ${facetNumber}.`,
          ],
        },
      };
    });
    setNotice(mayReinforce
      ? `Your ${rangeBasis} range placed one point for ${facet.address} and four explicitly derived hypotheses at ${metres.toFixed(2)} m. The torus stayed canonical.`
      : `Your ${rangeBasis} range placed a scene point at ${metres.toFixed(2)} m along ${facet.address}'s ray. The torus stayed canonical and no unearned neighbour smoothing was added.`);
  };

  const addConstraint = () => {
    const length = safeNumber(constraintLength);
    const angle = safeNumber(constraintAngle);
    if (!length || !angle || angle >= 180) {
      setNotice("A calibration constraint needs a positive length and an angle between 0° and 180°.");
      return;
    }
    const range = impliedRange(length, angle);
    const constraint: CalibrationConstraint = {
      id: `constraint-${Date.now()}`,
      label: constraintLabel.trim() || "known measure",
      knownLengthMetres: length,
      angularSpanDegrees: angle,
      impliedRangeMetres: range,
      source: "manual",
    };
    updateObservation((current) => ({ ...current, calibration: [...current.calibration, constraint] }));
    setNotice(`${constraint.label} implies a range of ${range.toFixed(3)} m. It remains a constraint, not hidden truth.`);
  };

  const placeConstraintOnSelectedRay = (constraint: CalibrationConstraint) => {
    const sourceId = activePhotoSourceId;
    if (!sourceId || !photoUrl) {
      setNotice("Select and verify the source photo before placing its calibrated range point.");
      return;
    }
    const evidence = knownSizeRangeEvidence(sourceId, constraint);
    updateObservation((current) => ({
      ...current,
      facets: replaceFacet(
        current.facets,
        { sourceId, matrixId: selectedMatrix.id, shellIndex, facetNumber, face },
        (existing) => ({
          ...existing,
          rangeMetres: constraint.impliedRangeMetres,
          manualNote: `Known-size estimate from ${constraint.label}`,
          evidence: [...existing.evidence, evidence],
        }),
      ),
      provenance: {
        ...current.provenance,
        transformHistory: [
          ...current.provenance.transformHistory,
          `Placed ${constraint.impliedRangeMetres.toFixed(6)} m known-size estimate from ${constraint.id} on ${selectedMatrix.id} / ${SHELLS[shellIndex].name} / facet ${facetNumber}.`,
        ],
      },
    }));
    setNotice(`${constraint.label} placed an estimated point ${constraint.impliedRangeMetres.toFixed(3)} m along ${facet.address}'s ray. Check the marked span and assumptions before treating it as metric evidence.`);
  };

  const updateMatrix = (id: string, change: Partial<MatrixState>) => {
    updateObservation((current) => ({
      ...current,
      matrices: current.matrices.map((matrix) => matrix.id === id ? { ...matrix, ...change } : matrix),
    }));
  };

  const exportObservation = () => {
    downloadText(
      `aura-observation-${observation.packageId}.json`,
      JSON.stringify(observation, null, 2),
      "application/json",
    );
    setNotice("Versioned observation package saved locally. Reloading it restores addresses, evidence, measures and transforms.");
  };

  const restoreObservation = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isObservationPackage(parsed)) throw new Error("unsupported schema or lattice version");
      const restoredCollection = parsed.captureCollections.find((collection) => collection.sourceIds.includes(parsed.capture.id))
        ?? parsed.captureCollections[0]
        ?? null;
      const restoredSourceId = restoredCollection?.activeSourceId
        ?? (parsed.capture.kind === "equirectangular-image" ? parsed.capture.id : null);
      const restoredCapture = parsed.sources.find((source) => source.id === restoredSourceId);
      setObservation(restoredCapture ? { ...parsed, capture: restoredCapture } : parsed);
      localFilesRef.current.clear();
      fingerprintJobsRef.current.clear();
      verifiedFilesRef.current.clear();
      reattachmentCandidatesRef.current.clear();
      photoFileRef.current = null;
      activePhotoSourceIdRef.current = restoredSourceId;
      setActiveCollectionId(restoredCollection?.id ?? null);
      setActivePhotoSourceId(restoredSourceId);
      setPhotoUrl(null);
      setPhotoWarning(null);
      setSelectedMatrixId(parsed.matrices[0]?.id ?? "matrix-a");
      setNotice(`Restored ${file.name}. Source imagery must be reattached because browsers do not embed local files in JSON.`);
    } catch (error) {
      setNotice(`Could not restore that package: ${error instanceof Error ? error.message : "invalid file"}.`);
    }
  };

  const bodyValue = (key: keyof SpatialObservationPackage["bodyProfile"], value: string) => {
    const next = value === "" ? null : safeNumber(value);
    updateObservation((current) => ({
      ...current,
      bodyProfile: { ...current.bodyProfile, [key]: next },
    }));
  };

  const panelContent = () => {
    if (activePanel === "enter") return (
      <>
        <p className="panel-kicker">Start with one instrument, not seven copies of the scene.</p>
        <h2>One 12 × 24 torus samples the view.</h2>
        <p>The Green horn torus begins active around the observer-centred zero point. Outside horn keeps its physical horn shape. Inside photo + rays places the observer at zero inside the 2:1 GoPro photosphere; its grid is an angular address guide, not a replacement torus. The flat map keeps equal address rectangles, while the inside guide tapers progressively towards its two honest spherical poles. The other colours appear only when you deliberately add a comparison or resonance layer.</p>
        <div className="callout"><span>First job</span> Use one torus to address search rays. Each ray passes through the guide; a separate measured, estimated or hypothetical point can then constrain a possible surface. Those points can later support surfaces, segments, objects and a provisional mesh.</div>
        <div className="shell-board">
          <div className="shell-board-head"><span>Measuring and comparison layers</span><strong>{visibleShellCount} / 7 active</strong></div>
          <div className="shell-board-actions"><button onClick={() => showOnlyShell(shellIndex)}>Use one torus</button><button onClick={() => setAllShellsVisible(true)}>Compare all</button><button onClick={() => setAllShellsVisible(false)}>Hide all</button></div>
          {SHELLS.map((shell) => {
            const visible = visibleShells[shell.index];
            return (
              <div className={`shell-row ${shell.index === shellIndex ? "focused" : ""}`} key={shell.id}>
                <button className="shell-focus" onClick={() => setShellIndex(shell.index)}><i style={{ background: shell.colour }} /><span>{shell.name}</span><small>{shellScales[shell.index].toFixed(2)}× · {shell.index === shellIndex ? "focused" : "focus"}</small></button>
                <label className="switch"><input aria-label={`Show ${shell.name} torus`} type="checkbox" checked={visible} onChange={(event) => setShellVisible(shell.index, event.target.checked)} /><span /></label>
              </div>
            );
          })}
        </div>
        <div className="reach-settings">
          <div><span>{SHELLS[shellIndex].name} torus outer envelope</span><strong>{focusedOuterEnvelope.toFixed(3)} relative units</strong></div>
          <input
            aria-label={`${SHELLS[shellIndex].name} torus outer envelope`}
            type="range"
            min="0.05"
            max={focusedReachControlMax}
            step="0.01"
            value={focusedShellScale}
            onInput={(event) => updateShellReach(shellIndex, Number(event.currentTarget.value))}
          />
          <button onClick={() => updateShellReach(shellIndex, SHELLS[shellIndex].nestedScale)}>Reset {SHELLS[shellIndex].name} reach</button>
          <small>This uniformly scales only this horn torus, preserving all 288 addresses and the horn point. Its inner hole remains zero. The envelope is a relative display reach, not a measured scene distance or an interpersonal boundary.</small>
        </div>
        <div className="motion-settings">
          <div><span>Automatic rotation</span><strong>{observation.view.autoRotate ? "On" : "Off"}</strong><label className="switch"><input aria-label="Automatic rotation" type="checkbox" checked={observation.view.autoRotate} onChange={(event) => updateView({ autoRotate: event.target.checked })} /><span /></label></div>
          <label><span>Speed · {observation.view.rotationSpeedDegreesPerSecond.toFixed(1)}° per second</span><input aria-label="Automatic rotation speed" type="range" min="0.5" max="12" step="0.5" disabled={!observation.view.autoRotate} value={observation.view.rotationSpeedDegreesPerSecond} onInput={(event) => updateView({ rotationSpeedDegreesPerSecond: Number(event.currentTarget.value) })} /></label>
          <small>Rotation is off by default. Dragging the geometry always remains available.</small>
        </div>
        <div className="meaning-pair">
          <button className={face === "interior" ? "meaning active" : "meaning"} onClick={() => setFace("interior")}>
            <small>I · interior</small><strong>Personal / private meaning</strong><span>No privacy system is connected yet.</span>
          </button>
          <button className={face === "exterior" ? "meaning active" : "meaning"} onClick={() => setFace("exterior")}>
            <small>O · exterior</small><strong>Public / permissioned meaning</strong><span>No permission system is connected yet.</span>
          </button>
        </div>
      </>
    );
    if (activePanel === "facet") return (
      <>
        <p className="panel-kicker">The facet is an address and a relationship, not merely a polygon.</p>
        <h2>{facet.address}</h2>
        <div className="address-grid">
          <div><span>row</span><strong>{facet.row + 1} / {ROWS}</strong></div>
          <div><span>column</span><strong>{facet.column + 1} / {COLS}</strong></div>
          <div><span>centre ray</span><strong>{facet.centre.id.replace(`${SHELLS[shellIndex].name} `, "")}</strong></div>
          <div><span>image centre</span><strong>{centreProjection(shellIndex, facetNumber, selectedMatrix.yawDegrees).map((v) => v.toFixed(3)).join(" · ")}</strong></div>
        </div>
        <div className="ray-ledger">
          {facet.corners.map((ray, index) => (
            <div key={`${ray.id}-${index}`}><span>{["top left", "top right", "bottom left", "bottom right"][index]}</span><strong>{ray.id.replace(`${SHELLS[shellIndex].name} `, "")}</strong><code>{formatVector(ray.direction)}</code></div>
          ))}
        </div>
        {facet.row === 0 && <div className="truth-note"><strong>The singularity has two honest views.</strong> Outside horn keeps all 24 horn vertices coincident at 0,0,0. Inside photo + rays opens the continuous approach limits into angular poles; the flattened map preserves the exact source convention where 24 distinct horn registers share the north-axis direction.</div>}
        <div className="neighbour-strip">
          {Object.entries(facet.neighbours).map(([direction, number]) => <button key={direction} onClick={() => setFacetNumber(number)}><span>{direction}</span>{number}</button>)}
        </div>
      </>
    );
    if (activePanel === "capture") return (
      <>
        <p className="panel-kicker">Local fixtures stay separate unless a person deliberately relates them.</p>
        <h2>Open a photo collection around the zero point.</h2>
        <div className="upload-pair fixture-grid">
          <label className="upload-card">
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              loadPhotoCollection(files);
            }} />
            <span>Photo collection</span><strong>Choose one or many images</strong><small>Natural filename order · only the active photo is opened and fingerprinted</small>
          </label>
          <label className="upload-card">
            <input type="file" accept="video/mp4,.mp4" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void registerEquirectangularVideo(file);
            }} />
            <span>Separate MP4 fixture</span><strong>Inspect video metadata</strong><small>Width, height, duration and SHA-256 · playback not connected</small>
          </label>
          <label className="upload-card">
            <input type="file" accept=".360" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) registerNative360(file);
            }} />
            <span>Separate native fixture</span><strong>Register one .360 file</strong><small>GoPro MAX record only · no automatic association</small>
          </label>
        </div>
        {activeCollection ? (
          <section className="collection-browser" aria-label="Active photo collection">
            <div className="collection-head">
              <div><span>Active photo collection</span><strong>{activeCollection.name}</strong></div>
              <b>{Math.max(0, activePhotoIndex + 1)} / {activeCollectionSources.length}</b>
            </div>
            {observation.captureCollections.length > 1 && (
              <label className="collection-picker"><span>Collection</span><select value={activeCollection.id} onChange={(event) => openCollection(event.target.value)}>{observation.captureCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label>
            )}
            <div className="collection-nav">
              <button disabled={activePhotoIndex <= 0} onClick={() => stepPhoto(-1)}>← Previous</button>
              <select aria-label="Choose a photo directly" value={activePhotoSourceId ?? ""} onChange={(event) => activatePhotoSource(event.target.value, activeCollection.id)}>
                {activeCollectionSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              </select>
              <button disabled={activePhotoIndex < 0 || activePhotoIndex >= activeCollectionSources.length - 1} onClick={() => stepPhoto(1)}>Next →</button>
            </div>
            {activePhotoSource && (
              <div className="active-source-summary">
                <span className="source-state ready">{statusLabel(activePhotoSource)}</span>
                <strong>{activePhotoSource.name}</strong>
                <small>
                  {activePhotoSource.bytes ? `${(activePhotoSource.bytes / 1_048_576).toFixed(2)} MB` : "size unknown"}
                  {activePhotoSource.widthPixels && activePhotoSource.heightPixels ? ` · ${activePhotoSource.widthPixels} × ${activePhotoSource.heightPixels}` : " · dimensions pending activation"}
                  {activePhotoSource.aspectRatio ? ` · ${activePhotoSource.aspectRatio.toFixed(3)}:1` : ""}
                </small>
                <code>{activePhotoSource.sha256 ? `SHA-256 ${activePhotoSource.sha256}` : "Fingerprint pending activation"}</code>
              </div>
            )}
          </section>
        ) : (
          <div className="source-card"><span className="source-state waiting">No photo collection</span><strong>Choose the local image set when you are ready.</strong><p>No files are embedded in the observation package.</p></div>
        )}
        {referenceSources.length > 0 && (
          <section className="reference-fixtures">
            <div className="reference-fixtures-head"><span>Separate reference fixtures</span><strong>{referenceSources.length}</strong></div>
            <div className="source-list compact">
              {referenceSources.map((source) => (
                <div key={source.id}>
                  <span>{source.kind === "gopro-max-360" ? "native .360 · unrelated fixture" : "MP4 · unrelated fixture"}</span>
                  <strong>{source.name}</strong>
                  <small>
                    {source.bytes ? `${(source.bytes / 1_048_576).toFixed(2)} MB` : "size unknown"}
                    {source.widthPixels && source.heightPixels ? ` · ${source.widthPixels} × ${source.heightPixels}` : ""}
                    {source.durationSeconds !== null ? ` · ${source.durationSeconds.toFixed(2)} s` : ""}
                  </small>
                  <code>{source.sha256 ? `SHA-256 ${source.sha256}` : statusLabel(source)}</code>
                </div>
              ))}
            </div>
          </section>
        )}
        {photoWarning && <div className="warning-note">{photoWarning}</div>}
        <div className="truth-note"><strong>Honest boundary:</strong> photo, MP4 and .360 records are independent fixtures. No native-to-working-view relationship is invented. MP4 playback, frame evidence, native EAC decoding and timed GPMF extraction are not connected here.</div>
      </>
    );
    if (activePanel === "evidence") return (
      <>
        <p className="panel-kicker">One torus samples. Scene understanding grows from evidence.</p>
        <h2>Range first, then surfaces, objects and mesh.</h2>
        <div className="pipeline-route" aria-label="Scene understanding order">
          <span>12 × 24 directions</span><i>→</i><span>range points</span><i>→</i><span>scene hypotheses</span>
        </div>
        <button className="primary-action" disabled={!photoUrl || isAnalysing} onClick={() => void analyseSelectedPatch()}>
          {isAnalysing ? "Reading source pixels…" : "Run local seam-aware edge pass"}
        </button>
        {selectedEvidence ? (
          <div className="evidence-card actual">
            <div><span>status</span><strong>Observed</strong></div>
            <div><span>mean edge</span><strong>{Number(selectedEvidence.value.meanStrength).toFixed(3)}</strong></div>
            <div><span>peak edge</span><strong>{Number(selectedEvidence.value.peakStrength).toFixed(3)}</strong></div>
            <div><span>confidence</span><strong>n/a · deterministic metric</strong></div>
            <p>{selectedEvidence.algorithm} · {selectedEvidence.provenance}</p>
          </div>
        ) : (
          <div className="evidence-card empty"><strong>No edge result</strong><span>The layer stays empty until real source pixels are analysed.</span></div>
        )}
        <div className="constraint-form">
          <label><span>Range basis</span><select value={rangeBasis} onChange={(event) => setRangeBasis(event.target.value as ManualRangeBasis)}><option value="measured">Physically measured</option><option value="estimated">Human estimate</option><option value="hypothesis">Working hypothesis</option></select></label>
          <label><span>Range</span><div className="input-unit"><input value={rangeInput} inputMode="decimal" placeholder="e.g. 2.4" onChange={(event) => setRangeInput(event.target.value)} /><b>m</b></div></label>
          <label><span>Evidence note</span><input value={rangeNote} placeholder="How was this range established?" onChange={(event) => setRangeNote(event.target.value)} /></label>
          <label className="check-row"><input type="checkbox" checked={reinforceNeighbours} onChange={(event) => setReinforceNeighbours(event.target.checked)} /><span>Reinforce four neighbours only when observed edge evidence is low</span></label>
          <button className="secondary-action" disabled={!activePhotoSourceId} onClick={applyManualRange}>Place range point on selected ray</button>
        </div>
        <div className="measure-readout"><span>current range point</span><strong>{formatMetres(selectedRange)}</strong><small>{selectedRange ? `${selectedRangeBasis ?? "manual"} constraint along the selected ray` : "no scene point has been placed on this ray"}</small></div>
        <div className="pipeline-head"><span>Scene-building stages</span><strong>{activeRangePointCount} range point{activeRangePointCount === 1 ? "" : "s"} for this source</strong></div>
        <div className="pipeline-list">
          {observation.scenePipeline.map((stage, index) => (
            <div className="pipeline-stage" key={stage.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{stage.label}</strong><small>{stage.notes[0]}</small></div>
              <b className={stage.status}>{stage.status.replaceAll("-", " ")}</b>
            </div>
          ))}
        </div>
        <div className="truth-note"><strong>No fake surface or mesh:</strong> the horn is an address guide and never stops a search ray. A photo supplies colour by direction, not distance. Edge strength can support a boundary, but it does not establish depth. Surface grouping, segmentation, object detection and provisional mesh generation remain empty until real local adapters produce source-scoped evidence.</div>
      </>
    );
    if (activePanel === "matrices") return (
      <>
        <p className="panel-kicker">Resolution can follow relevance without globally multiplying polygons.</p>
        <h2>Shift another matrix across a boundary.</h2>
        {matrices.map((matrix, index) => (
          <div className={`matrix-card ${selectedMatrixId === matrix.id ? "selected" : ""}`} key={matrix.id}>
            <div className="matrix-head">
              <button onClick={() => setSelectedMatrixId(matrix.id)}><span>{index === 0 ? "A" : "B"}</span><strong>{matrix.name}</strong></button>
              <label className="switch"><input aria-label={`Show ${matrix.name}`} type="checkbox" checked={matrix.visible} onChange={(event) => updateMatrix(matrix.id, { visible: event.target.checked })} /><span /></label>
            </div>
            <p>{matrix.purpose}</p>
            <div className="matrix-control">
              <div><span>rotation · {matrix.yawDegrees.toFixed(1)}°</span><span className="nudge"><button aria-label={`Decrease ${matrix.name} rotation`} onClick={() => updateMatrix(matrix.id, { yawDegrees: Math.max(-15, matrix.yawDegrees - 0.5) })}>−</button><button aria-label={`Increase ${matrix.name} rotation`} onClick={() => updateMatrix(matrix.id, { yawDegrees: Math.min(15, matrix.yawDegrees + 0.5) })}>+</button></span></div>
              <input aria-label={`${matrix.name} rotation`} type="range" min="-15" max="15" step="0.5" value={matrix.yawDegrees} onInput={(event) => updateMatrix(matrix.id, { yawDegrees: Number(event.currentTarget.value) })} />
            </div>
            <div className="matrix-control">
              <div><span>radial placement · {matrix.radialScale.toFixed(2)}×</span><span className="nudge"><button aria-label={`Decrease ${matrix.name} radial placement`} onClick={() => updateMatrix(matrix.id, { radialScale: Math.max(0.72, Number((matrix.radialScale - 0.01).toFixed(2))) })}>−</button><button aria-label={`Increase ${matrix.name} radial placement`} onClick={() => updateMatrix(matrix.id, { radialScale: Math.min(1.35, Number((matrix.radialScale + 0.01).toFixed(2))) })}>+</button></span></div>
              <input aria-label={`${matrix.name} radial placement`} type="range" min="0.72" max="1.35" step="0.01" value={matrix.radialScale} onInput={(event) => updateMatrix(matrix.id, { radialScale: Number(event.currentTarget.value) })} />
            </div>
          </div>
        ))}
        <div className="truth-note">Both matrices retain the same canonical addresses. Rotation and radial placement are explicit transforms recorded in the observation package, not new unnamed geometry.</div>
      </>
    );
    if (activePanel === "calibrate") return (
      <>
        <p className="panel-kicker">A body can be a portable calibration object, not an avatar costume.</p>
        <h2>Bring known dimensions into the scene.</h2>
        <div className="body-grid">
          {([
            ["standingHeightMetres", "standing height"],
            ["eyeHeightMetres", "eye height"],
            ["headWidthMetres", "head width"],
            ["interpupillaryDistanceMetres", "interpupillary distance"],
          ] as const).map(([key, label]) => (
            <label key={key}><span>{label}</span><div className="input-unit"><input inputMode="decimal" value={observation.bodyProfile[key] ?? ""} placeholder="—" onChange={(event) => bodyValue(key, event.target.value)} /><b>m</b></div></label>
          ))}
        </div>
        <div className="constraint-form calibration-form">
          <label><span>constraint label</span><input value={constraintLabel} onChange={(event) => setConstraintLabel(event.target.value)} /></label>
          <label><span>known length</span><div className="input-unit"><input value={constraintLength} inputMode="decimal" onChange={(event) => setConstraintLength(event.target.value)} /><b>m</b></div></label>
          <label><span>observed angular span</span><div className="input-unit"><input value={constraintAngle} inputMode="decimal" onChange={(event) => setConstraintAngle(event.target.value)} /><b>°</b></div></label>
          <button className="secondary-action" onClick={addConstraint}>Add visible scale constraint</button>
        </div>
        <div className="calibration-summary">
          <div><span>constraints used</span><strong>{calibration.count}</strong></div>
          <div><span>implied range</span><strong>{formatMetres(calibration.meanRangeMetres)}</strong></div>
          <div><span>residual disagreement</span><strong>{formatMetres(calibration.residualMetres)}</strong></div>
        </div>
        <div className="constraint-list">
          {observation.calibration.map((constraint) => <div key={constraint.id}><strong>{constraint.label}</strong><span>{constraint.knownLengthMetres.toFixed(3)} m over {constraint.angularSpanDegrees.toFixed(2)}°</span><b>{constraint.impliedRangeMetres.toFixed(3)} m</b><button disabled={!activePhotoSourceId || !photoUrl} onClick={() => placeConstraintOnSelectedRay(constraint)}>Place estimate on selected ray</button></div>)}
        </div>
      </>
    );
    return (
      <>
        <p className="panel-kicker">Export is a continuation, not a screenshot of the moment.</p>
        <h2>Carry addresses, evidence and uncertainty onward.</h2>
        <div className="export-stack">
          <button onClick={exportObservation}><span>Canonical working state</span><strong>Save observation package</strong><small>{OBSERVATION_VERSION}</small></button>
          <button onClick={() => downloadText(`aura-observed-${Date.now()}.ply`, observationToPly(observation, exportSourceId), "application/octet-stream")}><span>Open point geometry</span><strong>Export range points · PLY</strong><small>{activeRangePointCount} active-source point{activeRangePointCount === 1 ? "" : "s"} · no faces</small></button>
          <button onClick={() => downloadText(`aura-observed-${Date.now()}.obj`, observationToObj(observation, exportSourceId), "text/plain")}><span>Open point geometry</span><strong>Export range points · OBJ</strong><small>active source · positive metre constraints only · no faces</small></button>
          <button onClick={() => reloadRef.current?.click()}><span>Round trip</span><strong>Reload an observation package</strong><small>restores local working state</small></button>
          <input ref={reloadRef} type="file" accept="application/json,.json" hidden onChange={(event) => event.target.files?.[0] && void restoreObservation(event.target.files[0])} />
        </div>
        <div className="source-card export-contract">
          <span className="source-state ready">scan-pipeline adapter boundary</span>
          <strong>Point clouds and LOD geometry remain in their own registered frame.</strong>
          <p>Scan Z-up → Aura Y-up uses [x, y, z] → [x, z, −y]. Heading and observer origin stay unregistered until an explicit transform is supplied.</p>
        </div>
        <div className="truth-note"><strong>Current export truth:</strong> JSON round-trip, ASCII PLY and OBJ point output work locally. GLB/mesh round-trip and upstream CLI invocation are documented adapter work, not implied by these buttons.</div>
      </>
    );
  };

  return (
    <main className="instrument-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Aura Spatial Perception home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><b>Aura</b><small>Spatial Perception</small></span>
        </a>
        <div className="build-state"><span className="pulse" /><strong>Local instrument</strong><small>{LATTICE_VERSION}</small></div>
        <div className="local-lock"><span>⌂</span><strong>LOCAL PROCESSING</strong><small>no media upload · no ChatGPT hosting</small></div>
      </header>

      <aside className="journey-rail" aria-label="Guided learning journey">
        <div className="rail-title"><span>Journey</span><strong>Learn by touching the instrument</strong></div>
        <nav>
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              className={activePanel === panel.id ? "active" : ""}
              aria-current={activePanel === panel.id ? "step" : undefined}
              onClick={() => choosePanel(panel.id)}
            >
              <span>{panel.number}</span><div><small>{panel.eyebrow}</small><strong>{panel.label}</strong></div><i>→</i>
            </button>
          ))}
        </nav>
        <div className="rail-footer"><span>working</span><span>experimental</span><span>incomplete</span></div>
      </aside>

      <section className="stage" id="top">
        <div className="stage-toolbar">
          <div className="mode-switch" role="group" aria-label="Viewpoint and source presentation">
            <button aria-pressed={viewMode === "orbit"} className={viewMode === "orbit" ? "active" : ""} onClick={() => setViewMode("orbit")}>Outside horn</button>
            <button aria-pressed={viewMode === "zero"} className={viewMode === "zero" ? "active" : ""} onClick={() => setViewMode("zero")}>Inside photo + rays</button>
          </div>
          <div className="face-switch" role="group" aria-label="Facet face meaning">
            <button aria-pressed={face === "exterior"} className={face === "exterior" ? "active" : ""} onClick={() => setFace("exterior")}>O · exterior</button>
            <button aria-pressed={face === "interior"} className={face === "interior" ? "active" : ""} onClick={() => setFace("interior")}>I · interior</button>
          </div>
          <div className="layer-toggles" role="group" aria-label="Viewport layers">
            {(Object.keys(layers) as (keyof typeof layers)[]).map((layer) => (
              <button key={layer} aria-pressed={layers[layer]} className={layers[layer] ? "active" : ""} onClick={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))}>{layer === "rays" ? "search rays" : layer}</button>
            ))}
            <button aria-pressed={observation.view.autoRotate} className={observation.view.autoRotate ? "active" : ""} onClick={() => updateView({ autoRotate: !observation.view.autoRotate })}>auto-rotate</button>
          </div>
        </div>
        <div className="mobile-quick-controls">
          <div className="facet-jump mobile-facet-jump">
            <label htmlFor="mobile-facet-jump">Facet</label>
            <input
              id="mobile-facet-jump"
              type="number"
              min="1"
              max={FACETS_PER_SHELL}
              value={facetNumber}
              onChange={(event) => setFacetNumber(Math.max(1, Math.min(FACETS_PER_SHELL, Number(event.target.value) || 1)))}
            />
          </div>
          <div className="shell-dots mobile-shell-dots" role="group" aria-label="Torus visibility">
            {SHELLS.map((shell) => <button key={shell.id} aria-label={`${visibleShells[shell.index] ? "Hide" : "Show"} ${shell.name} torus`} aria-pressed={visibleShells[shell.index]} className={`${visibleShells[shell.index] ? "visible" : "hidden"} ${shell.index === shellIndex ? "focused" : ""}`} style={{ "--shell-colour": shell.colour } as React.CSSProperties} onClick={() => setShellVisible(shell.index, !visibleShells[shell.index])} />)}
          </div>
        </div>
        <div className="viewport-wrap">
          <AuraViewport
            shellIndex={shellIndex}
            facetNumber={facetNumber}
            face={face}
            viewMode={viewMode}
            photoUrl={photoUrl}
            matrices={matrices}
            selectedMatrixId={selectedMatrix.id}
            visibleShells={visibleShells}
            shellScales={shellScales}
            autoRotate={observation.view.autoRotate}
            rotationSpeedDegreesPerSecond={observation.view.rotationSpeedDegreesPerSecond}
            ranges={ranges}
            selectedRangeBasis={selectedRangeBasis}
            layers={layers}
            onSelect={selectFacet}
          />
          <div className="zero-readout"><span>0,0,0</span><strong>observer / rig centre</strong></div>
          <div className="selected-readout"><span style={{ background: SHELLS[shellIndex].colour }} /><small>selected</small><strong>{facet.address}</strong><code>{selectedMatrix.name}{selectedMatrix.visible ? "" : " · matrix hidden"}{visibleShells[shellIndex] ? "" : " · torus hidden"}</code></div>
          <div className={`ray-search-readout ${selectedRangeBasis ?? "open"}`}>
            <span>{viewMode === "zero" ? "inside-photo ray profile" : "scene search ray"}</span>
            <strong>{!layers.rays ? "Search rays hidden" : selectedRange ? `${selectedRangeBasis ?? "manual"} point · ${selectedRange.toFixed(2)} m` : viewMode === "zero" ? "Open direction · no depth point" : "Open ray · no range point"}</strong>
            <small>{!layers.rays ? "turn on search rays to show the direction profile" : viewMode === "zero" ? "photo supplies direction only · Outside horn shows ray length" : "continues through the horn to the display limit"}</small>
            {viewMode === "zero" && layers.rays && (
              <figure
                className={`inside-ray-profile ${selectedRangeBasis ?? "open"}`}
                aria-label={`Schematic only: observer zero, horn address crossing, open search direction${selectedRange ? `, ${selectedRangeBasis ?? "manual"} range point at ${selectedRange.toFixed(2)} metres; the point is not a confirmed surface hit` : "; no range point or surface hit"}.`}
              >
                <div className="inside-ray-profile-track" aria-hidden="true">
                  <span className="profile-line" />
                  <i className="profile-zero" />
                  <i className="profile-horn" />
                  {selectedRange ? <i className="profile-point" /> : null}
                  <i className="profile-arrow" />
                </div>
                <figcaption>
                  <span>zero</span>
                  <span>horn address</span>
                  <span>{selectedRange ? `${selectedRangeBasis ?? "manual"} point · not a hit` : "open search · no hit"}</span>
                </figcaption>
              </figure>
            )}
          </div>
          {viewMode === "zero" && visibleShellCount > 1 && <div className="zero-layer-warning"><strong>One angular guide at a time.</strong><span>The focused torus is shown here because all shell reaches share these directions. Switch to Outside horn to compare their physical envelopes.</span></div>}
          <div className="gesture-hint">{viewMode === "zero" ? "drag to look · tap a facet" : "drag to orbit · scroll to move · tap a facet"}</div>
        </div>
        <div className="sphere-strip">
          <div className="strip-head"><span>Flattened 12 × 24 address map</span><small>equal address rectangles · dashed = exact corner rays</small></div>
          <PanoramaMap
            photoUrl={photoUrl}
            photoName={observation.capture.name}
            shellIndex={shellIndex}
            facetNumber={facetNumber}
            yawDegrees={selectedMatrix.yawDegrees}
            onSelect={setFacetNumber}
          />
        </div>
      </section>

      <aside className="inspector" ref={inspectorRef}>
        <div className="inspector-scroll">
          {panelContent()}
        </div>
        <div className="notice" role="status"><span>Now</span><p>{notice}</p></div>
      </aside>

      <footer className="statusbar">
        <div><span className={`status-dot ${visibleShellCount === 1 ? "working" : "experimental"}`} /><b>Torus layers</b><small>{visibleShellCount} / 7 active · one is the starting instrument</small></div>
        <div><span className={`status-dot ${photoUrl ? "working" : "incomplete"}`} /><b>Source capture</b><small>{statusLabel(observation.capture)}</small></div>
        <div><span className={`status-dot ${selectedEvidence ? "working" : "experimental"}`} /><b>Perception</b><small>{selectedEvidence ? "edge evidence present" : "real adapters only"}</small></div>
        <div><span className={`status-dot ${selectedRange ? "working" : "experimental"}`} /><b>Scene range</b><small>{selectedRange ? `${selectedRange.toFixed(2)} m ${selectedRangeBasis ?? "manual"} point` : "awaiting range evidence"}</small></div>
        <div className="facet-jump"><label htmlFor="facet-jump">Facet</label><input id="facet-jump" type="number" min="1" max={FACETS_PER_SHELL} value={facetNumber} onChange={(event) => setFacetNumber(Math.max(1, Math.min(FACETS_PER_SHELL, Number(event.target.value) || 1)))} /></div>
        <div className="shell-dots" role="group" aria-label="Torus visibility">
          {SHELLS.map((shell) => <button key={shell.id} aria-label={`${visibleShells[shell.index] ? "Hide" : "Show"} ${shell.name} torus`} aria-pressed={visibleShells[shell.index]} className={`${visibleShells[shell.index] ? "visible" : "hidden"} ${shell.index === shellIndex ? "focused" : ""}`} style={{ "--shell-colour": shell.colour } as React.CSSProperties} onClick={() => setShellVisible(shell.index, !visibleShells[shell.index])} />)}
        </div>
      </footer>
    </main>
  );
}
