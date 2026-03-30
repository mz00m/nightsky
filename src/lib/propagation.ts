import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  eciToEcf,
  ecfToLookAngles,
  degreesToRadians,
} from "satellite.js";
import type { SatellitePass } from "./satellites";
import { azimuthToCompass } from "./satellites";

const RAD2DEG = 180 / Math.PI;

// satellite.js v5 types
interface SatRec {
  error: number;
  [key: string]: unknown;
}

interface EciVec3 {
  x: number;
  y: number;
  z: number;
}

export interface TLERecord {
  noradId: number;
  name: string;
  tle1: string;
  tle2: string;
  catalog: string;
}

export interface SatelliteRecord {
  noradId: number;
  name: string;
  satrec: SatRec;
  catalog: string;
  category: SatellitePass["category"];
}

export interface VisibleSatellite {
  noradId: number;
  name: string;
  azimuth: number;
  elevation: number;
  range: number;
  altitude: number;
  lat: number;
  lon: number;
  inSunlight: boolean;
  catalog: string;
  category: SatellitePass["category"];
}

const EARTH_RADIUS_KM = 6371;

function catalogToCategory(catalog: string, name: string): SatellitePass["category"] {
  if (name.includes("ISS (ZARYA)") || name.includes("CSS (TIANHE)")) return "iss";
  if (catalog === "stations") return "iss";
  if (catalog === "starlink") return "starlink";
  if (catalog.includes("debris")) return "debris";
  if (catalog === "1999-025" || catalog === "rocket-bodies") return "rocket-body";
  return "satellite";
}

// Parse TLE text (3-line format) into records
export function parseTLEText(text: string, catalog: string): TLERecord[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const records: TLERecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];

    if (!tle1.startsWith("1 ") || !tle2.startsWith("2 ")) continue;

    const noradId = parseInt(tle1.substring(2, 7).trim(), 10);
    if (isNaN(noradId)) continue;

    records.push({ noradId, name, tle1, tle2, catalog });
  }

  return records;
}

export function initSatellites(tles: TLERecord[]): SatelliteRecord[] {
  const sats: SatelliteRecord[] = [];

  for (const tle of tles) {
    try {
      const satrec = twoline2satrec(tle.tle1, tle.tle2);
      if (satrec.error !== 0) continue;

      sats.push({
        noradId: tle.noradId,
        name: tle.name,
        satrec: satrec as unknown as SatRec,
        catalog: tle.catalog,
        category: catalogToCategory(tle.catalog, tle.name),
      });
    } catch {
      // Skip bad TLEs
    }
  }

  return sats;
}

// Get look angles for a satellite at a given time
export function getLookAngles(
  satrec: SatRec,
  date: Date,
  obsLat: number,
  obsLon: number,
  obsAlt: number
): { azimuth: number; elevation: number; range: number; satAlt: number; satLat: number; satLon: number; eciPos: EciVec3 } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pv = propagate(satrec as any, date);
  if (!pv.position || typeof pv.position === "boolean") return null;

  const pos = pv.position as EciVec3;
  const gmst = gstime(date);
  const geo = eciToGeodetic(pos, gmst);

  const observerGd = {
    latitude: degreesToRadians(obsLat),
    longitude: degreesToRadians(obsLon),
    height: obsAlt,
  };

  const ecf = eciToEcf(pos, gmst);
  const look = ecfToLookAngles(observerGd, ecf);

  return {
    azimuth: RAD2DEG * (look.azimuth),
    elevation: RAD2DEG * (look.elevation),
    range: look.rangeSat,
    satAlt: geo.height,
    satLat: RAD2DEG * (geo.latitude),
    satLon: RAD2DEG * (geo.longitude),
    eciPos: pos,
  };
}

// Julian date calculation
function julianDate(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() + date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 + date.getUTCSeconds() / 86400;
  const a = Math.floor((14 - m) / 12);
  const y1 = y + 4800 - a;
  const m1 = m + 12 * a - 3;
  return d + Math.floor((153 * m1 + 2) / 5) + 365 * y1 +
    Math.floor(y1 / 4) - Math.floor(y1 / 100) + Math.floor(y1 / 400) - 32045.5;
}

// Sun position in ECI (simplified — good enough for shadow calculation)
function sunPositionECI(date: Date): EciVec3 {
  const jd = julianDate(date);

  const T = (jd - 2451545.0) / 36525.0;

  // Mean longitude and anomaly
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  const M = ((357.52911 + 35999.05029 * T) % 360) * Math.PI / 180;

  // Equation of center
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) +
    0.019993 * Math.sin(2 * M);

  // Sun's ecliptic longitude
  const lambda = (L0 + C) * Math.PI / 180;

  // Obliquity of ecliptic
  const epsilon = (23.439291 - 0.0130042 * T) * Math.PI / 180;

  // Distance in AU, convert to km
  const R = (1.000001018 * (1 - 0.016708634 * Math.cos(M))) * 149597870.7;

  // ECI coordinates
  const x = R * Math.cos(lambda);
  const y = R * Math.cos(epsilon) * Math.sin(lambda);
  const z = R * Math.sin(epsilon) * Math.sin(lambda);

  return { x, y, z };
}

// Check if satellite is in Earth's shadow (cylindrical model)
function isInSunlightCheck(satEci: EciVec3, date: Date): boolean {
  const sunEci = sunPositionECI(date);

  // Vector from Earth to satellite
  const satDist = Math.sqrt(satEci.x ** 2 + satEci.y ** 2 + satEci.z ** 2);

  // Normalize sun direction
  const sunDist = Math.sqrt(sunEci.x ** 2 + sunEci.y ** 2 + sunEci.z ** 2);
  const sunDir = { x: sunEci.x / sunDist, y: sunEci.y / sunDist, z: sunEci.z / sunDist };

  // Project satellite position onto sun direction
  const dot = satEci.x * sunDir.x + satEci.y * sunDir.y + satEci.z * sunDir.z;

  // If satellite is on the sun-side of Earth, it's lit
  if (dot > 0) return true;

  // Perpendicular distance from satellite to Earth-Sun line
  const projX = satEci.x - dot * sunDir.x;
  const projY = satEci.y - dot * sunDir.y;
  const projZ = satEci.z - dot * sunDir.z;
  const perpDist = Math.sqrt(projX ** 2 + projY ** 2 + projZ ** 2);

  // If perpendicular distance > Earth radius, satellite is lit
  // Use slightly larger radius to account for penumbra
  return perpDist > EARTH_RADIUS_KM * 1.02;

  // Suppress unused variable (satDist used conceptually for range check)
  void satDist;
}

// Get all satellites above the horizon
export function getVisibleSatellites(
  satellites: SatelliteRecord[],
  date: Date,
  obsLat: number,
  obsLon: number,
  obsAlt: number,
  minElevation: number = 0
): VisibleSatellite[] {
  const visible: VisibleSatellite[] = [];

  for (const sat of satellites) {
    const look = getLookAngles(sat.satrec, date, obsLat, obsLon, obsAlt);
    if (!look || look.elevation < minElevation) continue;

    const sunlit = isInSunlightCheck(look.eciPos, date);

    visible.push({
      noradId: sat.noradId,
      name: sat.name,
      azimuth: look.azimuth,
      elevation: look.elevation,
      range: look.range,
      altitude: look.satAlt,
      lat: look.satLat,
      lon: look.satLon,
      inSunlight: sunlit,
      catalog: sat.catalog,
      category: sat.category,
    });
  }

  return visible;
}

// Predict visible passes for a satellite over the next N hours
export function predictPasses(
  sat: SatelliteRecord,
  obsLat: number,
  obsLon: number,
  obsAlt: number,
  startDate: Date,
  hours: number,
  minMaxEl: number = 10
): SatellitePass[] {
  const passes: SatellitePass[] = [];
  const stepMs = 30_000;
  const endTime = startDate.getTime() + hours * 3600_000;

  let inPass = false;
  let passStart: { time: Date; az: number; el: number } | null = null;
  let passMax: { time: Date; az: number; el: number } = { time: startDate, az: 0, el: 0 };
  let passMaxEl = 0;

  for (let t = startDate.getTime(); t <= endTime; t += stepMs) {
    const date = new Date(t);
    const look = getLookAngles(sat.satrec, date, obsLat, obsLon, obsAlt);

    if (!look) continue;

    if (look.elevation > 0) {
      if (!inPass) {
        inPass = true;
        passStart = { time: date, az: look.azimuth, el: Math.max(0, look.elevation) };
        passMax = { time: date, az: look.azimuth, el: look.elevation };
        passMaxEl = look.elevation;
      }
      if (look.elevation > passMaxEl) {
        passMaxEl = look.elevation;
        passMax = { time: date, az: look.azimuth, el: look.elevation };
      }
    } else if (inPass && passStart) {
      if (passMaxEl >= minMaxEl) {
        let isVisible = false;
        for (let pt = passStart.time.getTime(); pt <= t; pt += stepMs) {
          const pDate = new Date(pt);
          const pLook = getLookAngles(sat.satrec, pDate, obsLat, obsLon, obsAlt);
          if (pLook && isInSunlightCheck(pLook.eciPos, pDate)) {
            isVisible = true;
            break;
          }
        }

        const duration = Math.round((t - passStart.time.getTime()) / 1000);

        passes.push({
          satid: sat.noradId,
          satname: sat.name,
          startAz: passStart.az,
          startAzCompass: azimuthToCompass(passStart.az),
          startEl: passStart.el,
          startUTC: Math.floor(passStart.time.getTime() / 1000),
          maxAz: passMax.az,
          maxAzCompass: azimuthToCompass(passMax.az),
          maxEl: passMax.el,
          maxUTC: Math.floor(passMax.time.getTime() / 1000),
          endAz: look.azimuth,
          endAzCompass: azimuthToCompass(look.azimuth),
          endEl: 0,
          endUTC: Math.floor(t / 1000),
          magnitude: null,
          duration,
          category: sat.category,
          isVisible,
        });
      }

      inPass = false;
      passStart = null;
      passMaxEl = 0;
    }
  }

  return passes;
}

// Predict passes for important objects
export function predictAllPasses(
  satellites: SatelliteRecord[],
  obsLat: number,
  obsLon: number,
  obsAlt: number,
  hours: number = 120
): SatellitePass[] {
  const passWorthy = satellites.filter(
    (s) =>
      s.catalog === "visual" ||
      s.catalog === "stations" ||
      s.category === "iss"
  );

  const allPasses: SatellitePass[] = [];
  const now = new Date();

  for (const sat of passWorthy.slice(0, 80)) {
    const passes = predictPasses(sat, obsLat, obsLon, obsAlt, now, hours, 10);
    allPasses.push(...passes);
  }

  return allPasses.sort((a, b) => a.startUTC - b.startUTC);
}
