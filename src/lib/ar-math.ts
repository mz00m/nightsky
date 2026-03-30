// Convert device orientation (alpha, beta, gamma) to where the camera is pointing
// Returns azimuth (0-360, 0=North) and altitude (-90 to 90, 0=horizon, 90=zenith)

export interface CameraPointing {
  azimuth: number;
  altitude: number;
}

export interface ScreenPosition {
  x: number; // 0-1, left to right
  y: number; // 0-1, top to bottom
  visible: boolean;
  distance: number; // angular distance from center in degrees
}

// Exponential moving average for smoothing noisy sensor data
export class OrientationSmoother {
  private alpha = 0;
  private beta = 90;
  private gamma = 0;
  private initialized = false;
  private readonly smoothing: number; // 0-1, higher = smoother (more lag)

  constructor(smoothing = 0.85) {
    this.smoothing = smoothing;
  }

  update(rawAlpha: number, rawBeta: number, rawGamma: number) {
    if (!this.initialized) {
      this.alpha = rawAlpha;
      this.beta = rawBeta;
      this.gamma = rawGamma;
      this.initialized = true;
      return;
    }

    const k = this.smoothing;

    // Smooth alpha (compass heading) — handle 0/360 wraparound
    let dAlpha = rawAlpha - this.alpha;
    if (dAlpha > 180) dAlpha -= 360;
    if (dAlpha < -180) dAlpha += 360;
    this.alpha = ((this.alpha + dAlpha * (1 - k)) % 360 + 360) % 360;

    // Smooth beta and gamma linearly
    this.beta = this.beta * k + rawBeta * (1 - k);
    this.gamma = this.gamma * k + rawGamma * (1 - k);
  }

  get values() {
    return { alpha: this.alpha, beta: this.beta, gamma: this.gamma };
  }
}

export function deviceOrientationToPointing(
  alpha: number, // compass heading (0-360, 0=North, clockwise) — already corrected for iOS
  beta: number, // front-back tilt (0=flat face up, 90=upright, 180=flat face down)
  gamma: number, // left-right tilt (-90 to 90)
  _screenOrientation: number
): CameraPointing {
  // Simple, tested approach:
  // - alpha IS the compass heading where the back camera points (azimuth)
  // - beta tells us the phone tilt: 90=vertical (horizon), 0=flat (zenith)
  // - gamma is a small azimuth correction for left/right lean

  // Altitude: phone flat face-up (beta=0) → looking at zenith (90°)
  //           phone vertical (beta=90) → looking at horizon (0°)
  //           phone tilted back past vertical (beta>90) → looking below horizon
  let altitude = 90 - beta;
  altitude = Math.max(-90, Math.min(90, altitude));

  // Azimuth: compass heading, with gamma correction for lean
  // When phone leans right (gamma>0), camera swings slightly right
  let azimuth = alpha;
  if (Math.abs(gamma) > 5) {
    // Scale correction by how upright the phone is (more effect when vertical)
    const uprightFactor = Math.sin((Math.min(beta, 90) * Math.PI) / 180);
    azimuth = azimuth + gamma * 0.3 * uprightFactor;
  }
  azimuth = ((azimuth % 360) + 360) % 360;

  return { azimuth, altitude };
}

// Project a sky object onto the screen
export function projectToScreen(
  objectAz: number,
  objectAlt: number,
  cameraAz: number,
  cameraAlt: number,
  fovH: number = 65, // horizontal FOV in degrees (typical phone)
  fovV: number = 95 // vertical FOV in portrait
): ScreenPosition {
  // Angular difference in azimuth, accounting for foreshortening at high altitudes
  let dAz = objectAz - cameraAz;
  if (dAz > 180) dAz -= 360;
  if (dAz < -180) dAz += 360;

  // At high altitudes, azimuth differences map to smaller angular distances
  // (lines of azimuth converge at the zenith, like longitude lines at the pole)
  const avgAlt = (objectAlt + cameraAlt) / 2;
  const azScale = Math.cos((avgAlt * Math.PI) / 180);
  const effectiveDaz = dAz * Math.max(azScale, 0.15); // don't collapse fully at zenith

  // Altitude difference
  const dAlt = objectAlt - cameraAlt;

  // Angular distance
  const distance = Math.sqrt(effectiveDaz * effectiveDaz + dAlt * dAlt);

  // Map to screen (0-1)
  const x = 0.5 + effectiveDaz / fovH;
  const y = 0.5 - dAlt / fovV;

  // Wider margin so arcs don't clip at screen edges
  const visible = x >= -0.3 && x <= 1.3 && y >= -0.3 && y <= 1.3;

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

  let az: number, alt: number;

  if (progress < 0.5) {
    const t = progress * 2;
    az = lerpAngle(startAz, maxAz, t);
    alt = startAlt + (maxAlt - startAlt) * t;
  } else {
    const t = (progress - 0.5) * 2;
    az = lerpAngle(maxAz, endAz, t);
    alt = maxAlt + (endAlt - maxAlt) * t;
  }

  return { az, alt, progress };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((a + diff * t) % 360 + 360) % 360;
}

// Star catalog
export interface SkyObject {
  name: string;
  az: number;
  alt: number;
  type: "star" | "planet" | "moon" | "satellite" | "constellation-label";
  magnitude?: number;
  color?: string;
}

export function getStarPositions(
  lat: number,
  lon: number,
  date: Date
): SkyObject[] {
  const stars: {
    name: string;
    ra: number;
    dec: number;
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
    { name: "Fomalhaut", ra: 22.96, dec: -29.62, mag: 1.16, color: "#d0e0ff" },
    { name: "Altair", ra: 19.85, dec: 8.87, mag: 0.76, color: "#e0ecff" },
    { name: "Procyon", ra: 7.65, dec: 5.22, mag: 0.34, color: "#fff8e0" },
  ];

  const jd = julianDate(date);
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  gmst = ((gmst % 360) + 360) % 360;
  const lst = ((gmst + lon) % 360 + 360) % 360;

  const latRad = (lat * Math.PI) / 180;

  return stars
    .map((star) => {
      const ha = (((lst - star.ra * 15) % 360) + 360) % 360;
      const haRad = (ha * Math.PI) / 180;
      const decRad = (star.dec * Math.PI) / 180;

      const sinAlt =
        Math.sin(latRad) * Math.sin(decRad) +
        Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
      const alt = (Math.asin(sinAlt) * 180) / Math.PI;

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
    .filter((s) => s.alt > 0);
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
