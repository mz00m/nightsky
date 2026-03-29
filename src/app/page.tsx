"use client";

import { useEffect, useState, useCallback } from "react";
import { SkyData, Location } from "@/lib/types";
import { calculateSkyData } from "@/lib/astronomy";
import { StarField } from "@/components/StarField";
import { MoonPhase } from "@/components/MoonPhase";
import { BortleScale } from "@/components/BortleScale";
import { SkyHighlights } from "@/components/SkyHighlights";
import { PlanetList } from "@/components/PlanetList";

export default function Home() {
  const [skyData, setSkyData] = useState<SkyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const loadSkyData = useCallback((location: Location) => {
    const data = calculateSkyData(location, new Date());
    setSkyData(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      // Fall back to a default location (NYC)
      loadSkyData({ latitude: 40.71, longitude: -74.01 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadSkyData({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setLocationError("Location access denied. Showing New York as default.");
        loadSkyData({ latitude: 40.71, longitude: -74.01 });
      },
      { timeout: 10000, maximumAge: 300000 }
    );
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
            Calculating what&apos;s visible from your location
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
            <span>{skyData.location.name}</span>
            <span className="text-text-dim">·</span>
            <span>{dateStr}</span>
          </div>
          {locationError && (
            <p className="text-xs text-text-dim mt-2">{locationError}</p>
          )}
        </header>

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

        {/* Top highlight — what to see first */}
        {skyData.highlights.length > 0 && (
          <section className="mb-12 animate-fade-in-delay-1">
            <h2
              className="text-xs uppercase tracking-wider text-text-dim mb-4"
            >
              Best tonight
            </h2>
            <SkyHighlights
              highlights={skyData.highlights}
              bortleClass={skyData.lightPollution.bortleClass}
            />
          </section>
        )}

        {/* Two-column: Moon + Planets */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Moon */}
          <section className="animate-fade-in-delay-2">
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

          {/* Planets */}
          <section className="animate-fade-in-delay-2">
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
            Calculations use your device&apos;s location and time. Planet positions
            are approximate. For precise observations, consult a planetarium app.
          </p>
        </footer>
      </main>
    </div>
  );
}
