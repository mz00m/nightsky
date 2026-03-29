"use client";

interface OverheadObject {
  satid: number;
  satname: string;
  satlat: number;
  satlng: number;
  satalt: number;
}

interface OverheadData {
  bright: OverheadObject[];
  rocketBodies: OverheadObject[];
  debris: OverheadObject[];
}

export function OverheadNow({
  data,
  loading,
}: {
  data: OverheadData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-border/50 bg-surface/20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const totalBright = data.bright.length;
  const totalRocket = data.rocketBodies.length;
  const totalDebris = data.debris.length;
  const total = totalBright + totalRocket + totalDebris;

  return (
    <div className="space-y-4">
      {/* Count strip */}
      <div className="grid grid-cols-3 gap-3">
        <CountCard
          count={totalBright}
          label="Satellites"
          color="#5b8def"
        />
        <CountCard
          count={totalRocket}
          label="Rocket bodies"
          color="#f59e0b"
        />
        <CountCard
          count={totalDebris}
          label="Debris"
          color="#ef4444"
        />
      </div>

      {/* Summary */}
      <p className="text-sm text-text-secondary">
        <span className="text-text-primary font-medium">{total} objects</span>{" "}
        are passing within 70° of your zenith right now.
        {totalDebris > 0 && (
          <span className="text-text-dim">
            {" "}
            {totalDebris} tracked debris fragment{totalDebris !== 1 ? "s" : ""} — most too faint to see, but they&apos;re up there.
          </span>
        )}
      </p>

      {/* Notable objects list */}
      {data.bright.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-text-dim mb-2">
            Brightest overhead now
          </p>
          <div className="space-y-1">
            {data.bright.slice(0, 6).map((obj) => (
              <div
                key={obj.satid}
                className="flex items-center justify-between py-1.5 px-3 rounded bg-surface/20 text-sm"
              >
                <span className="text-text-secondary truncate">
                  {cleanName(obj.satname)}
                </span>
                <span className="text-text-dim text-xs font-mono ml-2">
                  {obj.satalt.toFixed(0)} km
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.rocketBodies.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-text-dim mb-2">
            Rocket bodies
          </p>
          <div className="space-y-1">
            {data.rocketBodies.slice(0, 4).map((obj) => (
              <div
                key={obj.satid}
                className="flex items-center justify-between py-1.5 px-3 rounded bg-surface/20 text-sm"
              >
                <span className="text-text-secondary truncate">
                  {cleanName(obj.satname)}
                </span>
                <span className="text-text-dim text-xs font-mono ml-2">
                  {obj.satalt.toFixed(0)} km
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.debris.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-text-dim mb-2">
            Tracked debris
          </p>
          <div className="space-y-1">
            {data.debris.slice(0, 6).map((obj) => (
              <div
                key={obj.satid}
                className="flex items-center justify-between py-1.5 px-3 rounded bg-surface/20 text-sm"
              >
                <span className="text-text-secondary truncate text-xs">
                  {cleanName(obj.satname)}
                </span>
                <span className="text-text-dim text-xs font-mono ml-2">
                  {obj.satalt.toFixed(0)} km
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CountCard({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg border border-border/50 bg-surface/20 text-center">
      <p className="text-2xl font-light text-text-primary" style={{ color }}>
        {count}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-text-dim mt-1">
        {label}
      </p>
    </div>
  );
}

function cleanName(name: string): string {
  return name
    .replace(/^STARLINK-/, "Starlink ")
    .replace(/ R\/B$/, " (booster)")
    .replace(/ DEB$/, " (fragment)")
    .replace(/^CZ-/, "Long March ")
    .replace(/^SL-/, "Soyuz stage ");
}
