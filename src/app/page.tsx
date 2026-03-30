"use client";

import { useEffect, useState, useCallback } from "react";
import { SkyData, Location } from "@/lib/types";
import { SatellitePass } from "@/lib/satellites";
import { calculateSkyData } from "@/lib/astronomy";
import { StarField } from "@/components/StarField";
import { MoonPhase } from "@/components/MoonPhase";
import { BortleScale } from "@/components/BortleScale";
import { SkyHighlights } from "@/components/SkyHighlights";
import { PlanetList } from "@/components/PlanetList";
import { SatellitePasses } from "@/components/SatellitePasses";
import { OverheadNow } from "@/components/OverheadNow";
import { LocationSearch } from "@/components/LocationSearch";

interface OverheadData {
  bright: { satid: number; satname: string; satlat: number; satlng: number; satalt: number }[];
  rocketBodies: { satid: number; satname: string; satlat: number; satlng: number; satalt: number }[];
  debris: { satid: number; satname: string; satlat: number; satlng: number; satalt: number }[];
}

export default function Home() {
  const [skyData, setSkyData] = useState<SkyData | null>(null);
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [overhead, setOverhead] = useState<OverheadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [satLoading, setSatLoading] = useState(true);
  const [overheadLoading, setOverheadLoading] = useState(true);
  const [satError, setSatError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const loadSkyData = useCallback((location: Location) => {
    const data = calculateSkyData(location, new Date());
    setSkyData(data);
    setLoading(false);

    // Fetch satellite passes
    fetch(
      `/api/satellites?lat=${location.latitude}&lng=${location.longitude}&alt=0&mode=passes`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error && data.passes?.length === 0) {
          setSatError("Satellite tracking is temporarily unavailable.");
        } else {
          setPasses(data.passes || []);
        }
        setSatLoading(false);
      })
      .catch(() => {
        setSatError("Could not load satellite data");
        setSatLoading(false);
      });

    // Fetch what's overhead now
    fetch(
      `/api/satellites?lat=${location.latitude}&lng=${location.longitude}&alt=0&mode=above`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.above) {
          setOverhead(data.above);
        }
        setOverheadLoading(false);
      })
      .catch(() => {
        setOverheadLoading(false);
      });
  }, []);

  useEffect(() => {
    // Try saved location first for instant load
    try {
      const saved = localStorage.getItem("nightsky-location");
      if (saved) {
        const loc = JSON.parse(saved);
        loadSkyData({ latitude: loc.latitude, longitude: loc.longitude });
      }
    } catch { /* ignore */ }

    if (!navigator.geolocation) {
      if (!skyData) {
        setLocationError("Geolocation not supported.");
        loadSkyData({ latitude: 40.71, longitude: -74.01 });
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        localStorage.setItem("nightsky-location", JSON.stringify(loc));
        loadSkyData(loc);
      },
      () => {
        // Only fall back to NYC if we don't have saved location
        if (!skyData) {
          setLocationError("Location access denied. Showing New York.");
          loadSkyData({ latitude: 40.71, longitude: -74.01 });
        }
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSkyData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-midnight">
        <StarField />
        <div className="relative z-10 text-center animate-fade-in">
          <p
            className="text-2xl text-text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Finding your sky...
          </p>
          <p className="text-sm text-text-dim mt-3">
            Calculating what&apos;s overhead from your location
          </p>
        </div>
      </div>
    );
  }

  if (!skyData) return null;

  const dateStr = skyData.date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-midnight">
      <StarField />

      <main className="relative z-10 max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-12 animate-fade-in">
          <h1
            className="text-4xl md:text-5xl text-text-primary tracking-tight leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Tonight&apos;s Sky
          </h1>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-text-secondary">
            <LocationSearch
              onSelect={(loc) => {
                setLoading(false);
                setSatLoading(true);
                setOverheadLoading(true);
                setSatError(null);
                loadSkyData(loc);
              }}
              currentName={skyData.location.name}
            />
            <span className="text-text-dim">·</span>
            <span>{dateStr}</span>
          </div>
        </header>

        {/* AR Tracker link */}
        <div className="mb-10 animate-fade-in-delay-1">
          <a
            href="/tracker"
            className="group flex items-center gap-3 p-4 rounded-lg border border-accent-blue/30 bg-accent-blue/5 hover:bg-accent-blue/10 transition-colors"
          >
            <span className="text-2xl">📱</span>
            <div>
              <p className="text-sm text-text-primary font-medium group-hover:text-accent-blue transition-colors">
                Open Sky Tracker
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                Point your phone at the sky to identify satellites, planets, and stars in AR
              </p>
            </div>
            <span className="ml-auto text-text-dim group-hover:text-accent-blue transition-colors">→</span>
          </a>
        </div>

        {/* Sun times strip */}
        <div className="mb-10 animate-fade-in-delay-1">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-text-dim text-xs uppercase tracking-wider">
                Sunset
              </span>
              <p className="text-text-primary mt-0.5">{skyData.sunsetTime}</p>
            </div>
            <div>
              <span className="text-text-dim text-xs uppercase tracking-wider">
                Dark by
              </span>
              <p className="text-text-primary mt-0.5">
                {skyData.astronomicalTwilight}
              </p>
            </div>
            <div>
              <span className="text-text-dim text-xs uppercase tracking-wider">
                Sunrise
              </span>
              <p className="text-text-primary mt-0.5">{skyData.sunriseTime}</p>
            </div>
          </div>
        </div>

        {/* === OVERHEAD RIGHT NOW === */}
        <section className="mb-12 animate-fade-in-delay-1">
          <h2
            className="text-xs uppercase tracking-wider text-text-dim mb-4"
          >
            Overhead right now
          </h2>
          <OverheadNow data={overhead} loading={overheadLoading} />
        </section>

        {/* === UPCOMING PASSES — the main event === */}
        <section className="mb-12 animate-fade-in-delay-2">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xs uppercase tracking-wider text-text-dim">
              Upcoming visible passes
            </h2>
            <span className="text-[10px] text-text-dim">Next 5 days</span>
          </div>
          <SatellitePasses
            passes={passes}
            loading={satLoading}
            error={satError}
          />
        </section>

        {/* Divider */}
        <div className="border-t border-border/30 my-12" />

        {/* === SKY HIGHLIGHTS === */}
        {skyData.highlights.length > 0 && (
          <section className="mb-12 animate-fade-in-delay-2">
            <h2 className="text-xs uppercase tracking-wider text-text-dim mb-4">
              Also worth seeing
            </h2>
            <SkyHighlights
              highlights={skyData.highlights}
              bortleClass={skyData.lightPollution.bortleClass}
            />
          </section>
        )}

        {/* Moon + Planets */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <section className="animate-fade-in-delay-3">
            <h2 className="text-xs uppercase tracking-wider text-text-dim mb-4">
              Moon
            </h2>
            <div className="p-5 rounded-lg border border-border bg-surface/30">
              <MoonPhase moon={skyData.moon} />
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {skyData.moon.rise && (
                  <div>
                    <span className="text-text-dim text-xs">Moonrise</span>
                    <p className="text-text-secondary">
                      {skyData.moon.rise.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                )}
                {skyData.moon.set && (
                  <div>
                    <span className="text-text-dim text-xs">Moonset</span>
                    <p className="text-text-secondary">
                      {skyData.moon.set.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="animate-fade-in-delay-3">
            <h2 className="text-xs uppercase tracking-wider text-text-dim mb-4">
              Planets
            </h2>
            <PlanetList
              planets={skyData.planets}
              bortleClass={skyData.lightPollution.bortleClass}
            />
          </section>
        </div>

        {/* Constellations */}
        {skyData.constellations.length > 0 && (
          <section className="mb-12 animate-fade-in-delay-3">
            <h2 className="text-xs uppercase tracking-wider text-text-dim mb-4">
              Constellations in season
            </h2>
            <div className="space-y-3">
              {skyData.constellations
                .filter(
                  (c) =>
                    c.minBortleToSee >= skyData.lightPollution.bortleClass
                )
                .slice(0, 4)
                .map((c) => (
                  <div
                    key={c.name}
                    className="p-4 rounded-lg border border-border/50 bg-surface/20"
                  >
                    <div className="flex items-baseline justify-between">
                      <h3
                        className="text-text-primary"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {c.name}
                      </h3>
                      <span className="text-xs text-text-dim">
                        {c.direction}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary mt-1 leading-relaxed">
                      {c.description}
                    </p>
                    {c.notableStars.length > 0 && (
                      <p className="text-xs text-text-dim mt-2">
                        {c.notableStars.join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Light Pollution */}
        <section className="mb-12 animate-fade-in-delay-3">
          <div className="p-5 rounded-lg border border-border bg-surface/30">
            <BortleScale lightPollution={skyData.lightPollution} />
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-text-dim py-8 border-t border-border/30">
          <p>
            Satellite data from N2YO. Sky calculations use your device&apos;s
            location and time. Planet positions are approximate.
          </p>
        </footer>
      </main>
    </div>
  );
}
