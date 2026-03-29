export interface Location {
  latitude: number;
  longitude: number;
  name?: string;
}

export interface MoonData {
  phase: number; // 0-1 (0 = new, 0.5 = full)
  phaseName: string;
  illumination: number; // 0-100%
  rise: Date | null;
  set: Date | null;
  altitude: number; // current altitude in degrees
  isUp: boolean;
}

export interface PlanetData {
  name: string;
  isVisible: boolean;
  riseTime: string | null; // formatted time
  setTime: string | null;
  bestViewingTime: string | null;
  direction: string; // compass direction to look
  altitude: number; // degrees above horizon at best time
  brightness: string; // description
  color: string; // CSS color
  minBortleToSee: number; // minimum Bortle class needed
}

export interface ConstellationData {
  name: string;
  description: string;
  direction: string;
  bestMonth: number; // 1-12
  notableStars: string[];
  minBortleToSee: number;
}

export interface MeteorShower {
  name: string;
  peak: string; // date string
  peakStart: Date;
  peakEnd: Date;
  ratePerHour: number;
  parentBody: string;
  bestDirection: string;
  isActive: boolean;
  daysUntilPeak: number;
}

export interface SkyHighlight {
  title: string;
  description: string;
  type: "planet" | "moon" | "meteor" | "constellation" | "event";
  priority: number; // 1-10, higher = more notable
  visibleWithLightPollution: boolean;
  when: string;
  where: string;
}

export interface LightPollution {
  bortleClass: number; // 1-9
  bortleName: string;
  nakedEyeLimitMag: number;
  description: string;
  canSee: string[];
  cantSee: string[];
}

export interface SkyData {
  location: Location;
  date: Date;
  moon: MoonData;
  planets: PlanetData[];
  constellations: ConstellationData[];
  meteorShowers: MeteorShower[];
  highlights: SkyHighlight[];
  lightPollution: LightPollution;
  sunsetTime: string;
  sunriseTime: string;
  goldenHour: string;
  astronomicalTwilight: string;
}
