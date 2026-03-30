export interface SatellitePass {
  satid: number;
  satname: string;
  startAz: number;
  startAzCompass: string;
  startEl: number;
  startUTC: number;
  maxAz: number;
  maxAzCompass: string;
  maxEl: number;
  maxUTC: number;
  endAz: number;
  endAzCompass: string;
  endEl: number;
  endUTC: number;
  magnitude: number | null;
  duration: number; // seconds
  category: "iss" | "starlink" | "rocket-body" | "satellite" | "debris";
  isVisible: boolean;
}

export interface SatelliteAbove {
  satid: number;
  satname: string;
  intDesignator: string;
  launchDate: string;
  satlat: number;
  satlng: number;
  satalt: number;
  category: string;
}

// NORAD IDs for key objects
export const TRACKED_OBJECTS = {
  ISS: 25544,
  TIANGONG: 48274,
  HST: 20580, // Hubble
} as const;

// CelesTrak catalog names
export const CELESTRAK_CATALOGS = {
  VISUAL: "visual",
  STATIONS: "stations",
  STARLINK: "starlink",
  COSMOS_DEBRIS: "cosmos-2251-debris",
  IRIDIUM_DEBRIS: "iridium-33-debris",
  ROCKET_BODIES: "1999-025",
} as const;

export function formatPassTime(utcSeconds: number): string {
  const date = new Date(utcSeconds * 1000);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatPassDate(utcSeconds: number): string {
  const date = new Date(utcSeconds * 1000);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === now.toDateString()) return "Tonight";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function getPassBrightness(magnitude: number | null): string {
  if (magnitude === null) return "Unknown brightness";
  if (magnitude < -3) return "Extremely bright — unmistakable";
  if (magnitude < -1) return "Very bright — brighter than most stars";
  if (magnitude < 1) return "Bright — easy to spot";
  if (magnitude < 3) return "Moderate — visible in dark skies";
  return "Faint — needs good conditions";
}

export function getCategoryLabel(category: SatellitePass["category"]): string {
  switch (category) {
    case "iss": return "Space Station";
    case "starlink": return "Starlink";
    case "rocket-body": return "Rocket Body";
    case "debris": return "Debris";
    case "satellite": return "Satellite";
  }
}

export function getCategoryColor(category: SatellitePass["category"]): string {
  switch (category) {
    case "iss": return "#5b8def";
    case "starlink": return "#a78bfa";
    case "rocket-body": return "#f59e0b";
    case "debris": return "#ef4444";
    case "satellite": return "#8892ab";
  }
}

export function azimuthToCompass(az: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return directions[Math.round(az / 22.5) % 16];
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
