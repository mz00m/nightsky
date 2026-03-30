"use client";

import { useEffect, useRef, useState } from "react";
import SunCalc from "suncalc";
import {
  CameraPointing,
  OrientationSmoother,
  deviceOrientationToPointing,
  projectToScreen,
  getStarPositions,
  SkyObject,
} from "@/lib/ar-math";
import {
  TLERecord,
  SatelliteRecord,
  VisibleSatellite,
  parseTLEText,
  initSatellites,
  getVisibleSatellites,
} from "@/lib/propagation";
import { getCategoryColor } from "@/lib/satellites";

type InitStep = "idle" | "orientation" | "camera" | "location" | "ready";

export default function TrackerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<InitStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Use refs for high-frequency data, state only for render ticks
  const pointingRef = useRef<CameraPointing>({ azimuth: 0, altitude: 0 });
  const [renderTick, setRenderTick] = useState(0);
  const smootherRef = useRef(new OrientationSmoother(0.88));

  const [lat, setLat] = useState(0);
  const [lon, setLon] = useState(0);
  const [skyObjects, setSkyObjects] = useState<SkyObject[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastRenderRef = useRef(0);

  // CelesTrak satellite data
  const satellitesRef = useRef<SatelliteRecord[]>([]);
  const [visibleSats, setVisibleSats] = useState<VisibleSatellite[]>([]);
  const [satCount, setSatCount] = useState(0);
  const [tleLoading, setTleLoading] = useState(true);

  // Calibration: offset between computed and actual sky positions
  const calibrationRef = useRef<{ azOffset: number; altOffset: number }>({ azOffset: 0, altOffset: 0 });
  const [calibrated, setCalibrated] = useState(false);
  const [showCalibrate, setShowCalibrate] = useState(false);

  // Attach stream to video element once both exist
  useEffect(() => {
    if (streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        setError("Could not start camera playback.");
      });
    }
  }, [step]);

  // Fetch TLE data when location is available
  useEffect(() => {
    if (lat === 0 && lon === 0) return;

    const catalogs = "visual,stations,cosmos-2251-debris,iridium-33-debris,1999-025";

    fetch(`/api/tle?catalogs=${catalogs}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.tles) return;
        const allRecords: TLERecord[] = [];
        for (const [catalog, text] of Object.entries(data.tles)) {
          allRecords.push(...parseTLEText(text as string, catalog));
        }
        const sats = initSatellites(allRecords);
        satellitesRef.current = sats;
        setSatCount(sats.length);
        setTleLoading(false);
      })
      .catch(() => {
        setTleLoading(false);
      });
  }, [lat, lon]);

  async function init() {
    // Step 1: Orientation (must be first for iOS gesture chain)
    setStep("orientation");
    const needsOrientationPermission =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === "function";

    if (needsOrientationPermission) {
      try {
        const permission = await (
          DeviceOrientationEvent as unknown as {
            requestPermission: () => Promise<string>;
          }
        ).requestPermission();
        if (permission !== "granted") {
          setError("Motion access denied. Go to Settings → Safari → Motion & Orientation Access, then reload.");
          return;
        }
      } catch {
        setError("Motion sensors unavailable. Check Settings → Safari → Motion & Orientation Access.");
        return;
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);

    // Step 2: Camera
    setStep("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
    } catch {
      setError("Camera access denied. Allow camera permissions and reload.");
      return;
    }

    // Step 3: Location — don't block on this, go straight to AR view
    setStep("ready");

    // Try saved location first for instant load
    try {
      const saved = localStorage.getItem("nightsky-location");
      if (saved) {
        const { latitude, longitude } = JSON.parse(saved);
        setLat(latitude);
        setLon(longitude);
        setSkyObjects(getStarPositions(latitude, longitude, new Date()));
      }
    } catch { /* ignore */ }

    // Get fresh GPS in background
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLon(longitude);
        setSkyObjects(getStarPositions(latitude, longitude, new Date()));
        localStorage.setItem("nightsky-location", JSON.stringify({ latitude, longitude }));
      },
      () => { /* location failed — use saved */ },
      { timeout: 10000 }
    );
  }

  function handleOrientation(event: DeviceOrientationEvent) {
    const alpha =
      (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading ??
      (event.absolute ? (360 - (event.alpha || 0)) % 360 : event.alpha || 0);

    smootherRef.current.update(alpha, event.beta || 0, event.gamma || 0);
  }

  // Animation loop — samples smoothed orientation, propagates satellites, throttles React renders
  useEffect(() => {
    if (step !== "ready") return;

    let satPropagateCounter = 0;

    const loop = () => {
      const { alpha, beta, gamma } = smootherRef.current.values;
      const screenAngle =
        typeof screen !== "undefined" && screen.orientation
          ? screen.orientation.angle
          : 0;

      pointingRef.current = deviceOrientationToPointing(alpha, beta, gamma, screenAngle);

      // Throttle React re-renders to ~20fps (every 50ms)
      const now = performance.now();
      if (now - lastRenderRef.current > 50) {
        lastRenderRef.current = now;

        // Propagate satellites every 5th render (~4fps is plenty for slow-moving sats)
        satPropagateCounter++;
        if (satPropagateCounter % 5 === 0 && satellitesRef.current.length > 0 && lat !== 0) {
          const visible = getVisibleSatellites(
            satellitesRef.current, new Date(), lat, lon, 0, -2
          );
          setVisibleSats(visible);
        }

        setRenderTick((t) => t + 1);
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    // Refresh star positions every 60 seconds
    const starInterval = setInterval(() => {
      if (lat !== 0) {
        setSkyObjects(getStarPositions(lat, lon, new Date()));
      }
    }, 60000);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(starInterval);
    };
  }, [step, lat, lon]);

  // Read pointing from ref (updated by animation loop)
  const pointing = pointingRef.current;

  // Apply calibration offset to camera pointing for all projections
  const calibratedAz = ((pointing.azimuth + calibrationRef.current.azOffset) % 360 + 360) % 360;
  const calibratedAlt = pointing.altitude + calibrationRef.current.altOffset;

  // Tap-to-calibrate: user taps the real sun on screen, we compute the offset
  function handleCalibrateTap(screenX: number, screenY: number) {
    if (!showCalibrate || lat === 0) return;

    const now = new Date();
    const sp = SunCalc.getPosition(now, lat, lon);
    const trueSunAz = ((sp.azimuth * 180) / Math.PI + 180) % 360;
    const trueSunAlt = (sp.altitude * 180) / Math.PI;

    if (trueSunAlt < 2) return;

    const tapX = screenX / window.innerWidth;
    const tapY = screenY / window.innerHeight;

    const fovH = 65;
    const fovV = 95;
    const tapAzOffset = (tapX - 0.5) * fovH;
    const tapAltOffset = (0.5 - tapY) * fovV;

    const tapSkyAz = ((pointing.azimuth + tapAzOffset) % 360 + 360) % 360;
    const tapSkyAlt = pointing.altitude + tapAltOffset;

    let azDiff = trueSunAz - tapSkyAz;
    if (azDiff > 180) azDiff -= 360;
    if (azDiff < -180) azDiff += 360;
    const altDiff = trueSunAlt - tapSkyAlt;

    calibrationRef.current = { azOffset: azDiff, altOffset: altDiff };
    setCalibrated(true);
    setShowCalibrate(false);
  }

  // Sun data
  const now = new Date();
  const sunPos = lat !== 0 ? SunCalc.getPosition(now, lat, lon) : null;
  const sunAz = sunPos ? ((sunPos.azimuth * 180) / Math.PI + 180) % 360 : 0;
  const sunAlt = sunPos ? (sunPos.altitude * 180) / Math.PI : 0;
  const sunTimes = lat !== 0 ? SunCalc.getTimes(now, lat, lon) : null;

  // Sunset info
  const sunsetTime = sunTimes?.sunset;
  const sunsetPos = sunsetTime ? SunCalc.getPosition(sunsetTime, lat, lon) : null;
  const sunsetAz = sunsetPos ? ((sunsetPos.azimuth * 180) / Math.PI + 180) % 360 : 0;
  const sunsetTimeStr = sunsetTime
    ? sunsetTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  // Sun arc — every 15 min for smoother curve
  const sunArc: { az: number; alt: number }[] = [];
  if (lat !== 0) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = new Date(dayStart.getTime() + m * 60000);
      const sp = SunCalc.getPosition(t, lat, lon);
      const alt = (sp.altitude * 180) / Math.PI;
      if (alt > -15) {
        sunArc.push({
          az: ((sp.azimuth * 180) / Math.PI + 180) % 360,
          alt,
        });
      }
    }
  }

  // Moon data
  const moonPos = lat !== 0 ? SunCalc.getMoonPosition(now, lat, lon) : null;
  const moonAz = moonPos ? ((moonPos.azimuth * 180) / Math.PI + 180) % 360 : 0;
  const moonAlt = moonPos ? (moonPos.altitude * 180) / Math.PI : 0;
  const moonIllum = SunCalc.getMoonIllumination(now);

  // Moon arc
  const moonArc: { az: number; alt: number }[] = [];
  if (lat !== 0) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = new Date(dayStart.getTime() + m * 60000);
      const mp = SunCalc.getMoonPosition(t, lat, lon);
      const alt = (mp.altitude * 180) / Math.PI;
      if (alt > -15) {
        moonArc.push({
          az: ((mp.azimuth * 180) / Math.PI + 180) % 360,
          alt,
        });
      }
    }
  }

  // Suppress unused variable warning
  void renderTick;

  // Setup / loading / error screens
  if (step !== "ready") {
    return (
      <div className="fixed inset-0 bg-midnight flex items-center justify-center">
        <div className="text-center p-8 max-w-sm">
          <h1
            className="text-2xl text-text-primary mb-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sky Tracker
          </h1>

          {error ? (
            <>
              <p className="text-text-secondary mb-6 text-sm leading-relaxed">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-surface border border-border rounded-lg text-sm text-text-primary"
              >
                Try again
              </button>
            </>
          ) : step === "idle" ? (
            <>
              <p className="text-sm text-text-secondary mb-8 leading-relaxed">
                Point your phone at the sky to see satellites, planets, and stars
                overlaid on your camera view.
              </p>
              <button
                onClick={init}
                className="px-6 py-3 bg-accent-blue text-white rounded-lg text-sm font-medium hover:bg-accent-blue/90 transition-colors"
              >
                Start tracking
              </button>
              <p className="text-xs text-text-dim mt-4">
                Requires camera, motion sensors, and location
              </p>
            </>
          ) : (
            <>
              <div className="space-y-3 text-left mb-6">
                <StepRow label="Motion sensors" status={step === "orientation" ? "active" : "done"} />
                <StepRow label="Camera" status={step === "camera" ? "active" : step === "orientation" ? "pending" : "done"} />
                <StepRow label="Location" status={step === "location" ? "active" : step === "orientation" || step === "camera" ? "pending" : "done"} />
              </div>
              <p className="text-sm text-text-secondary animate-pulse">
                {step === "orientation" ? "Requesting motion sensors…" : step === "camera" ? "Requesting camera…" : "Getting your location…"}
              </p>
              <p className="text-xs text-text-dim mt-3">Tap &ldquo;Allow&rdquo; on each prompt</p>
            </>
          )}

          <a href="/" className="inline-block mt-6 text-sm text-text-dim hover:text-text-secondary transition-colors">
            ← Back to sky guide
          </a>
        </div>
      </div>
    );
  }

  // Separate visible sats into categories for rendering
  const overheadSats = visibleSats.filter((s) => s.elevation > 0);
  const sunlitCount = overheadSats.filter((s) => s.inSunlight).length;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/20" />

      {/* AR overlay — tap to calibrate when in calibration mode */}
      <div className="absolute inset-0"
        onClick={showCalibrate ? (e) => handleCalibrateTap(e.clientX, e.clientY) : undefined}
      >
        {/* Horizon line */}
        <HorizonLine cameraAz={calibratedAz} cameraAlt={calibratedAlt} />

        {/* Sun arc */}
        <ArcPath points={sunArc} cameraAz={calibratedAz} cameraAlt={calibratedAlt} color="#f5c542" strokeWidth={1.5} />

        {/* Moon arc */}
        <ArcPath points={moonArc} cameraAz={calibratedAz} cameraAlt={calibratedAlt} color="#c4cee0" strokeWidth={1} />

        {/* Sunset marker on the horizon */}
        {sunsetTime && sunsetTime > now && (
          <ARObject
            az={sunsetAz}
            alt={0}
            cameraAz={calibratedAz}
            cameraAlt={calibratedAlt}
            label={`Sunset ${sunsetTimeStr}`}
            color="#f59e0b"
            size={10}
            type="upcoming"
          />
        )}

        {/* Sun */}
        {sunPos && sunAlt > -15 && (
          <ARObject
            az={sunAz}
            alt={sunAlt}
            cameraAz={calibratedAz}
            cameraAlt={calibratedAlt}
            label={sunAlt > 0 ? "Sun" : "Sun (below horizon)"}
            color="#f5c542"
            size={sunAlt > 0 ? 24 : 10}
            type="moon"
          />
        )}

        {/* Moon */}
        {moonPos && moonAlt > -10 && (
          <ARObject
            az={moonAz}
            alt={moonAlt}
            cameraAz={calibratedAz}
            cameraAlt={calibratedAlt}
            label={`Moon ${Math.round(moonIllum.fraction * 100)}%`}
            color="#f5f0e8"
            size={20}
            type="moon"
          />
        )}

        {/* Stars */}
        {skyObjects.map((star) => (
          <ARObject
            key={star.name}
            az={star.az}
            alt={star.alt}
            cameraAz={calibratedAz}
            cameraAlt={calibratedAlt}
            label={star.name}
            color={star.color || "#c4cee0"}
            size={star.magnitude !== undefined ? Math.max(3, 10 - star.magnitude * 3) : 4}
            type="star"
          />
        ))}

        {/* Real-time satellites from CelesTrak/SGP4 */}
        {overheadSats.map((sat) => (
          <ARObject
            key={sat.noradId}
            az={sat.azimuth}
            alt={sat.elevation}
            cameraAz={calibratedAz}
            cameraAlt={calibratedAlt}
            label={cleanName(sat.name)}
            color={getCategoryColor(sat.category)}
            size={sat.category === "iss" ? 14 : sat.category === "debris" ? 5 : 8}
            type="satellite"
            dimmed={!sat.inSunlight}
            subtitle={`${Math.round(sat.altitude)}km · ${sat.inSunlight ? "sunlit" : "shadow"}`}
          />
        ))}

        {/* Calibration overlay */}
        {showCalibrate && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 backdrop-blur-md px-6 py-4 rounded-xl text-center pointer-events-auto">
              <p className="text-white text-sm font-medium mb-1">Tap the Sun</p>
              <p className="text-white/60 text-xs">Tap where you see the sun to calibrate positions</p>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCalibrate(false); }}
                className="mt-3 text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0">
        <div className="flex justify-between items-start p-4 pt-12">
          <div className="flex flex-col gap-2">
            <a href="/" className="text-white/60 text-sm backdrop-blur-md bg-black/30 px-3 py-1.5 rounded-full">
              ← Back
            </a>
            {sunAlt > 2 && (
              <button
                onClick={() => setShowCalibrate(true)}
                className="text-white/60 text-xs backdrop-blur-md bg-black/30 px-3 py-1.5 rounded-full hover:text-amber-400 transition-colors"
              >
                {calibrated ? "✓ Calibrated" : "☀ Calibrate"}
              </button>
            )}
          </div>
          <div className="text-right backdrop-blur-md bg-black/30 px-3 py-1.5 rounded-lg">
            <p className="text-white/90 text-sm font-mono">
              {compassDirection(calibratedAz)} {Math.round(calibratedAz)}°
            </p>
            <p className="text-white/50 text-xs font-mono">
              Alt {Math.round(calibratedAlt)}°
            </p>
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="p-4 pb-8 backdrop-blur-md bg-black/40">
          <div className="flex items-center justify-between">
            <div>
              {tleLoading ? (
                <p className="text-white/50 text-sm">Loading satellite data...</p>
              ) : overheadSats.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
                  <p className="text-white/90 text-sm">
                    {overheadSats.length} overhead{sunlitCount > 0 ? ` · ${sunlitCount} sunlit` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-white/50 text-sm">
                  {satCount > 0 ? `Tracking ${satCount} objects` : "Point at the sky — objects are labeled"}
                </p>
              )}
            </div>
            {sunsetTimeStr && sunsetTime && sunsetTime > now && (
              <p className="text-amber-400/70 text-xs">
                Sunset {sunsetTimeStr}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-8 h-8 border border-white/10 rounded-full" />
        <div className="absolute w-px h-4 bg-white/10" />
        <div className="absolute w-4 h-px bg-white/10" />
      </div>
    </div>
  );
}

// AR object renderer
function ARObject({
  az, alt, cameraAz, cameraAlt, label, color, size, type,
  dimmed = false, subtitle,
}: {
  az: number; alt: number; cameraAz: number; cameraAlt: number;
  label: string; color: string; size: number;
  type: "star" | "moon" | "satellite" | "upcoming";
  dimmed?: boolean;
  subtitle?: string;
}) {
  const pos = projectToScreen(az, alt, cameraAz, cameraAlt);
  if (!pos.visible) return null;

  const opacity = dimmed ? 0.35 : pos.distance > 25 ? 0.6 : 1;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: "translate(-50%, -50%)",
        opacity,
        willChange: "left, top",
      }}
    >
      {type === "satellite" ? (
        <div
          className="rounded-full animate-pulse"
          style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 ${size * 2}px ${color}80` }}
        />
      ) : (
        <div
          className="rounded-full"
          style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 ${size}px ${color}60` }}
        />
      )}

      <div className="absolute whitespace-nowrap flex flex-col items-center"
        style={{ top: size + 2, left: "50%", transform: "translateX(-50%)" }}>
        {type !== "star" && (
          <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded mb-0.5"
            style={{ color: "#fff", backgroundColor: `${color}60`, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
            {type === "moon" ? "Moon" : type === "satellite" ? "Sat" : type === "upcoming" ? "Soon" : ""}
          </span>
        )}
        <p style={{
          fontSize: type === "star" ? "10px" : "11px",
          color, textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
          fontWeight: type === "star" ? 500 : 600,
        }}>
          {label}
        </p>
        {subtitle && (
          <p style={{
            fontSize: "8px",
            color: `${color}99`,
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function HorizonLine({ cameraAz, cameraAlt }: { cameraAz: number; cameraAlt: number }) {
  const points: { x: number; y: number }[] = [];
  for (let az = cameraAz - 50; az <= cameraAz + 50; az += 1) {
    const pos = projectToScreen(((az % 360) + 360) % 360, 0, cameraAz, cameraAlt);
    if (pos.y >= -0.1 && pos.y <= 1.1) {
      points.push({ x: pos.x * 100, y: pos.y * 100 });
    }
  }

  if (points.length < 2) return null;
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const cardinals = [
    { az: 0, label: "N" }, { az: 45, label: "NE" }, { az: 90, label: "E" },
    { az: 135, label: "SE" }, { az: 180, label: "S" }, { az: 225, label: "SW" },
    { az: 270, label: "W" }, { az: 315, label: "NW" },
  ];

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke="#ffffff" strokeWidth="0.5" opacity="0.4" vectorEffect="non-scaling-stroke" />
      </svg>
      {cardinals.map(({ az, label }) => {
        const pos = projectToScreen(az, 0, cameraAz, cameraAlt);
        if (!pos.visible) return null;
        return (
          <div key={label} className="absolute pointer-events-none"
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: "translate(-50%, -50%)" }}>
            <span className="text-[10px] font-medium tracking-wider"
              style={{ color: label === "N" ? "#ef4444" : "#ffffff80", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
              {label}
            </span>
          </div>
        );
      })}
    </>
  );
}

function ArcPath({ points, cameraAz, cameraAlt, color, strokeWidth = 1 }: {
  points: { az: number; alt: number }[]; cameraAz: number; cameraAlt: number;
  color: string; strokeWidth?: number;
}) {
  const projected: { x: number; y: number }[] = [];
  for (const p of points) {
    const pos = projectToScreen(p.az, p.alt, cameraAz, cameraAlt);
    if (pos.visible) projected.push({ x: pos.x * 100, y: pos.y * 100 });
  }

  if (projected.length < 2) return null;

  // Break into segments at discontinuities (azimuth wrapping)
  const segments: { x: number; y: number }[][] = [[]];
  for (let i = 0; i < projected.length; i++) {
    const current = segments[segments.length - 1];
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const dx = Math.abs(projected[i].x - prev.x);
      const dy = Math.abs(projected[i].y - prev.y);
      if (dx > 40 || dy > 40) {
        segments.push([]);
      }
    }
    segments[segments.length - 1].push(projected[i]);
  }

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      {segments.filter((seg) => seg.length >= 2).map((seg, i) => {
        const d = seg.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
        return (
          <path key={i} d={d} fill="none" stroke={color}
            strokeWidth={strokeWidth} strokeDasharray="6 4" opacity="0.45" vectorEffect="non-scaling-stroke" />
        );
      })}
    </svg>
  );
}

function cleanName(name: string): string {
  return name
    .replace(/^ISS \(ZARYA\)/, "ISS")
    .replace(/^CSS \(TIANHE\)/, "Tiangong")
    .replace(/^STARLINK-/, "Starlink ")
    .replace(/ R\/B$/, " (rocket)")
    .replace(/ DEB$/, " (debris)")
    .replace(/^CZ-/, "CZ ")
    .replace(/^SL-/, "SL ")
    .replace(/^COSMOS /, "Cosmos ");
}

function compassDirection(az: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(az / 45) % 8];
}

function StepRow({ label, status }: { label: string; status: "pending" | "active" | "done" }) {
  return (
    <div className="flex items-center gap-3">
      {status === "done" ? (
        <span className="text-green-400 text-sm">✓</span>
      ) : status === "active" ? (
        <span className="w-3 h-3 rounded-full border-2 border-accent-blue border-t-transparent animate-spin" />
      ) : (
        <span className="w-3 h-3 rounded-full border border-border" />
      )}
      <span className={status === "pending" ? "text-text-dim text-sm" : status === "active" ? "text-text-primary text-sm" : "text-text-secondary text-sm"}>
        {label}
      </span>
    </div>
  );
}
