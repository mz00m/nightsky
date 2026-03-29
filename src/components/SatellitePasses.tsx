"use client";

import {
  SatellitePass,
  formatPassTime,
  formatPassDate,
  formatDuration,
  getPassBrightness,
  getCategoryLabel,
  getCategoryColor,
} from "@/lib/satellites";

export function SatellitePasses({
  passes,
  loading,
  error,
}: {
  passes: SatellitePass[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg border border-border/50 bg-surface/20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-border/50 bg-surface/20">
        <p className="text-sm text-text-dim">{error}</p>
      </div>
    );
  }

  if (passes.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-border/50 bg-surface/20 text-center">
        <p className="text-text-secondary">
          No visible passes in the next 5 days
        </p>
        <p className="text-sm text-text-dim mt-1">
          Check back — orbits shift daily
        </p>
      </div>
    );
  }

  // Group by date
  const grouped = groupByDate(passes);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, datePasses]) => (
        <div key={date}>
          <p className="text-xs uppercase tracking-wider text-text-dim mb-3">
            {date}
          </p>
          <div className="space-y-2">
            {datePasses.map((pass, i) => (
              <PassCard key={`${pass.satid}-${pass.startUTC}-${i}`} pass={pass} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PassCard({ pass }: { pass: SatellitePass }) {
  const color = getCategoryColor(pass.category);
  const label = getCategoryLabel(pass.category);
  const brightness = getPassBrightness(pass.magnitude);
  const duration = formatDuration(pass.duration);

  return (
    <div className="p-4 rounded-lg border border-border/50 bg-surface/30 hover:bg-surface/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Category indicator */}
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div
            className="w-px flex-1 min-h-[2rem] opacity-30"
            style={{ backgroundColor: color }}
          />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-text-primary font-medium text-sm">
                {cleanSatName(pass.satname)}
              </h3>
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color,
                  backgroundColor: `${color}15`,
                }}
              >
                {label}
              </span>
            </div>
            <span className="text-text-primary text-sm font-mono whitespace-nowrap">
              {formatPassTime(pass.startUTC)}
            </span>
          </div>

          {/* Trajectory */}
          <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
            <span>
              {pass.startAzCompass} {pass.startEl}°
            </span>
            <svg
              width="24"
              height="8"
              viewBox="0 0 24 8"
              className="text-text-dim"
            >
              <path
                d="M0 4 C6 0, 18 0, 24 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </svg>
            <span className="text-text-primary font-medium">
              {pass.maxEl}° max
            </span>
            <svg
              width="24"
              height="8"
              viewBox="0 0 24 8"
              className="text-text-dim"
            >
              <path
                d="M0 4 C6 8, 18 8, 24 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </svg>
            <span>
              {pass.endAzCompass} {pass.endEl}°
            </span>
          </div>

          {/* Details */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
            <span>{duration} visible</span>
            {pass.magnitude !== null && (
              <span>
                mag {pass.magnitude.toFixed(1)} · {brightness}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function cleanSatName(name: string): string {
  // Clean up satellite names like "STARLINK-1234" -> "Starlink 1234"
  return name
    .replace(/^STARLINK-/, "Starlink ")
    .replace(/^ISS \(ZARYA\)/, "ISS")
    .replace(/^CSS \(TIANHE\)/, "Tiangong")
    .replace(/ R\/B$/, "")
    .replace(/ DEB$/, "");
}

function groupByDate(
  passes: SatellitePass[]
): Record<string, SatellitePass[]> {
  const groups: Record<string, SatellitePass[]> = {};
  for (const pass of passes) {
    const dateKey = formatPassDate(pass.startUTC);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(pass);
  }
  return groups;
}
