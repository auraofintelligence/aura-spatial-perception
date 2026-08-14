import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpatialInstrument } from "@/app/components/SpatialInstrument";
import "@/app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Aura instrument root was not found.");

createRoot(root).render(
  <StrictMode>
    <SpatialInstrument />
  </StrictMode>,
);
