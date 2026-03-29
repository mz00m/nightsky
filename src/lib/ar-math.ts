// Convert device orientation (alpha, beta, gamma) to where the camera is pointing
// Returns azimuth (0-360, 0=North) and altitude (0-90, 0=horizon, 90=zenith)

export interface CameraPointing {
  azimuth: number; // degrees, 0=N, 90=E, 180=S, 270=W
  altitude: number; // degrees above horizon
}

export interface ScreenPosition {
  x: number; // 0-1, left to right
  y: number; // 0-1, top to bottom
  visible: boolean;
  distance: number; // angular distance from center in degrees
}

export function deviceOrientationToPointing(
  alpha: number, // compass heading (0-360)
  beta: number, // front-back tilt (-180 to 180)
  gamma: number, // left-right tilt (-90 to 90)
  screenOrientation: number // window.screen.orientation.angle
): CameraPointing {
  // When phone is held up in portrait mode:
  // beta ≈ 0 means phone flat, beta ≈ 90 means phone vertical
  // alpha is compass heading (magnetic north)

  // Adjust alpha for screen orientation
  let azimuth = (alpha + screenOrientation) % 360;

  // When phone is vertical (beta ~90), camera points at horizon
  // When phone is tilted back (beta ~0), camera points at zenith
  // beta goes: 0=flat face up, 90=vertical, 180=flat face down
  let altitude = beta - 90; // Convert so 0=horizon when vertical

  // Clamp altitude
  altitude = Math.max(-90, Math.min(90, altitude));

  // Adjust azimuth based on gamma (left-right tilt)
  if (Math.abs(gamma) > 10) {
    azimuth = (azimuth - gamma * 0.5 + 360) % 360;
  }

  return { azimuth, altitude };
}

// Project a sky object (at given az/alt) onto the screen
// given where the camera is pointing
export function projectToScreen(
  objectAz: number,
  objectAlt: number,
  cameraAz: number,
  cameraAlt: number,
  fovH: number = 60, // horizontal field of view in degrees
  fovV: number = 80 // vertical field of view in degrees (portrait)
): ScreenPosition {
  // Angular difference in azimuth
  let dAz = objectAz - cameraAz;
  // Normalize to -180..180
  if (dAz > 180) dAz -= 360;
  if (dAz < -180) dAz += 360;

  // Angular difference in altitude
  const dAlt = objectAlt - cameraAlt;

  // Distance from center of view
  const distance = Math.sqrt(dAz * dAz + dAlt * dAlt);

  // Map to screen coordinates (0-1)
  const x = 0.5 + dAz / fovH;
  const y = 0.5 - dAlt / fovV; // invert: higher alt = higher on screen

  const visible = x >= -0.1 && x <= 1.1 && y >= -0.1 && y <= 1.1;

  return { x, y, visible, distance };
}

// Interpolate satellite position along its pass arc
export function interpolatePassPosition(
  startAz: number,
  startAlt: number,
  maxAz: number,
  maxAlt: number,
  endAz: number,
  endAlt: number,
  startUTC: number,
  endUTC: number,
  nowUTC: number
): { az: number; alt: number; progress: number } | null {
  if (nowUTC < startUTC || nowUTC > endUTC) return null;

  const totalDuration = endUTC - startUTC;
  const elapsed = nowUTC - startUTC;
  const progress = elapsed / totalDuration;

  // Two-segment interpolation: start->max (first half), max->end (second half)
  let az: number, alt: number;

  if (progress < 0.5) {
    const t = progress * 2; // 0-1 within first half
    az = lerp(startAz, maxAz, t);
    alt = lerp(startAlt, maxAlt, t);
  } else {
    const t = (progress - 0.5) * 2; // 0-1 within second half
    az = lerp(maxAz, endAz, t);
    alt = lerp(maxAlt, endAlt, t);
  }

  return { az, alt, progress };
}

function lerp(a: number, b: number, t: number): number {
  // Handle azimuth wrapping (e.g., 350° to 10°)
  let diff = b - a;
  if (Math.abs(diff) > 180) {
    if (diff > 0) diff -= 360;
    else diff += 360;
  }
  return ((a + diff * t) % 360 + 360) % 360;
}

// Bright reference stars with fixed positions (epoch J2000, precessed approximately)
export interface SkyObject {
  name: string;
  az: number;
  alt: number;
  type: "star" | "planet" | "moon" | "satellite" | "constellation-label";
  magnitude?: number;
  color?: string;
}

// Calculate azimuth/altitude for a set of bright stars given observer location and time
// Using simplified equatorial-to-horizontal conversion
export function getStarPositions(
  lat: number,
  lon: number,
  date: Date
): SkyObject[] {
  const stars: {
    name: string;
    ra: number; // hours
    dec: number; // degrees
    mag: number;
    color: string;
  }[] = [
    { name: "Sirius", ra: 6.75, dec: -16.72, mag: -1.46, color: "#a5c8ff" },
    { name: "Arcturus", ra: 14.26, dec: 19.18, mag: -0.05, color: "#ffcca5" },
    { name: "Vega", ra: 18.62, dec: 38.78, mag: 0.03, color: "#cce0ff" },
    { name: "Capella", ra: 5.28, dec: 46.0, mag: 0.08, color: "#fff4cc" },
    { name: "Rigel", ra: 5.24, dec: -8.2, mag: 0.13, color: "#b8d4ff" },
    { name: "Betelgeuse", ra: 5.92, dec: 7.41, mag: 0.5, color: "#ffb5a0" },
    { name: "Aldebaran", ra: 4.6, dec: 16.51, mag: 0.87, color: "#ffc5a0" },
    { name: "Antares", ra: 16.49, dec: -26.43, mag: 1.06, color: "#ff9580" },
    { name: "Spica", ra: 13.42, dec: -11.16, mag: 0.97, color: "#b0c8ff" },
    { name: "Pollux", ra: 7.76, dec: 28.03, mag: 1.14, color: "#ffe8c0" },
    { name: "Deneb", ra: 20.69, dec: 45.28, mag: 1.25, color: "#d8e8ff" },
    { name: "Regulus", ra: 10.14, dec: 11.97, mag: 1.36, color: "#c0d8ff" },
    { name: "Polaris", ra: 2.53, dec: 89.26, mag: 1.98, color: "#fff8e0" },
  ];

  // Calculate Local Sidereal Time
  const jd = julianDate(date);
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  gmst = ((gmst % 360) + 360) % 360;
  const lst = ((gmst + lon) % 360 + 360) % 360;

  const latRad = (lat * Math.PI) / 180;

  return stars
    .map((star) => {
      // Hour angle
      const ha = (((lst - star.ra * 15) % 360) + 360) % 360;
      const haRad = (ha * Math.PI) / 180;
      const decRad = (star.dec * Math.PI) / 180;

      // Altitude
      const sinAlt =
        Math.sin(latRad) * Math.sin(decRad) +
        Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
      const alt = (Math.asin(sinAlt) * 180) / Math.PI;

      // Azimuth
      const cosAz =
        (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
        (Math.cos(latRad) * Math.cos((alt * Math.PI) / 180));
      let az = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
      if (Math.sin(haRad) > 0) az = 360 - az;

      return {
        name: star.name,
        az,
        alt,
        type: "star" as const,
        magnitude: star.mag,
        color: star.color,
      };
    })
    .filter((s) => s.alt > 0); // Only above horizon
}

function julianDate(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d =
    date.getUTCDate() +
    date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400;

  const a = Math.floor((14 - m) / 12);
  const y1 = y + 4800 - a;
  const m1 = m + 12 * a - 3;

  return (
    d +
    Math.floor((153 * m1 + 2) / 5) +
    365 * y1 +
    Math.floor(y1 / 4) -
    Math.floor(y1 / 100) +
    Math.floor(y1 / 400) -
    32045.5
  );
}
