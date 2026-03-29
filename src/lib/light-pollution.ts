import { LightPollution } from "./types";

const BORTLE_CLASSES: Record<
  number,
  {
    name: string;
    mag: number;
    description: string;
    canSee: string[];
    cantSee: string[];
  }
> = {
  1: {
    name: "Excellent dark sky",
    mag: 7.6,
    description:
      "Pristine skies. The zodiacal light, gegenschein, and zodiacal band are visible. The Milky Way casts shadows.",
    canSee: [
      "Milky Way structure & dust lanes",
      "Zodiacal light & gegenschein",
      "Faintest galaxies & nebulae",
      "All planets & meteor showers",
    ],
    cantSee: [],
  },
  2: {
    name: "Typical dark sky",
    mag: 7.1,
    description:
      "Nearly pristine. The Milky Way is highly structured. Airglow may be faintly visible along the horizon.",
    canSee: [
      "Milky Way with detail",
      "Faint nebulae & galaxies",
      "Zodiacal light",
      "All planets",
    ],
    cantSee: ["Zodiacal band"],
  },
  3: {
    name: "Rural sky",
    mag: 6.6,
    description:
      "Some light pollution evident at the horizon. The Milky Way still appears complex.",
    canSee: [
      "Milky Way clearly",
      "Bright nebulae (Orion, etc.)",
      "Andromeda Galaxy",
      "Most meteor showers",
    ],
    cantSee: ["Faint zodiacal features", "Dim galaxies"],
  },
  4: {
    name: "Rural/suburban transition",
    mag: 6.2,
    description:
      "Light pollution domes visible in several directions. Milky Way visible but lacks detail.",
    canSee: [
      "Milky Way (faint)",
      "Bright planets",
      "Major constellations",
      "Bright meteor showers",
    ],
    cantSee: ["Milky Way detail", "Faint nebulae"],
  },
  5: {
    name: "Suburban sky",
    mag: 5.6,
    description:
      "The Milky Way is very faint or invisible near the horizon. Light domes are obvious.",
    canSee: [
      "Bright planets",
      "Major constellations",
      "Moon details",
      "Bright meteor showers",
    ],
    cantSee: ["Milky Way (mostly)", "Faint deep-sky objects"],
  },
  6: {
    name: "Bright suburban sky",
    mag: 5.1,
    description:
      "The Milky Way is only visible near the zenith on the best nights. Sky glows whitish near the horizon.",
    canSee: [
      "Bright planets",
      "Major constellations",
      "Brightest stars",
      "Moon",
    ],
    cantSee: ["Milky Way", "Most nebulae", "Faint meteor showers"],
  },
  7: {
    name: "Suburban/urban transition",
    mag: 4.6,
    description:
      "The entire sky has a grayish-white hue. Strong light sources in all directions.",
    canSee: ["Bright planets", "Brightest stars", "Moon", "Orion's belt"],
    cantSee: ["Milky Way", "Most constellations fully", "Faint objects"],
  },
  8: {
    name: "City sky",
    mag: 4.1,
    description:
      "The sky glows white or orange. Only the brightest stars form constellations. Many people never see the Milky Way.",
    canSee: ["Moon", "Bright planets", "Brightest stars only"],
    cantSee: ["Milky Way", "Most stars", "Deep-sky objects"],
  },
  9: {
    name: "Inner-city sky",
    mag: 3.5,
    description:
      "The entire sky is lit up. Only the Moon, planets, and a few of the brightest stars are visible.",
    canSee: ["Moon", "Venus", "Jupiter", "Sirius & a few bright stars"],
    cantSee: ["Nearly everything else"],
  },
};

// Known dark-sky preserves and national parks (approximate centers)
const DARK_SKY_AREAS: {
  lat: number;
  lon: number;
  radius: number;
  bortle: number;
}[] = [
  { lat: 36.24, lon: -116.82, radius: 0.5, bortle: 1 }, // Death Valley
  { lat: 38.29, lon: -109.73, radius: 0.3, bortle: 2 }, // Natural Bridges, UT
  { lat: 32.18, lon: -104.44, radius: 0.2, bortle: 2 }, // Carlsbad Caverns
  { lat: 38.73, lon: -109.59, radius: 0.3, bortle: 2 }, // Canyonlands
  { lat: 36.87, lon: -111.51, radius: 0.3, bortle: 2 }, // Grand Canyon (North Rim)
  { lat: 37.59, lon: -112.18, radius: 0.3, bortle: 2 }, // Bryce Canyon
  { lat: 44.46, lon: -110.83, radius: 0.4, bortle: 2 }, // Yellowstone
  { lat: 31.92, lon: -109.89, radius: 0.2, bortle: 2 }, // Chiricahua, AZ
];

// Major cities for light pollution estimation
const CITIES: { lat: number; lon: number; pop: number; name: string }[] = [
  { lat: 40.71, lon: -74.01, pop: 8300000, name: "New York" },
  { lat: 34.05, lon: -118.24, pop: 3900000, name: "Los Angeles" },
  { lat: 41.88, lon: -87.63, pop: 2700000, name: "Chicago" },
  { lat: 29.76, lon: -95.37, pop: 2300000, name: "Houston" },
  { lat: 33.45, lon: -112.07, pop: 1600000, name: "Phoenix" },
  { lat: 29.42, lon: -98.49, pop: 1500000, name: "San Antonio" },
  { lat: 32.72, lon: -117.16, pop: 1400000, name: "San Diego" },
  { lat: 32.78, lon: -96.8, pop: 1300000, name: "Dallas" },
  { lat: 37.77, lon: -122.42, pop: 870000, name: "San Francisco" },
  { lat: 47.61, lon: -122.33, pop: 740000, name: "Seattle" },
  { lat: 39.74, lon: -104.99, pop: 715000, name: "Denver" },
  { lat: 42.36, lon: -71.06, pop: 700000, name: "Boston" },
  { lat: 36.17, lon: -115.14, pop: 640000, name: "Las Vegas" },
  { lat: 45.51, lon: -122.68, pop: 650000, name: "Portland" },
  { lat: 35.23, lon: -80.84, pop: 870000, name: "Charlotte" },
  { lat: 25.76, lon: -80.19, pop: 440000, name: "Miami" },
  { lat: 33.75, lon: -84.39, pop: 500000, name: "Atlanta" },
  { lat: 38.91, lon: -77.04, pop: 700000, name: "Washington DC" },
  { lat: 39.95, lon: -75.17, pop: 1600000, name: "Philadelphia" },
  { lat: 44.98, lon: -93.27, pop: 430000, name: "Minneapolis" },
  { lat: 30.27, lon: -97.74, pop: 960000, name: "Austin" },
  { lat: 36.16, lon: -86.78, pop: 690000, name: "Nashville" },
  { lat: 35.47, lon: -97.52, pop: 680000, name: "Oklahoma City" },
  { lat: 27.95, lon: -82.46, pop: 400000, name: "Tampa" },
  { lat: 38.63, lon: -90.2, pop: 300000, name: "St. Louis" },
  { lat: 39.1, lon: -84.51, pop: 310000, name: "Cincinnati" },
  { lat: 40.44, lon: -80.0, pop: 300000, name: "Pittsburgh" },
  { lat: 43.04, lon: -87.91, pop: 590000, name: "Milwaukee" },
  { lat: 35.78, lon: -78.64, pop: 470000, name: "Raleigh" },
  { lat: 21.31, lon: -157.86, pop: 350000, name: "Honolulu" },
  { lat: 61.22, lon: -149.9, pop: 290000, name: "Anchorage" },
  // International
  { lat: 51.51, lon: -0.13, pop: 9000000, name: "London" },
  { lat: 48.86, lon: 2.35, pop: 2200000, name: "Paris" },
  { lat: 35.68, lon: 139.69, pop: 14000000, name: "Tokyo" },
  { lat: 22.32, lon: 114.17, pop: 7500000, name: "Hong Kong" },
  { lat: 19.43, lon: -99.13, pop: 9200000, name: "Mexico City" },
  { lat: 43.65, lon: -79.38, pop: 2930000, name: "Toronto" },
  { lat: 49.28, lon: -123.12, pop: 680000, name: "Vancouver" },
  { lat: -33.87, lon: 151.21, pop: 5300000, name: "Sydney" },
];

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateBortleClass(lat: number, lon: number): number {
  // Check if in a known dark-sky area
  for (const area of DARK_SKY_AREAS) {
    const dist = haversineDistance(lat, lon, area.lat, area.lon);
    if (dist < area.radius * 111) {
      return area.bortle;
    }
  }

  // Calculate cumulative light pollution from nearby cities
  let totalLight = 0;
  for (const city of CITIES) {
    const dist = haversineDistance(lat, lon, city.lat, city.lon);
    if (dist < 300) {
      // Cities contribute light up to ~300km
      const falloff = Math.exp(-dist / (15 + (city.pop / 1000000) * 10));
      totalLight += (city.pop / 100000) * falloff;
    }
  }

  // Map total light to Bortle class
  if (totalLight > 50) return 9;
  if (totalLight > 25) return 8;
  if (totalLight > 12) return 7;
  if (totalLight > 6) return 6;
  if (totalLight > 3) return 5;
  if (totalLight > 1.5) return 4;
  if (totalLight > 0.5) return 3;
  if (totalLight > 0.1) return 2;
  return 1;
}

export function getLightPollutionData(bortleClass: number): LightPollution {
  const data = BORTLE_CLASSES[bortleClass] || BORTLE_CLASSES[5];
  return {
    bortleClass,
    bortleName: data.name,
    nakedEyeLimitMag: data.mag,
    description: data.description,
    canSee: data.canSee,
    cantSee: data.cantSee,
  };
}

export function getNearestCityName(lat: number, lon: number): string | null {
  let nearest = null;
  let minDist = Infinity;
  for (const city of CITIES) {
    const dist = haversineDistance(lat, lon, city.lat, city.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = city.name;
    }
  }
  return minDist < 200 ? nearest : null;
}
