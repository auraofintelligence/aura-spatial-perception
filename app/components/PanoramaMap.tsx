"use client";

import { useEffect, useRef } from "react";
import { COLS, ROWS, facetDefinition } from "@/lib/aura-geometry";
import {
  centreProjection,
  facetFromEquirectangular,
  facetParameterPatchPolygon,
  facetProjectionPolygon,
  seamCopies,
  type UV,
} from "@/lib/projection";

type Props = {
  photoUrl: string | null;
  photoName: string | null;
  shellIndex: number;
  facetNumber: number;
  yawDegrees: number;
  onSelect: (facetNumber: number) => void;
};

function drawPolygon(
  context: CanvasRenderingContext2D,
  polygon: readonly UV[],
  width: number,
  height: number,
) {
  if (!polygon.length) return;
  context.beginPath();
  polygon.forEach(([u, v], index) => {
    const x = u * width;
    const y = v * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function drawReferenceGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#18242b");
  gradient.addColorStop(0.48, "#10202a");
  gradient.addColorStop(1, "#24172d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(218,231,225,.12)";
  context.lineWidth = 1;
  for (let column = 0; column <= COLS; column += 1) {
    const x = (column / COLS) * width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let row = 0; row <= ROWS; row += 1) {
    const y = (row / ROWS) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.fillStyle = "rgba(232,241,237,.72)";
  context.font = `${Math.max(11, Math.floor(width / 82))}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.fillText("LOCAL PROJECTION GRID — LOAD A GENUINE 2:1 EQUIRECTANGULAR IMAGE", width / 2, height / 2);
}

export function PanoramaMap({
  photoUrl,
  photoName,
  shellIndex,
  facetNumber,
  yawDegrees,
  onSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let image: HTMLImageElement | null = null;
    let disposed = false;

    const render = () => {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      if (image?.complete && image.naturalWidth) {
        context.drawImage(image, 0, 0, width, height);
        context.fillStyle = "rgba(3,8,10,.1)";
        context.fillRect(0, 0, width, height);
      } else {
        drawReferenceGrid(context, width, height);
      }

      context.strokeStyle = "rgba(238,246,241,.2)";
      context.lineWidth = 1;
      for (let column = 0; column <= COLS; column += 1) {
        const x = (column / COLS) * width;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let row = 0; row <= ROWS; row += 1) {
        const y = (row / ROWS) * height;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const patch = facetParameterPatchPolygon(facetNumber, yawDegrees);
      seamCopies(patch).forEach((copy) => {
        drawPolygon(context, copy, width, height);
        context.fillStyle = "rgba(237,209,132,.2)";
        context.fill();
        context.strokeStyle = "#f2d78b";
        context.lineWidth = 2.5;
        context.stroke();
      });

      const exact = facetProjectionPolygon(shellIndex, facetNumber, yawDegrees);
      seamCopies(exact).forEach((copy) => {
        context.save();
        context.setLineDash([5, 4]);
        drawPolygon(context, copy, width, height);
        context.strokeStyle = "rgba(255,255,255,.8)";
        context.lineWidth = 1.4;
        context.stroke();
        context.restore();
      });

      exact.forEach(([u, v]) => {
        context.beginPath();
        context.arc(u * width, v * height, 3.4, 0, Math.PI * 2);
        context.fillStyle = "#f8f3dd";
        context.fill();
      });
      const centre = centreProjection(shellIndex, facetNumber, yawDegrees);
      context.beginPath();
      context.arc(centre[0] * width, centre[1] * height, 5, 0, Math.PI * 2);
      context.fillStyle = "#0b1115";
      context.fill();
      context.strokeStyle = "#f2d78b";
      context.lineWidth = 2;
      context.stroke();

      context.fillStyle = "rgba(5,10,13,.78)";
      context.fillRect(10, 10, Math.min(width - 20, 300), 27);
      context.fillStyle = "#f3efe2";
      context.font = "12px ui-monospace, monospace";
      context.textAlign = "left";
      context.fillText(photoName ? `SOURCE · ${photoName}` : "SOURCE · no capture loaded", 20, 28);
    };

    if (photoUrl) {
      image = new Image();
      image.onload = render;
      image.src = photoUrl;
    }
    const observer = new ResizeObserver(render);
    observer.observe(host);
    render();
    return () => {
      disposed = true;
      observer.disconnect();
      if (image) image.onload = null;
    };
  }, [photoUrl, photoName, shellIndex, facetNumber, yawDegrees]);

  const selectAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    onSelect(facetFromEquirectangular(u, v, yawDegrees));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const facet = facetDefinition(shellIndex, "exterior", facetNumber);
    const target = event.key === "ArrowUp" ? facet.neighbours.north
      : event.key === "ArrowRight" ? facet.neighbours.east
      : event.key === "ArrowDown" ? facet.neighbours.south
      : event.key === "ArrowLeft" ? facet.neighbours.west
      : null;
    if (target) {
      event.preventDefault();
      onSelect(target);
    }
  };

  return (
    <div className="panorama-map" ref={hostRef}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={`Flattened equirectangular facet map. Selected facet ${facetNumber}. Use arrow keys to move.`}
        onClick={(event) => selectAt(event.clientX, event.clientY)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
