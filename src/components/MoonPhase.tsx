"use client";

import { MoonData } from "@/lib/types";

export function MoonPhase({ moon }: { moon: MoonData }) {
  // Render a visual moon phase using CSS
  // Phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
  const phase = moon.phase;

  // Calculate the shadow overlay
  // 0-0.5: right side illuminated (waxing), 0.5-1: left side illuminated (waning)
  const isWaxing = phase < 0.5;
  const illuminationAngle = isWaxing ? phase * 2 : (1 - phase) * 2; // 0-1 within each half

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-24 h-24">
        {/* Moon body */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 40% 35%, #f5f0e8 0%, #e8e0d0 40%, #d4cabb 70%, #bfb5a3 100%)",
            boxShadow: "0 0 30px rgba(245, 240, 232, 0.15)",
          }}
        />
        {/* Shadow overlay for phase */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ clipPath: getMoonClipPath(phase) }}
        >
          <div
            className="w-full h-full rounded-full"
            style={{ backgroundColor: "#0a0e1a" }}
          />
        </div>
        {/* Subtle crater texture */}
        <div
          className="absolute rounded-full opacity-10"
          style={{
            width: "8px",
            height: "8px",
            top: "30%",
            left: "35%",
            background: "radial-gradient(circle, #8a7a65, transparent)",
          }}
        />
        <div
          className="absolute rounded-full opacity-10"
          style={{
            width: "12px",
            height: "12px",
            top: "55%",
            left: "55%",
            background: "radial-gradient(circle, #8a7a65, transparent)",
          }}
        />
        <div
          className="absolute rounded-full opacity-8"
          style={{
            width: "6px",
            height: "6px",
            top: "25%",
            left: "60%",
            background: "radial-gradient(circle, #8a7a65, transparent)",
          }}
        />
      </div>
      <div className="text-center">
        <p
          className="text-lg font-medium text-text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {moon.phaseName}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          {moon.illumination}% illuminated
        </p>
      </div>
    </div>
  );
}

function getMoonClipPath(phase: number): string {
  // Create a clip path that reveals the shadowed portion of the moon
  // phase 0 = fully shadowed (new moon) -> full circle clip
  // phase 0.25 = right half lit -> left half clip
  // phase 0.5 = fully lit (full moon) -> no clip
  // phase 0.75 = left half lit -> right half clip
  // phase 1 = fully shadowed again

  if (phase < 0.01 || phase > 0.99) {
    // New moon - full shadow
    return "circle(50% at 50% 50%)";
  }
  if (phase > 0.49 && phase < 0.51) {
    // Full moon - no shadow
    return "circle(0% at 50% 50%)";
  }

  if (phase < 0.25) {
    // New -> First Quarter: shadow covers most, receding from right
    const t = phase / 0.25;
    const x = 50 + t * 50;
    return `polygon(0% 0%, ${100 - t * 50}% 0%, ${100 - t * 50}% 100%, 0% 100%)`;
  } else if (phase < 0.5) {
    // First Quarter -> Full: shadow on left side, shrinking
    const t = (phase - 0.25) / 0.25;
    const w = 50 - t * 50;
    return `polygon(0% 0%, ${w}% 0%, ${w}% 100%, 0% 100%)`;
  } else if (phase < 0.75) {
    // Full -> Last Quarter: shadow on right, growing
    const t = (phase - 0.5) / 0.25;
    const x = 100 - t * 50;
    return `polygon(${x}% 0%, 100% 0%, 100% 100%, ${x}% 100%)`;
  } else {
    // Last Quarter -> New: shadow from right, growing
    const t = (phase - 0.75) / 0.25;
    const x = 50 - t * 50;
    return `polygon(${x}% 0%, 100% 0%, 100% 100%, ${x}% 100%)`;
  }
}
