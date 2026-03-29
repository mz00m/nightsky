import SunCalc from "suncalc";
import {
  Location,
  MoonData,
  PlanetData,
  ConstellationData,
  MeteorShower,
  SkyHighlight,
  SkyData,
} from "./types";
import {
  estimateBortleClass,
  getLightPollutionData,
  getNearestCityName,
} from "./light-pollution";

function formatTime(date: Date | null): string | null {
  if (!date || isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getMoonPhaseName(phase: number): string {
  if (phase < 0.03 || phase > 0.97) return "New Moon";
  if (phase < 0.22) return "Waxing Crescent";
  if (phase < 0.28) return "First Quarter";
  if (phase < 0.47) return "Waxing Gibbous";
  if (phase < 0.53) return "Full Moon";
  if (phase < 0.72) return "Waning Gibbous";
  if (phase < 0.78) return "Last Quarter";
  return "Waning Crescent";
}

function getMoonData(date: Date, lat: number, lon: number): MoonData {
  const illumination = SunCalc.getMoonIllumination(date);
  const times = SunCalc.getMoonTimes(date, lat, lon);
  const position = SunCalc.getMoonPosition(date, lat, lon);
  const altitudeDeg = (position.altitude * 180) / Math.PI;

  return {
    phase: illumination.phase,
    phaseName: getMoonPhaseName(illumination.phase),
    illumination: Math.round(illumination.fraction * 100),
    rise: times.rise || null,
    set: times.set || null,
    altitude: altitudeDeg,
    isUp: altitudeDeg > 0,
  };
}

// Approximate planet visibility using simplified orbital mechanics.
// This gives a reasonable "is it visible tonight" for bright planets.
function getPlanetData(date: Date, lat: number, lon: number): PlanetData[] {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  const month = date.getMonth();
  const year = date.getFullYear();

  // Julian date for approximate planet positions
  const jd =
    367 * year -
    Math.floor((7 * (year + Math.floor((month + 10) / 12))) / 4) +
    Math.floor((275 * (month + 1)) / 9) +
    date.getDate() +
    1721013.5;

  // Approximate synodic periods and current visibility windows
  // These are simplified but give reasonable results for naked-eye viewing
  const planets: PlanetData[] = [];

  // Mercury - visible near horizon around elongation periods
  const mercuryElongation = ((jd * 4.15201) % 360 + 360) % 360;
  const mercuryVisible =
    (mercuryElongation > 15 && mercuryElongation < 28) ||
    (mercuryElongation > 160 && mercuryElongation < 200);
  const mercuryEvening = mercuryElongation > 15 && mercuryElongation < 28;
  planets.push({
    name: "Mercury",
    isVisible: mercuryVisible,
    riseTime: mercuryEvening ? null : formatTime(new Date(date.getTime() - 3600000)),
    setTime: mercuryEvening ? formatTime(new Date(date.getTime() + 7200000)) : null,
    bestViewingTime: mercuryEvening ? "Just after sunset" : "Just before sunrise",
    direction: mercuryEvening ? "West, low on horizon" : "East, low on horizon",
    altitude: 12,
    brightness: "Moderately bright, -0.5 mag",
    color: "var(--color-planet-mercury)",
    minBortleToSee: 5,
  });

  // Venus - the "evening star" or "morning star"
  const venusPhase = ((jd * 1.60214) % 584 + 584) % 584;
  const venusEvening = venusPhase > 0 && venusPhase < 263;
  const venusVisible = !(venusPhase > 250 && venusPhase < 290); // not during conjunction
  planets.push({
    name: "Venus",
    isVisible: venusVisible,
    riseTime: venusEvening ? null : formatTime(new Date(date.getTime() - 7200000)),
    setTime: venusEvening ? formatTime(new Date(date.getTime() + 10800000)) : null,
    bestViewingTime: venusEvening ? "Early evening" : "Pre-dawn",
    direction: venusEvening ? "West" : "East",
    altitude: 25,
    brightness: "Unmistakable, brightest object after Moon (-4.4 mag)",
    color: "var(--color-planet-venus)",
    minBortleToSee: 9,
  });

  // Mars - visible when not near conjunction with the Sun
  const marsPhase = ((jd * 0.524) % 780 + 780) % 780;
  const marsVisible = marsPhase > 60 && marsPhase < 720;
  const marsOpposition = marsPhase > 350 && marsPhase < 430;
  planets.push({
    name: "Mars",
    isVisible: marsVisible,
    riseTime: marsVisible ? formatTime(new Date(date.getTime() - 14400000)) : null,
    setTime: marsVisible ? formatTime(new Date(date.getTime() + 18000000)) : null,
    bestViewingTime: marsOpposition ? "All night — near opposition" : "Late evening",
    direction: marsOpposition ? "South" : "Southeast",
    altitude: marsOpposition ? 55 : 30,
    brightness: marsOpposition
      ? "Brilliant reddish, -2.0 mag"
      : "Moderate reddish, +1.0 mag",
    color: "var(--color-planet-mars)",
    minBortleToSee: 7,
  });

  // Jupiter - visible most of the year except near conjunction
  const jupiterPhase = ((jd * 0.0831) % 398.88 + 398.88) % 398.88;
  const jupiterVisible = jupiterPhase > 30 && jupiterPhase < 370;
  planets.push({
    name: "Jupiter",
    isVisible: jupiterVisible,
    riseTime: jupiterVisible ? formatTime(new Date(date.getTime() - 10800000)) : null,
    setTime: jupiterVisible ? formatTime(new Date(date.getTime() + 14400000)) : null,
    bestViewingTime: "Late evening, highest in sky",
    direction: "South to Southwest",
    altitude: 45,
    brightness: "Very bright, -2.5 mag",
    color: "var(--color-planet-jupiter)",
    minBortleToSee: 9,
  });

  // Saturn - dimmer but distinctive
  const saturnPhase = ((jd * 0.0335) % 378.09 + 378.09) % 378.09;
  const saturnVisible = saturnPhase > 30 && saturnPhase < 350;
  planets.push({
    name: "Saturn",
    isVisible: saturnVisible,
    riseTime: saturnVisible ? formatTime(new Date(date.getTime() - 7200000)) : null,
    setTime: saturnVisible ? formatTime(new Date(date.getTime() + 10800000)) : null,
    bestViewingTime: "Mid-evening",
    direction: "Southeast to South",
    altitude: 35,
    brightness: "Steady golden glow, +0.7 mag",
    color: "var(--color-planet-saturn)",
    minBortleToSee: 7,
  });

  return planets;
}

function getSeasonalConstellations(
  month: number,
  lat: number
): ConstellationData[] {
  const isNorthern = lat > 0;

  const allConstellations: ConstellationData[] = [
    // Winter (Dec-Feb in northern hemisphere)
    {
      name: "Orion",
      description:
        "The Hunter — the most recognizable constellation. Look for three stars in a row forming the belt.",
      direction: "South",
      bestMonth: 1,
      notableStars: ["Betelgeuse (red supergiant)", "Rigel (blue-white)"],
      minBortleToSee: 8,
    },
    {
      name: "Canis Major",
      description:
        "The Great Dog, following Orion. Home to Sirius, the brightest star in our sky.",
      direction: "Southeast, below Orion",
      bestMonth: 2,
      notableStars: ["Sirius (brightest star, -1.46 mag)"],
      minBortleToSee: 9,
    },
    {
      name: "Taurus",
      description:
        "The Bull, with the bright orange star Aldebaran as its eye and the Pleiades star cluster nearby.",
      direction: "South to Southwest",
      bestMonth: 1,
      notableStars: [
        "Aldebaran (orange giant)",
        "Pleiades cluster (Seven Sisters)",
      ],
      minBortleToSee: 7,
    },
    {
      name: "Gemini",
      description:
        "The Twins — two bright stars Castor and Pollux mark the heads of the twin brothers.",
      direction: "Overhead to South",
      bestMonth: 2,
      notableStars: ["Castor", "Pollux"],
      minBortleToSee: 6,
    },
    // Spring (Mar-May)
    {
      name: "Leo",
      description:
        "The Lion — look for a backward question mark forming the head and mane.",
      direction: "South, high in sky",
      bestMonth: 4,
      notableStars: ["Regulus (at the base of the sickle)"],
      minBortleToSee: 6,
    },
    {
      name: "Virgo",
      description:
        "The Maiden — a large constellation anchored by bright Spica.",
      direction: "Southeast",
      bestMonth: 5,
      notableStars: ["Spica (blue-white)"],
      minBortleToSee: 6,
    },
    {
      name: "Ursa Major",
      description:
        "The Great Bear — contains the Big Dipper, the most famous asterism. Follow the pointer stars to find Polaris.",
      direction: "North, high in sky",
      bestMonth: 4,
      notableStars: ["Dubhe", "Merak (pointer stars to Polaris)"],
      minBortleToSee: 7,
    },
    {
      name: "Boötes",
      description:
        "The Herdsman — kite-shaped, anchored by brilliant orange Arcturus. Follow the arc of the Big Dipper's handle.",
      direction: "East to overhead",
      bestMonth: 5,
      notableStars: ["Arcturus (4th brightest star)"],
      minBortleToSee: 7,
    },
    // Summer (Jun-Aug)
    {
      name: "Scorpius",
      description:
        "The Scorpion — look for red Antares as its heart. Best seen low in the southern sky.",
      direction: "South, low on horizon",
      bestMonth: 7,
      notableStars: ["Antares (red supergiant, the Rival of Mars)"],
      minBortleToSee: 7,
    },
    {
      name: "Lyra",
      description:
        "The Lyre — small but easy to find thanks to brilliant Vega. Part of the Summer Triangle.",
      direction: "Overhead",
      bestMonth: 8,
      notableStars: ["Vega (5th brightest star, part of Summer Triangle)"],
      minBortleToSee: 8,
    },
    {
      name: "Cygnus",
      description:
        "The Swan — also known as the Northern Cross. Deneb marks the tail. Part of the Summer Triangle.",
      direction: "Overhead, in the Milky Way",
      bestMonth: 8,
      notableStars: ["Deneb (part of Summer Triangle)"],
      minBortleToSee: 7,
    },
    {
      name: "Sagittarius",
      description:
        "The Archer — the center of our galaxy lies in this direction. Look for the Teapot asterism.",
      direction: "South, low",
      bestMonth: 7,
      notableStars: ["The Teapot asterism", "Galactic center direction"],
      minBortleToSee: 6,
    },
    // Autumn (Sep-Nov)
    {
      name: "Pegasus",
      description:
        "The Winged Horse — the Great Square of Pegasus is a key autumn landmark.",
      direction: "South, high in sky",
      bestMonth: 10,
      notableStars: ["Great Square of Pegasus"],
      minBortleToSee: 5,
    },
    {
      name: "Andromeda",
      description:
        "Home to M31, the Andromeda Galaxy — the most distant object visible to the naked eye (2.5 million light-years).",
      direction: "Northeast to overhead",
      bestMonth: 11,
      notableStars: [
        "Andromeda Galaxy (M31, visible as fuzzy patch)",
        "Almach (double star)",
      ],
      minBortleToSee: 4,
    },
    {
      name: "Cassiopeia",
      description:
        "The Queen — an unmistakable W shape, circumpolar from northern latitudes (visible all year).",
      direction: "North, opposite the Big Dipper",
      bestMonth: 11,
      notableStars: ["Schedar", "Distinctive W pattern"],
      minBortleToSee: 7,
    },
    {
      name: "Perseus",
      description:
        "The Hero — home to the famous variable star Algol (the Demon Star) and the Double Cluster.",
      direction: "Northeast",
      bestMonth: 12,
      notableStars: ["Algol (eclipsing binary, dims every 2.87 days)", "Mirfak"],
      minBortleToSee: 5,
    },
  ];

  // Filter to constellations visible in the current season (+/- 2 months)
  const seasonWindow = isNorthern ? 0 : 6; // offset for southern hemisphere
  return allConstellations.filter((c) => {
    const adjustedMonth = ((c.bestMonth + seasonWindow - 1) % 12) + 1;
    const diff = Math.abs(month + 1 - adjustedMonth);
    const wrappedDiff = Math.min(diff, 12 - diff);
    return wrappedDiff <= 2;
  });
}

function getMeteorShowers(date: Date): MeteorShower[] {
  const year = date.getFullYear();
  const showers: MeteorShower[] = [
    {
      name: "Quadrantids",
      peak: `Jan 3-4`,
      peakStart: new Date(year, 0, 3),
      peakEnd: new Date(year, 0, 4),
      ratePerHour: 120,
      parentBody: "Asteroid 2003 EH1",
      bestDirection: "Northeast, radiant in Boötes",
      isActive: false,
      daysUntilPeak: 0,
    },
    {
      name: "Lyrids",
      peak: `Apr 22-23`,
      peakStart: new Date(year, 3, 22),
      peakEnd: new Date(year, 3, 23),
      ratePerHour: 18,
      parentBody: "Comet Thatcher",
      bestDirection: "Overhead, radiant near Vega",
      isActive: false,
      daysUntilPeak: 0,
    },
    {
      name: "Eta Aquariids",
      peak: `May 5-6`,
      peakStart: new Date(year, 4, 5),
      peakEnd: new Date(year, 4, 6),
      ratePerHour: 50,
      parentBody: "Halley's Comet",
      bestDirection: "East, before dawn",
      isActive: false,
      daysUntilPeak: 0,
    },
    {
      name: "Perseids",
      peak: `Aug 12-13`,
      peakStart: new Date(year, 7, 12),
      peakEnd: new Date(year, 7, 13),
      ratePerHour: 100,
      parentBody: "Comet Swift-Tuttle",
      bestDirection: "Northeast, radiant in Perseus",
      isActive: false,
      daysUntilPeak: 0,
    },
    {
      name: "Orionids",
      peak: `Oct 21-22`,
      peakStart: new Date(year, 9, 21),
      peakEnd: new Date(year, 9, 22),
      ratePerHour: 20,
      parentBody: "Halley's Comet",
      bestDirection: "South, radiant near Orion",
      isActive: false,
      daysUntilPeak: 0,
    },
    {
      name: "Leonids",
      peak: `Nov 17-18`,
      peakStart: new Date(year, 10, 17),
      peakEnd: new Date(year, 10, 18),
      ratePerHour: 15,
      parentBody: "Comet Tempel-Tuttle",
      bestDirection: "East, radiant in Leo",
      isActive: false,
      daysUntilPeak: 0,
    },
    {
      name: "Geminids",
      peak: `Dec 14-15`,
      peakStart: new Date(year, 11, 14),
      peakEnd: new Date(year, 11, 15),
      ratePerHour: 150,
      parentBody: "Asteroid 3200 Phaethon",
      bestDirection: "Overhead, radiant in Gemini",
      isActive: false,
      daysUntilPeak: 0,
    },
  ];

  return showers.map((s) => {
    const msPerDay = 86400000;
    const daysUntil = Math.round(
      (s.peakStart.getTime() - date.getTime()) / msPerDay
    );
    // Active if within 7 days of peak
    const isActive = Math.abs(daysUntil) <= 7;
    // If peak has passed this year, check next year
    const adjustedDays = daysUntil < -30 ? daysUntil + 365 : daysUntil;
    return { ...s, isActive, daysUntilPeak: adjustedDays };
  });
}

function generateHighlights(
  moon: MoonData,
  planets: PlanetData[],
  constellations: ConstellationData[],
  meteorShowers: MeteorShower[],
  bortleClass: number
): SkyHighlight[] {
  const highlights: SkyHighlight[] = [];

  // Moon highlights
  if (moon.phaseName === "Full Moon") {
    highlights.push({
      title: "Full Moon tonight",
      description: `The Moon is ${moon.illumination}% illuminated. Beautiful to observe but will wash out faint objects.`,
      type: "moon",
      priority: 8,
      visibleWithLightPollution: true,
      when: "All night",
      where: moon.isUp ? "Currently above the horizon" : "Rises later tonight",
    });
  } else if (moon.phaseName === "New Moon") {
    highlights.push({
      title: "New Moon — darkest skies",
      description:
        "No moonlight tonight. Best conditions for faint objects, galaxies, and meteor watching.",
      type: "moon",
      priority: 9,
      visibleWithLightPollution: true,
      when: "All night",
      where: "Look up — the sky is at its darkest",
    });
  } else if (moon.illumination > 0) {
    highlights.push({
      title: `${moon.phaseName} (${moon.illumination}%)`,
      description:
        moon.illumination < 50
          ? "A slender crescent — look for earthshine illuminating the dark portion."
          : `The Moon is ${moon.illumination}% lit. Good viewing conditions for brighter objects.`,
      type: "moon",
      priority: moon.illumination < 30 ? 7 : 5,
      visibleWithLightPollution: true,
      when: moon.rise ? `Rises at ${formatTime(moon.rise)}` : "Currently up",
      where:
        moon.altitude > 0
          ? `Currently ${Math.round(moon.altitude)}° above the horizon`
          : "Below the horizon now",
    });
  }

  // Planet highlights
  const visiblePlanets = planets.filter(
    (p) => p.isVisible && p.minBortleToSee >= bortleClass
  );
  for (const planet of visiblePlanets) {
    highlights.push({
      title: `${planet.name} is visible`,
      description: planet.brightness,
      type: "planet",
      priority: planet.name === "Venus" ? 8 : planet.name === "Jupiter" ? 7 : 5,
      visibleWithLightPollution: planet.minBortleToSee >= 7,
      when: planet.bestViewingTime || "Tonight",
      where: planet.direction,
    });
  }

  // Meteor shower highlights
  const activeShowers = meteorShowers.filter((s) => s.isActive);
  for (const shower of activeShowers) {
    highlights.push({
      title: `${shower.name} meteor shower`,
      description: `Up to ${shower.ratePerHour} meteors/hour from ${shower.parentBody}. ${shower.daysUntilPeak === 0 ? "Peak tonight!" : `Peak in ${Math.abs(shower.daysUntilPeak)} days.`}`,
      type: "meteor",
      priority: shower.daysUntilPeak === 0 ? 10 : 7,
      visibleWithLightPollution: bortleClass <= 5,
      when: "Best after midnight, when the radiant is highest",
      where: shower.bestDirection,
    });
  }

  // Upcoming showers
  const upcomingShowers = meteorShowers
    .filter((s) => !s.isActive && s.daysUntilPeak > 0 && s.daysUntilPeak < 45)
    .sort((a, b) => a.daysUntilPeak - b.daysUntilPeak);
  if (upcomingShowers.length > 0) {
    const next = upcomingShowers[0];
    highlights.push({
      title: `${next.name} in ${next.daysUntilPeak} days`,
      description: `Up to ${next.ratePerHour} meteors/hour. Mark your calendar for ${next.peak}.`,
      type: "meteor",
      priority: 4,
      visibleWithLightPollution: false,
      when: next.peak,
      where: next.bestDirection,
    });
  }

  // Constellation highlights — pick top 2-3 for the season
  const visibleConstellations = constellations
    .filter((c) => c.minBortleToSee >= bortleClass)
    .slice(0, 3);
  for (const c of visibleConstellations) {
    highlights.push({
      title: c.name,
      description: c.description,
      type: "constellation",
      priority:
        c.name === "Orion" ? 7 : c.name === "Scorpius" ? 6 : 4,
      visibleWithLightPollution: c.minBortleToSee >= 7,
      when: "Best after full darkness",
      where: c.direction,
    });
  }

  // Sort by priority
  return highlights.sort((a, b) => b.priority - a.priority);
}

export function calculateSkyData(location: Location, date: Date): SkyData {
  const { latitude, longitude } = location;

  // Sun times
  const sunTimes = SunCalc.getTimes(date, latitude, longitude);
  const sunsetStr = formatTime(sunTimes.sunset);
  const sunriseStr = formatTime(sunTimes.sunrise);
  const goldenHourStr = formatTime(sunTimes.goldenHour);
  const twilightStr = formatTime(sunTimes.night); // astronomical twilight end

  // Moon
  const moon = getMoonData(date, latitude, longitude);

  // Planets
  const planets = getPlanetData(date, latitude, longitude);

  // Constellations
  const constellations = getSeasonalConstellations(date.getMonth(), latitude);

  // Meteor showers
  const meteorShowers = getMeteorShowers(date);

  // Light pollution
  const bortleClass = estimateBortleClass(latitude, longitude);
  const lightPollution = getLightPollutionData(bortleClass);

  // Location name
  const nearestCity = getNearestCityName(latitude, longitude);
  const namedLocation: Location = {
    ...location,
    name: nearestCity
      ? `Near ${nearestCity}`
      : `${latitude.toFixed(2)}°${latitude >= 0 ? "N" : "S"}, ${Math.abs(longitude).toFixed(2)}°${longitude >= 0 ? "E" : "W"}`,
  };

  // Highlights
  const highlights = generateHighlights(
    moon,
    planets,
    constellations,
    meteorShowers,
    bortleClass
  );

  return {
    location: namedLocation,
    date,
    moon,
    planets,
    constellations,
    meteorShowers,
    highlights,
    lightPollution,
    sunsetTime: sunsetStr || "N/A",
    sunriseTime: sunriseStr || "N/A",
    goldenHour: goldenHourStr || "N/A",
    astronomicalTwilight: twilightStr || "N/A",
  };
}
