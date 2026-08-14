"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  BASE_RADIUS,
  FACETS_PER_SHELL,
  SHELLS,
  angularFacetParameterCorners,
  angularGuideDirection,
  displaySearchRadius,
  facetDefinition,
  rotateY,
  scale,
  torusPoint,
  type Face,
  type Vec3,
} from "@/lib/aura-geometry";
import type { MatrixState } from "@/lib/observation";
import type { ManualRangeBasis } from "@/lib/evidence";
import { EQUIRECTANGULAR_PHOTOSPHERE_YAW_RADIANS } from "@/lib/projection";
import {
  createViewportCameraMemory,
  nextOrbitDistanceRatio,
  orbitDistance,
} from "@/lib/viewport-camera";

export type ViewMode = "orbit" | "zero";

type Layers = {
  lattice: boolean;
  photosphere: boolean;
  rays: boolean;
  points: boolean;
};

type Props = {
  shellIndex: number;
  facetNumber: number;
  face: Face;
  viewMode: ViewMode;
  photoUrl: string | null;
  matrices: MatrixState[];
  selectedMatrixId: string;
  visibleShells: readonly boolean[];
  shellScales: readonly number[];
  autoRotate: boolean;
  rotationSpeedDegreesPerSecond: number;
  ranges: Record<string, number>;
  selectedRangeBasis: ManualRangeBasis | null;
  layers: Layers;
  onSelect: (shellIndex: number, facetNumber: number) => void;
};

function rangeKey(matrixId: string, shellIndex: number, facetNumber: number): string {
  return `${matrixId}:${shellIndex}:${facetNumber}`;
}

function independentShellScale(shellScales: readonly number[], shellIndex: number): number {
  const configuredScale = shellScales[shellIndex];
  return Number.isFinite(configuredScale) ? configuredScale : SHELLS[shellIndex].nestedScale;
}

function canonicalScenePosition(
  matrix: MatrixState,
  shellIndex: number,
  u: number,
  v: number,
  shellScales: readonly number[],
): Vec3 {
  const point = scale(
    torusPoint(u, v),
    independentShellScale(shellScales, shellIndex) * matrix.radialScale,
  );
  return rotateY(point, matrix.yawDegrees);
}

function angularGuidePosition(
  matrix: MatrixState,
  u: number,
  v: number,
  radius: number,
): Vec3 {
  return rotateY(scale(angularGuideDirection(u, v), radius), matrix.yawDegrees);
}

function displayCorners(
  matrix: MatrixState,
  shellIndex: number,
  face: Face,
  facetNumber: number,
  shellScales: readonly number[],
  viewMode: ViewMode,
  angularRadius: number,
): Vec3[] {
  if (viewMode === "zero") {
    return angularFacetParameterCorners(facetNumber).map(([u, v]) =>
      angularGuidePosition(matrix, u, v, angularRadius),
    );
  }
  const [topLeft, topRight, bottomLeft, bottomRight] = facetDefinition(
    shellIndex,
    face,
    facetNumber,
  ).corners;
  return [topLeft, topRight, bottomRight, bottomLeft].map((ray) =>
    canonicalScenePosition(matrix, shellIndex, ray.u, ray.v, shellScales),
  );
}

function geometryForShell(
  matrix: MatrixState,
  shellIndex: number,
  face: Face,
  shellScales: readonly number[],
  viewMode: ViewMode,
  angularRadius: number,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  const wire: number[] = [];
  for (let number = 1; number <= FACETS_PER_SHELL; number += 1) {
    const corners = displayCorners(
      matrix,
      shellIndex,
      face,
      number,
      shellScales,
      viewMode,
      angularRadius,
    );
    const base = positions.length / 3;
    corners.forEach((point) => positions.push(point[0], point[1], point[2]));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;
    edgePairs.forEach(([a, b]) => {
      wire.push(...corners[a], ...corners[b]);
    });
  }
  const meshGeometry = new THREE.BufferGeometry();
  meshGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  meshGeometry.setIndex(indices);
  meshGeometry.computeVertexNormals();
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
  return { meshGeometry, wireGeometry };
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else mesh.material?.dispose?.();
  });
}

export function AuraViewport({
  shellIndex,
  facetNumber,
  face,
  viewMode,
  photoUrl,
  matrices,
  selectedMatrixId,
  visibleShells,
  shellScales,
  autoRotate,
  rotationSpeedDegreesPerSecond,
  ranges,
  selectedRangeBasis,
  layers,
  onSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cameraMemoryRef = useRef(createViewportCameraMemory());
  const autoRotationSettingsRef = useRef({
    enabled: autoRotate,
    speedDegreesPerSecond: rotationSpeedDegreesPerSecond,
  });
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    autoRotationSettingsRef.current = {
      enabled: autoRotate,
      speedDegreesPerSecond: rotationSpeedDegreesPerSecond,
    };
  }, [autoRotate, rotationSpeedDegreesPerSecond]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(face === "interior" ? 0x090711 : 0x071012, 1);
    renderer.domElement.setAttribute("aria-label", "Interactive observer-centred Aura lattice");
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const maximumRange = Math.max(0, ...Object.values(ranges).filter((range) => range > 0));
    const maximumShellReach = Math.max(
      0,
      ...matrices
        .filter((matrix) => matrix.visible)
        .flatMap((matrix) =>
          SHELLS
            .filter((shell) => visibleShells[shell.index])
            .map((shell) =>
              2 * BASE_RADIUS
              * Math.abs(independentShellScale(shellScales, shell.index) * matrix.radialScale),
            ),
        ),
    );
    const searchRadius = displaySearchRadius(maximumShellReach, maximumRange);
    const angularGuideRadius = searchRadius * 0.72;
    const photoRadius = searchRadius * 1.04;
    const camera = new THREE.PerspectiveCamera(48, 1, 0.01, Math.max(200, photoRadius * 12));
    const root = new THREE.Group();
    const cameraMemory = cameraMemoryRef.current;
    root.rotation.y = viewMode === "orbit" ? cameraMemory.orbit.rootYaw : 0;
    scene.add(root);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 7, 8);
    scene.add(key);

    const pickMeshes: THREE.Mesh[] = [];
    const selectedMatrix = matrices.find((matrix) => matrix.id === selectedMatrixId)
      ?? matrices[0];

    const displayedMatrices = viewMode === "zero"
      ? (selectedMatrix?.visible ? [selectedMatrix] : [])
      : matrices.filter((matrix) => matrix.visible);
    const displayedShells = viewMode === "zero"
      ? SHELLS.filter((shell) => shell.index === shellIndex && visibleShells[shell.index])
      : SHELLS.filter((shell) => visibleShells[shell.index]);

    displayedMatrices.forEach((matrix, matrixIndex) => {
      const matrixGroup = new THREE.Group();
      matrixGroup.userData.matrixId = matrix.id;
      root.add(matrixGroup);
      displayedShells.forEach((shell) => {
        const { meshGeometry, wireGeometry } = geometryForShell(
          matrix,
          shell.index,
          face,
          shellScales,
          viewMode,
          angularGuideRadius,
        );
        const meshMaterial = new THREE.MeshBasicMaterial({
          color: shell.colour,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: viewMode === "zero" ? 0 : (shell.index === shellIndex ? 0.055 : 0.012),
          depthWrite: false,
          colorWrite: viewMode !== "zero",
        });
        const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
        mesh.userData = { shellIndex: shell.index, matrixId: matrix.id };
        mesh.visible = layers.lattice;
        matrixGroup.add(mesh);
        if (viewMode === "orbit" || (matrix.id === selectedMatrix.id && shell.index === shellIndex)) {
          pickMeshes.push(mesh);
        }

        const line = new THREE.LineSegments(
          wireGeometry,
          new THREE.LineBasicMaterial({
            color: shell.colour,
            transparent: true,
            opacity: matrixIndex === 0 ? (shell.index === shellIndex ? 0.86 : 0.28) : 0.46,
            depthTest: viewMode !== "zero",
          }),
        );
        line.renderOrder = viewMode === "zero" ? 10 : 0;
        line.visible = layers.lattice;
        matrixGroup.add(line);
      });
    });

    if (viewMode === "orbit" && layers.points && visibleShells[shellIndex] && selectedMatrix?.visible) {
      const points: number[] = [];
      const matrix = selectedMatrix;
      for (let number = 1; number <= FACETS_PER_SHELL; number += 1) {
        const facet = facetDefinition(shellIndex, face, number);
        const measured = ranges[rangeKey(matrix.id, shellIndex, number)];
        if (measured > 0) {
          const position = rotateY(scale(facet.centre.direction, measured), matrix.yawDegrees);
          points.push(...position);
        }
      }
      if (points.length > 0) {
        const pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
        root.add(new THREE.Points(
          pointGeometry,
          new THREE.PointsMaterial({ color: SHELLS[shellIndex].colour, size: 0.055, sizeAttenuation: true }),
        ));
      }
    }

    const selected = facetDefinition(shellIndex, face, facetNumber);
    let measuredMarker: THREE.Mesh | null = null;
    if (selectedMatrix?.visible && visibleShells[shellIndex]) {
      const selectedCorners = displayCorners(
        selectedMatrix,
        shellIndex,
        face,
        facetNumber,
        shellScales,
        viewMode,
        angularGuideRadius,
      );
      const selectedLines: number[] = [];
      [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([a, b]) => {
        selectedLines.push(...selectedCorners[a], ...selectedCorners[b]);
      });
      const selectedGeometry = new THREE.BufferGeometry();
      selectedGeometry.setAttribute("position", new THREE.Float32BufferAttribute(selectedLines, 3));
      const selectedOutline = new THREE.LineSegments(
        selectedGeometry,
        new THREE.LineBasicMaterial({
          color: 0xf8f3dd,
          linewidth: 2,
          depthTest: viewMode !== "zero",
        }),
      );
      selectedOutline.renderOrder = viewMode === "zero" ? 20 : 1;
      root.add(selectedOutline);

      const selectedMeasuredRange = ranges[rangeKey(selectedMatrix.id, shellIndex, facetNumber)];
      const rangeColour = selectedRangeBasis === "measured"
        ? 0x7fc9af
        : selectedRangeBasis === "hypothesis"
          ? 0xa894df
          : 0xe9cf86;
      if (viewMode === "orbit" && layers.points && selectedMeasuredRange > 0) {
        const measuredPoint = rotateY(
          scale(selected.centre.direction, selectedMeasuredRange),
          selectedMatrix.yawDegrees,
        );
        measuredMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 20, 14),
          new THREE.MeshBasicMaterial({
            color: rangeColour,
            transparent: true,
            opacity: 0.96,
            wireframe: selectedRangeBasis !== "measured",
            depthTest: true,
          }),
        );
        measuredMarker.position.set(...measuredPoint);
        measuredMarker.renderOrder = 2;
        root.add(measuredMarker);
      }

      if (layers.rays && viewMode === "zero") {
        const reticlePoint = angularGuidePosition(
          selectedMatrix,
          selected.centre.u,
          selected.centre.v,
          angularGuideRadius * 1.002,
        );
        const reticle = new THREE.Mesh(
          new THREE.RingGeometry(
            angularGuideRadius * 0.014,
            angularGuideRadius * 0.024,
            32,
          ),
          new THREE.MeshBasicMaterial({
            color: selectedMeasuredRange > 0 ? rangeColour : 0xf8f3dd,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.96,
            depthTest: false,
            depthWrite: false,
          }),
        );
        reticle.position.set(...reticlePoint);
        reticle.lookAt(0, 0, 0);
        reticle.renderOrder = 35;
        root.add(reticle);
      }

      if (layers.rays && viewMode === "orbit") {
        const addDashedSegments = (
          positions: number[],
          colour: number,
          opacity: number,
          dashSize: number,
          gapSize: number,
        ) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
          const line = new THREE.LineSegments(
            geometry,
            new THREE.LineDashedMaterial({
              color: colour,
              dashSize,
              gapSize,
              transparent: true,
              opacity,
              depthTest: false,
            }),
          );
          line.computeLineDistances();
          line.renderOrder = 30;
          root.add(line);
        };

        const cornerPositions: number[] = [];
        selected.corners.forEach((ray) => {
          const direction = rotateY(ray.direction, selectedMatrix.yawDegrees);
          const end = scale(direction, searchRadius);
          cornerPositions.push(0, 0, 0, ...end);
        });
        addDashedSegments(
          cornerPositions,
          0xf8f3dd,
          0.25,
          searchRadius * 0.035,
          searchRadius * 0.024,
        );

        const centreDirection = rotateY(selected.centre.direction, selectedMatrix.yawDegrees);
        const searchEnd = scale(centreDirection, searchRadius);
        const evidenceEnd = selectedMeasuredRange > 0
          ? scale(centreDirection, selectedMeasuredRange)
          : [0, 0, 0] as Vec3;
        const primaryEnd = selectedMeasuredRange > 0 ? evidenceEnd : searchEnd;
        if (selectedMeasuredRange > 0 && selectedRangeBasis === "measured") {
          const evidenceGeometry = new THREE.BufferGeometry();
          evidenceGeometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute([0, 0, 0, ...evidenceEnd], 3),
          );
          const evidenceLine = new THREE.Line(
            evidenceGeometry,
            new THREE.LineBasicMaterial({ color: rangeColour, transparent: true, opacity: 0.92, depthTest: false }),
          );
          evidenceLine.renderOrder = 31;
          root.add(evidenceLine);
        } else {
          addDashedSegments(
            [0, 0, 0, ...primaryEnd],
            selectedMeasuredRange > 0 ? rangeColour : 0xf8f3dd,
            selectedMeasuredRange > 0 ? 0.9 : 0.68,
            searchRadius * 0.045,
            searchRadius * 0.022,
          );
        }
        if (selectedMeasuredRange > 0) {
          addDashedSegments(
            [...evidenceEnd, ...searchEnd],
            0xf8f3dd,
            0.42,
            searchRadius * 0.035,
            searchRadius * 0.028,
          );
        }

        const searchLimitMarker = new THREE.Mesh(
          new THREE.SphereGeometry(searchRadius * 0.018, 14, 10),
          new THREE.MeshBasicMaterial({ color: 0xf8f3dd, wireframe: true, transparent: true, opacity: 0.72, depthTest: false }),
        );
        searchLimitMarker.position.set(...searchEnd);
        searchLimitMarker.renderOrder = 32;
        root.add(searchLimitMarker);
      }
    }

    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    origin.visible = viewMode === "orbit";
    root.add(origin);

    let photoTexture: THREE.Texture | null = null;
    if (photoUrl && layers.photosphere) {
      photoTexture = new THREE.TextureLoader().load(photoUrl);
      photoTexture.colorSpace = THREE.SRGBColorSpace;
      const photoGeometry = new THREE.SphereGeometry(photoRadius, 72, 36)
        .rotateY(EQUIRECTANGULAR_PHOTOSPHERE_YAW_RADIANS);
      const sphere = new THREE.Mesh(
        photoGeometry,
        new THREE.MeshBasicMaterial({
          map: photoTexture,
          side: viewMode === "zero" ? THREE.BackSide : THREE.DoubleSide,
          transparent: viewMode === "orbit",
          opacity: viewMode === "orbit" ? 0.1 : 1,
          depthWrite: viewMode === "zero",
        }),
      );
      sphere.renderOrder = -10;
      scene.add(sphere);
    }

    const applyCamera = () => {
      if (viewMode === "zero") {
        camera.position.set(0, 0, 0);
        camera.rotation.order = "YXZ";
        camera.rotation.y = cameraMemory.inside.yaw;
        camera.rotation.x = cameraMemory.inside.pitch;
      } else {
        const distance = orbitDistance(searchRadius, cameraMemory.orbit.distanceRatio);
        camera.position.set(
          distance * Math.sin(cameraMemory.orbit.phi) * Math.sin(cameraMemory.orbit.theta),
          distance * Math.cos(cameraMemory.orbit.phi),
          distance * Math.sin(cameraMemory.orbit.phi) * Math.cos(cameraMemory.orbit.theta),
        );
        camera.lookAt(0, 0, 0);
      }
    };
    applyCamera();

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let pointer: { x: number; y: number; moved: boolean } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY, moved: false };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointer) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) > 2) pointer.moved = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (viewMode === "zero") {
        cameraMemory.inside.yaw -= dx * 0.0045;
        cameraMemory.inside.pitch = Math.max(
          -Math.PI / 2 + 0.04,
          Math.min(Math.PI / 2 - 0.04, cameraMemory.inside.pitch - dy * 0.0045),
        );
      } else {
        cameraMemory.orbit.theta -= dx * 0.005;
        cameraMemory.orbit.phi = Math.max(
          0.08,
          Math.min(Math.PI - 0.08, cameraMemory.orbit.phi - dy * 0.005),
        );
      }
      applyCamera();
    };
    const raycaster = new THREE.Raycaster();
    const onPointerUp = (event: PointerEvent) => {
      if (pointer && !pointer.moved) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObjects(pickMeshes, false)[0];
        if (hit && hit.faceIndex != null) {
          const hitFacet = Math.floor(hit.faceIndex / 2) + 1;
          onSelectRef.current(hit.object.userData.shellIndex as number, hitFacet);
        }
      }
      pointer = null;
    };
    const onWheel = (event: WheelEvent) => {
      if (viewMode === "zero" || window.matchMedia("(max-width: 700px), (pointer: coarse)").matches) return;
      event.preventDefault();
      cameraMemory.orbit.distanceRatio = nextOrbitDistanceRatio(
        cameraMemory.orbit.distanceRatio,
        event.deltaY,
        searchRadius,
      );
      applyCamera();
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    let frame = 0;
    let previousTime = performance.now();
    const animate = (time = 0) => {
      const deltaSeconds = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      if (autoRotationSettingsRef.current.enabled && viewMode === "orbit") {
        const nextRootYaw = root.rotation.y
          + THREE.MathUtils.degToRad(autoRotationSettingsRef.current.speedDegreesPerSecond)
          * deltaSeconds;
        root.rotation.y = THREE.MathUtils.euclideanModulo(nextRootYaw + Math.PI, Math.PI * 2)
          - Math.PI;
        cameraMemory.orbit.rootYaw = root.rotation.y;
      }
      if (measuredMarker) {
        const pulse = 1 + Math.sin(time * 0.006) * 0.16;
        measuredMarker.scale.setScalar(pulse);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      disposeObject(scene);
      photoTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [shellIndex, facetNumber, face, viewMode, photoUrl, matrices, selectedMatrixId, visibleShells, shellScales, ranges, selectedRangeBasis, layers]);

  return <div className="aura-viewport" ref={hostRef} data-testid="aura-viewport" />;
}
