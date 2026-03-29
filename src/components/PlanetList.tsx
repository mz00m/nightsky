"use client";

import { PlanetData } from "@/lib/types";

export function PlanetList({
  planets,
  bortleClass,
}: {
  planets: PlanetData[];
  bortleClass: number;
}) {
  const visiblePlanets = planets.filter(
    (p) => p.isVisible && p.minBortleToSee >= bortleClass
  );
  const notVisible = planets.filter(
    (p) => !p.isVisible || p.minBortleToSee < bortleClass
  );

  if (visiblePlanets.length === 0) {
    return (
      <div className="text-text-dim text-sm">
        No bright planets are well-positioned for viewing tonight.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visiblePlanets.map((planet) => (
        <div
          key={planet.name}
          className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-surface/30"
        >
          <div
            className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: planet.color }}
          />
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <h4 className="text-text-primary font-medium">{planet.name}</h4>
              {planet.bestViewingTime && (
                <span className="text-xs text-text-dim">
                  {planet.bestViewingTime}
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-0.5">
              {planet.brightness}
            </p>
            <p className="text-xs text-text-dim mt-1">
              Look {planet.direction}
            </p>
          </div>
        </div>
      ))}

      {notVisible.length > 0 && (
        <p className="text-xs text-text-dim mt-2">
          Not visible tonight:{" "}
          {notVisible.map((p) => p.name).join(", ")}
        </p>
      )}
    </div>
  );
}
