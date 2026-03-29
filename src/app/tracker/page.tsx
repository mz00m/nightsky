"use client";

import { useEffect, useRef, useState } from "react";
import SunCalc from "suncalc";
import { SatellitePass } from "@/lib/satellites";
import {
  CameraPointing,
  deviceOrientationToPointing,
  projectToScreen,
  interpolatePassPosition,
  getStarPositions,
  SkyObject,
} from "@/lib/ar-math";

type InitStep = "idle" | "orientation" | "camera" | "location" | "ready";

export default function TrackerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<InitStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [pointing, setPointing] = useState<CameraPointing>({
    azimuth: 0,
    altitude: 0,
  });
  const [lat, setLat] = useState(0);
  const [lon, setLon] = useState(0);
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [skyObjects, setSkyObjects] = useState<SkyObject[]>([]);
  const orientationRef = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const animFrameRef = useRef<number>(0);

  // Attach stream to video element once both exist
  useEffect(() => {
    if (streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().then(() => {
        setCameraReady(true);
      }).catch(() => {
        setError("Could not start camera playback.");
      });
    }
  }, [step]); // re-check when step changes and video element may now exist

  // Step-by-step init — each permission is its own phase with visible feedback.
  // Orientation MUST be first and called synchronously from the tap gesture.
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
        // iOS may throw if the feature is disabled at OS level
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

    // Step 3: Location
    setStep("location");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });
      const { latitude, longitude } = pos.coords;
      setLat(latitude);
      setLon(longitude);
      setSkyObjects(getStarPositions(latitude, longitude, new Date()));

      // Fetch satellite passes (non-blocking)
      fetch(`/api/satellites?lat=${latitude}&lng=${longitude}&alt=0&mode=passes`)
        .then((r) => r.json())
        .then((data) => { if (data.passes) setPasses(data.passes); })
        .catch(() => {});
    } catch {
      setError("Location access denied. Allow location permissions and reload.");
      return;
    }

    // Done — switch to AR view
    setStep("ready");
  }

  function handleOrientation(event: DeviceOrientationEvent) {
    // Use webkitCompassHeading for iOS, alpha for others
    const alpha =
      (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading ??
      (event.absolute ? (360 - (event.alpha || 0)) % 360 : event.alpha || 0);

    orientationRef.current = {
      alpha,
      beta: event.beta || 0,
      gamma: event.gamma || 0,
    };
  }

  // Animation loop
  useEffect(() => {
    if (step !== "ready") return;

    const loop = () => {
      const { alpha, beta, gamma } = orientationRef.current;
      const screenAngle =
        typeof screen !== "undefined" && screen.orientation
          ? screen.orientation.angle
          : 0;

      const newPointing = deviceOrientationToPointing(
        alpha,
        beta,
        gamma,
        screenAngle
      );
      setPointing(newPointing);

      // Update star positions every 30 seconds
      if (lat !== 0 && Date.now() % 30000 < 20) {
        setSkyObjects(getStarPositions(lat, lon, new Date()));
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [step, lat, lon]);

  // Get sun position and arc
  const now = new Date();
  const sunPos = lat !== 0 ? SunCalc.getPosition(now, lat, lon) : null;
  const sunAz = sunPos ? ((sunPos.azimuth * 180) / Math.PI + 180) % 360 : 0;
  const sunAlt = sunPos ? (sunPos.altitude * 180) / Math.PI : 0;

  // Compute sun arc points across the day (every 30 min)
  const sunArc: { az: number; alt: number; hour: number }[] = [];
  if (lat !== 0) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    for (let m = 0; m < 24 * 60; m += 30) {
      const t = new Date(dayStart.getTime() + m * 60000);
      const sp = SunCalc.getPosition(t, lat, lon);
      const alt = (sp.altitude * 180) / Math.PI;
      if (alt > -10) {
        sunArc.push({
          az: ((sp.azimuth * 180) / Math.PI + 180) % 360,
          alt,
          hour: t.getHours(),
        });
      }
    }
  }

  // Get moon position and arc
  const moonPos = lat !== 0 ? SunCalc.getMoonPosition(now, lat, lon) : null;
  const moonAz = moonPos ? ((moonPos.azimuth * 180) / Math.PI + 180) % 360 : 0;
  const moonAlt = moonPos ? (moonPos.altitude * 180) / Math.PI : 0;
  const moonIllum = SunCalc.getMoonIllumination(now);

  // Compute moon arc (every 30 min)
  const moonArc: { az: number; alt: number }[] = [];
  if (lat !== 0) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    for (let m = 0; m < 24 * 60; m += 30) {
      const t = new Date(dayStart.getTime() + m * 60000);
      const mp = SunCalc.getMoonPosition(t, lat, lon);
      const alt = (mp.altitude * 180) / Math.PI;
      if (alt > -10) {
        moonArc.push({
          az: ((mp.azimuth * 180) / Math.PI + 180) % 360,
          alt,
        });
      }
    }
  }

  // Currently active satellite passes
  const nowUTC = Math.floor(Date.now() / 1000);
  const activePasses = passes.filter(
    (p) => nowUTC >= p.startUTC - 300 && nowUTC <= p.endUTC + 60
  );
  const upcomingPasses = passes
    .filter((p) => p.startUTC > nowUTC && p.startUTC - nowUTC < 7200)
    .slice(0, 3);

  // Setup / loading / error screens
  if (step !== "ready") {
    const stepLabels: Record<InitStep, string> = {
      idle: "",
      orientation: "Requesting motion sensors…",
      camera: "Requesting camera…",
      location: "Getting your location…",
      ready: "",
    };

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
              {/* Step progress */}
              <div className="space-y-3 text-left mb-6">
                <StepRow
                  label="Motion sensors"
                  status={step === "orientation" ? "active" : "done"}
                />
                <StepRow
                  label="Camera"
                  status={step === "camera" ? "active" : step === "orientation" ? "pending" : "done"}
                />
                <StepRow
                  label="Location"
                  status={step === "location" ? "active" : step === "orientation" || step === "camera" ? "pending" : "done"}
                />
              </div>
              <p className="text-sm text-text-secondary animate-pulse">
                {stepLabels[step]}
              </p>
              <p className="text-xs text-text-dim mt-3">
                Tap &ldquo;Allow&rdquo; on each prompt
              </p>
            </>
          )}

          <a
            href="/"
            className="inline-block mt-6 text-sm text-text-dim hover:text-text-secondary transition-colors"
          >
            ← Back to sky guide
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />

      {/* Dark overlay for contrast */}
      <div className="absolute inset-0 bg-black/20" />

      {/* AR overlay */}
      <div className="absolute inset-0">
        {/* Horizon line */}
        <HorizonLine cameraAz={pointing.azimuth} cameraAlt={pointing.altitude} />

        {/* Sun arc (dashed golden line showing path across sky) */}
        <ArcPath
          points={sunArc}
          cameraAz={pointing.azimuth}
          cameraAlt={pointing.altitude}
          color="#f5c542"
          label="Sun"
        />

        {/* Moon arc (dashed silver line) */}
        <ArcPath
          points={moonArc}
          cameraAz={pointing.azimuth}
          cameraAlt={pointing.altitude}
          color="#c4cee0"
          label="Moon"
        />

        {/* Sun position */}
        {sunPos && sunAlt > -10 && (
          <ARObject
            az={sunAz}
            alt={sunAlt}
            cameraAz={pointing.azimuth}
            cameraAlt={pointing.altitude}
            label={sunAlt > 0 ? `Sun ${Math.round(sunAlt)}°` : "Sun (below horizon)"}
            color="#f5c542"
            size={sunAlt > 0 ? 24 : 12}
            type="moon"
          />
        )}

        {/* Moon */}
        {moonPos && moonAlt > -5 && (
          <ARObject
            az={moonAz}
            alt={moonAlt}
            cameraAz={pointing.azimuth}
            cameraAlt={pointing.altitude}
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
            cameraAz={pointing.azimuth}
            cameraAlt={pointing.altitude}
            label={star.name}
            color={star.color || "#c4cee0"}
            size={star.magnitude !== undefined ? Math.max(3, 10 - star.magnitude * 3) : 4}
            type="star"
          />
        ))}

        {/* Active satellite passes */}
        {activePasses.map((pass) => {
          const pos = interpolatePassPosition(
            pass.startAz,
            pass.startEl,
            pass.maxAz,
            pass.maxEl,
            pass.endAz,
            pass.endEl,
            pass.startUTC,
            pass.endUTC,
            nowUTC
          );
          if (!pos) return null;
          return (
            <ARObject
              key={`${pass.satid}-${pass.startUTC}`}
              az={pos.az}
              alt={pos.alt}
              cameraAz={pointing.azimuth}
              cameraAlt={pointing.altitude}
              label={cleanName(pass.satname)}
              color={
                pass.category === "iss"
                  ? "#5b8def"
                  : pass.category === "starlink"
                    ? "#a78bfa"
                    : pass.category === "rocket-body"
                      ? "#f59e0b"
                      : "#ef4444"
              }
              size={pass.category === "iss" ? 14 : 8}
              type="satellite"
              showTrail
              trailStart={{ az: pass.startAz, alt: pass.startEl }}
              trailEnd={{ az: pass.endAz, alt: pass.endEl }}
              trailMax={{ az: pass.maxAz, alt: pass.maxEl }}
            />
          );
        })}

        {/* Upcoming pass markers (show start position) */}
        {upcomingPasses.map((pass) => {
          const minsUntil = Math.round((pass.startUTC - nowUTC) / 60);
          return (
            <ARObject
              key={`upcoming-${pass.satid}-${pass.startUTC}`}
              az={pass.startAz}
              alt={pass.startEl}
              cameraAz={pointing.azimuth}
              cameraAlt={pointing.altitude}
              label={`${cleanName(pass.satname)} in ${minsUntil}m`}
              color="#5a6580"
              size={6}
              type="upcoming"
              dimmed
            />
          );
        })}
      </div>

      {/* Compass + altitude HUD */}
      <div className="absolute top-0 left-0 right-0 safe-area-top">
        <div className="flex justify-between items-start p-4 pt-12">
          <a
            href="/"
            className="text-white/60 text-sm backdrop-blur-md bg-black/30 px-3 py-1.5 rounded-full"
          >
            ← Back
          </a>
          <div className="text-right backdrop-blur-md bg-black/30 px-3 py-1.5 rounded-lg">
            <p className="text-white/90 text-sm font-mono">
              {compassDirection(pointing.azimuth)} {Math.round(pointing.azimuth)}°
            </p>
            <p className="text-white/50 text-xs font-mono">
              Alt {Math.round(pointing.altitude)}°
            </p>
          </div>
        </div>
      </div>

      {/* Bottom info panel */}
      <div className="absolute bottom-0 left-0 right-0 safe-area-bottom">
        <div className="p-4 pb-8 backdrop-blur-md bg-black/40">
          {activePasses.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
              <p className="text-white/90 text-sm">
                {activePasses.length} satellite{activePasses.length !== 1 ? "s" : ""} passing now — look for moving points of light
              </p>
            </div>
          ) : upcomingPasses.length > 0 ? (
            <p className="text-white/70 text-sm">
              Next pass: {cleanName(upcomingPasses[0].satname)} in{" "}
              {Math.round((upcomingPasses[0].startUTC - nowUTC) / 60)} min —{" "}
              look {upcomingPasses[0].startAzCompass}
            </p>
          ) : (
            <p className="text-white/50 text-sm">
              Point at the sky — stars and planets are labeled
            </p>
          )}
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

// Individual AR object renderer
function ARObject({
  az,
  alt,
  cameraAz,
  cameraAlt,
  label,
  color,
  size,
  type,
  dimmed = false,
  showTrail = false,
  trailStart,
  trailMax,
  trailEnd,
}: {
  az: number;
  alt: number;
  cameraAz: number;
  cameraAlt: number;
  label: string;
  color: string;
  size: number;
  type: "star" | "moon" | "satellite" | "upcoming";
  dimmed?: boolean;
  showTrail?: boolean;
  trailStart?: { az: number; alt: number };
  trailMax?: { az: number; alt: number };
  trailEnd?: { az: number; alt: number };
}) {
  const pos = projectToScreen(az, alt, cameraAz, cameraAlt);
  if (!pos.visible) return null;

  const opacity = dimmed ? 0.4 : pos.distance > 25 ? 0.6 : 1;

  return (
    <>
      {/* Trail arc for satellites */}
      {showTrail && trailStart && trailMax && trailEnd && (
        <TrailArc
          start={trailStart}
          max={trailMax}
          end={trailEnd}
          cameraAz={cameraAz}
          cameraAlt={cameraAlt}
          color={color}
        />
      )}

      {/* Object dot */}
      <div
        className="absolute pointer-events-none transition-all duration-100"
        style={{
          left: `${pos.x * 100}%`,
          top: `${pos.y * 100}%`,
          transform: "translate(-50%, -50%)",
          opacity,
        }}
      >
        {type === "moon" ? (
          <div
            className="rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
              boxShadow: `0 0 ${size}px ${color}40`,
            }}
          />
        ) : type === "satellite" ? (
          <div className="relative">
            <div
              className="rounded-full animate-pulse"
              style={{
                width: size,
                height: size,
                backgroundColor: color,
                boxShadow: `0 0 ${size * 2}px ${color}80`,
              }}
            />
          </div>
        ) : (
          <div
            className="rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
              boxShadow: `0 0 ${size}px ${color}60`,
            }}
          />
        )}

        {/* Label — always visible */}
        <div
          className="absolute whitespace-nowrap flex flex-col items-center"
          style={{
            top: size + 2,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          {/* Type badge */}
          {type !== "star" && (
            <span
              className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded mb-0.5"
              style={{
                color: "#fff",
                backgroundColor: `${color}60`,
                textShadow: "0 1px 2px rgba(0,0,0,0.9)",
              }}
            >
              {type === "moon" ? "Moon" : type === "satellite" ? "Satellite" : type === "upcoming" ? "Soon" : ""}
            </span>
          )}
          <p
            className="text-center"
            style={{
              fontSize: type === "star" ? "10px" : "12px",
              color: color,
              textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
              fontWeight: type === "star" ? 500 : 600,
              letterSpacing: type === "star" ? "0.02em" : undefined,
            }}
          >
            {label}
          </p>
        </div>
      </div>
    </>
  );
}

function TrailArc({
  start,
  max,
  end,
  cameraAz,
  cameraAlt,
  color,
}: {
  start: { az: number; alt: number };
  max: { az: number; alt: number };
  end: { az: number; alt: number };
  cameraAz: number;
  cameraAlt: number;
  color: string;
}) {
  // Project trail points
  const points: { x: number; y: number }[] = [];
  for (let t = 0; t <= 1; t += 0.05) {
    let az: number, alt: number;
    if (t < 0.5) {
      const s = t * 2;
      az = start.az + (max.az - start.az) * s;
      alt = start.alt + (max.alt - start.alt) * s;
    } else {
      const s = (t - 0.5) * 2;
      az = max.az + (end.az - max.az) * s;
      alt = max.alt + (end.alt - max.alt) * s;
    }
    const pos = projectToScreen(az, alt, cameraAz, cameraAlt);
    if (pos.visible) {
      points.push({ x: pos.x * 100, y: pos.y * 100 });
    }
  }

  if (points.length < 2) return null;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.3"
      />
    </svg>
  );
}

function cleanName(name: string): string {
  return name
    .replace(/^ISS \(ZARYA\)/, "ISS")
    .replace(/^CSS \(TIANHE\)/, "Tiangong")
    .replace(/^STARLINK-/, "Starlink ")
    .replace(/ R\/B$/, "")
    .replace(/ DEB$/, "");
}

function compassDirection(az: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(az / 45) % 8];
}

function HorizonLine({ cameraAz, cameraAlt }: { cameraAz: number; cameraAlt: number }) {
  // Project the horizon (alt=0) across the full azimuth range
  const points: { x: number; y: number }[] = [];
  for (let az = cameraAz - 40; az <= cameraAz + 40; az += 2) {
    const pos = projectToScreen(((az % 360) + 360) % 360, 0, cameraAz, cameraAlt);
    if (pos.y >= -0.1 && pos.y <= 1.1) {
      points.push({ x: pos.x * 100, y: pos.y * 100 });
    }
  }

  if (points.length < 2) return null;

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Cardinal direction labels along the horizon
  const cardinals = [
    { az: 0, label: "N" },
    { az: 45, label: "NE" },
    { az: 90, label: "E" },
    { az: 135, label: "SE" },
    { az: 180, label: "S" },
    { az: 225, label: "SW" },
    { az: 270, label: "W" },
    { az: 315, label: "NW" },
  ];

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <path d={pathD} fill="none" stroke="#ffffff" strokeWidth="0.5" opacity="0.3" />
      </svg>
      {cardinals.map(({ az, label }) => {
        const pos = projectToScreen(az, 0, cameraAz, cameraAlt);
        if (!pos.visible) return null;
        return (
          <div
            key={label}
            className="absolute pointer-events-none"
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span
              className="text-[10px] font-medium tracking-wider"
              style={{
                color: label === "N" ? "#ef4444" : "#ffffff80",
                textShadow: "0 1px 3px rgba(0,0,0,0.9)",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </>
  );
}

function ArcPath({
  points,
  cameraAz,
  cameraAlt,
  color,
  label,
}: {
  points: { az: number; alt: number }[];
  cameraAz: number;
  cameraAlt: number;
  color: string;
  label: string;
}) {
  const projected: { x: number; y: number }[] = [];
  for (const p of points) {
    const pos = projectToScreen(p.az, p.alt, cameraAz, cameraAlt);
    if (pos.visible) {
      projected.push({ x: pos.x * 100, y: pos.y * 100 });
    }
  }

  if (projected.length < 2) return null;

  // Filter out big jumps (wrapping artifacts)
  const segments: { x: number; y: number }[][] = [[]];
  for (let i = 0; i < projected.length; i++) {
    const current = segments[segments.length - 1];
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const dx = projected[i].x - prev.x;
      const dy = projected[i].y - prev.y;
      if (Math.sqrt(dx * dx + dy * dy) > 30) {
        segments.push([]);
      }
    }
    segments[segments.length - 1].push(projected[i]);
  }

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      {segments
        .filter((seg) => seg.length >= 2)
        .map((seg, i) => {
          const d = seg.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="1"
              strokeDasharray="6 4"
              opacity="0.35"
            />
          );
        })}
    </svg>
  );
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
