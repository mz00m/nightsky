"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

interface TrackerState {
  cameraReady: boolean;
  orientationReady: boolean;
  locationReady: boolean;
  error: string | null;
}

export default function TrackerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<TrackerState>({
    cameraReady: false,
    orientationReady: false,
    locationReady: false,
    error: null,
  });
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

  // Request permissions and start camera
  const init = useCallback(async () => {
    // 1. Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setState((s) => ({ ...s, cameraReady: true }));
      }
    } catch {
      setState((s) => ({
        ...s,
        error: "Camera access needed for AR tracking. Please allow camera permissions.",
      }));
      return;
    }

    // 2. Device orientation
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      "requestPermission" in DeviceOrientationEvent
    ) {
      // iOS requires explicit permission
      try {
        const permission = await (
          DeviceOrientationEvent as unknown as {
            requestPermission: () => Promise<string>;
          }
        ).requestPermission();
        if (permission !== "granted") {
          setState((s) => ({
            ...s,
            error: "Orientation access needed. Please allow motion permissions.",
          }));
          return;
        }
      } catch {
        setState((s) => ({
          ...s,
          error: "Could not request orientation permission.",
        }));
        return;
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    setState((s) => ({ ...s, orientationReady: true }));

    // 3. Location
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLon(longitude);
        setState((s) => ({ ...s, locationReady: true }));

        // Load star positions
        setSkyObjects(getStarPositions(latitude, longitude, new Date()));

        // Fetch satellite passes
        fetch(
          `/api/satellites?lat=${latitude}&lng=${longitude}&alt=0&mode=passes`
        )
          .then((r) => r.json())
          .then((data) => {
            if (data.passes) setPasses(data.passes);
          })
          .catch(() => {});
      },
      () => {
        setState((s) => ({
          ...s,
          error: "Location needed for sky tracking. Please allow location access.",
        }));
      },
      { timeout: 10000 }
    );
  }, []);

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
    if (!state.cameraReady || !state.orientationReady) return;

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
  }, [state.cameraReady, state.orientationReady, lat, lon]);

  // Get moon position
  const moonPos = lat !== 0 ? SunCalc.getMoonPosition(new Date(), lat, lon) : null;
  const moonAz = moonPos ? ((moonPos.azimuth * 180) / Math.PI + 180) % 360 : 0;
  const moonAlt = moonPos ? (moonPos.altitude * 180) / Math.PI : 0;
  const moonIllum = SunCalc.getMoonIllumination(new Date());

  // Currently active satellite passes
  const nowUTC = Math.floor(Date.now() / 1000);
  const activePasses = passes.filter(
    (p) => nowUTC >= p.startUTC - 300 && nowUTC <= p.endUTC + 60
  );
  const upcomingPasses = passes
    .filter((p) => p.startUTC > nowUTC && p.startUTC - nowUTC < 7200)
    .slice(0, 3);

  // Setup screen
  if (!state.cameraReady && !state.error) {
    return (
      <div className="fixed inset-0 bg-midnight flex items-center justify-center">
        <div className="text-center p-8 max-w-sm">
          <h1
            className="text-2xl text-text-primary mb-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sky Tracker
          </h1>
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

  if (state.error) {
    return (
      <div className="fixed inset-0 bg-midnight flex items-center justify-center">
        <div className="text-center p-8 max-w-sm">
          <p className="text-text-secondary mb-4">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary"
          >
            Try again
          </button>
          <a
            href="/"
            className="block mt-4 text-sm text-text-dim hover:text-text-secondary"
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

        {/* Label */}
        {(type !== "star" || pos.distance < 15) && (
          <p
            className="absolute whitespace-nowrap text-center"
            style={{
              top: size + 4,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: type === "star" ? "9px" : "11px",
              color: type === "star" ? `${color}cc` : color,
              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
              fontWeight: type === "satellite" ? 600 : 400,
            }}
          >
            {label}
          </p>
        )}
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
