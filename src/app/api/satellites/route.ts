import { NextRequest, NextResponse } from "next/server";
import { SatellitePass } from "@/lib/satellites";

const N2YO_API_KEY = process.env.N2YO_API_KEY;
const N2YO_BASE = "https://api.n2yo.com/rest/v1/satellite";

// Simple in-memory rate limiter: max 10 requests per minute per IP
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count++;
  return true;
}

// Periodically clean up stale entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (now > entry.resetAt) rateLimit.delete(ip);
  }
}, RATE_LIMIT_WINDOW);

function validateCoords(
  lat: number,
  lng: number,
  alt: number
): string | null {
  if (isNaN(lat) || lat < -90 || lat > 90) return "Invalid latitude";
  if (isNaN(lng) || lng < -180 || lng > 180) return "Invalid longitude";
  if (isNaN(alt) || alt < 0 || alt > 50000) return "Invalid altitude";
  return null;
}

interface N2YOPass {
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
  mag?: number;
  duration?: number;
}

interface N2YOAbove {
  satid: number;
  satname: string;
  intDesignator: string;
  launchDate: string;
  satlat: number;
  satlng: number;
  satalt: number;
}

interface N2YOPassResponse {
  info: { satid: number; satname: string; passescount: number };
  passes?: N2YOPass[];
}

interface N2YOAboveResponse {
  info: { category: string; satcount: number };
  above?: N2YOAbove[];
}

type SatCategory = SatellitePass["category"];

async function fetchPasses(
  satid: number,
  lat: number,
  lng: number,
  alt: number,
  days: number,
  category: SatCategory
): Promise<SatellitePass[]> {
  if (!N2YO_API_KEY) return [];

  const url = `${N2YO_BASE}/visualpasses/${satid}/${lat}/${lng}/${alt}/${days}/300/&apiKey=${N2YO_API_KEY}`;

  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return [];
    const data: N2YOPassResponse = await res.json();
    if (!data.passes) return [];

    return data.passes.map((p) => ({
      satid: data.info.satid,
      satname: data.info.satname,
      startAz: p.startAz,
      startAzCompass: p.startAzCompass,
      startEl: p.startEl,
      startUTC: p.startUTC,
      maxAz: p.maxAz,
      maxAzCompass: p.maxAzCompass,
      maxEl: p.maxEl,
      maxUTC: p.maxUTC,
      endAz: p.endAz,
      endAzCompass: p.endAzCompass,
      endEl: p.endEl,
      endUTC: p.endUTC,
      magnitude: p.mag ?? null,
      duration: p.duration ?? (p.endUTC - p.startUTC),
      category,
      isVisible: true,
    }));
  } catch {
    return [];
  }
}

async function fetchAbove(
  lat: number,
  lng: number,
  alt: number,
  categoryId: number
): Promise<N2YOAbove[]> {
  if (!N2YO_API_KEY) return [];

  const searchRadius = 70;
  const url = `${N2YO_BASE}/above/${lat}/${lng}/${alt}/${searchRadius}/${categoryId}/&apiKey=${N2YO_API_KEY}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data: N2YOAboveResponse = await res.json();
    return data.above || [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute.", passes: [], above: [] },
      { status: 429 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const alt = parseFloat(searchParams.get("alt") || "0");
  const mode = searchParams.get("mode") || "passes";

  // Input validation
  const validationError = validateCoords(lat, lng, alt);
  if (validationError) {
    return NextResponse.json(
      { error: validationError, passes: [], above: [] },
      { status: 400 }
    );
  }

  if (mode !== "passes" && mode !== "above") {
    return NextResponse.json(
      { error: "Invalid mode", passes: [], above: [] },
      { status: 400 }
    );
  }

  if (!N2YO_API_KEY) {
    return NextResponse.json(
      { error: "Satellite tracking is not available", passes: [], above: [] },
      { status: 200 }
    );
  }

  if (mode === "above") {
    const [brightSats, rocketBodies, debris] = await Promise.all([
      fetchAbove(lat, lng, alt, 1),
      fetchAbove(lat, lng, alt, 8),
      fetchAbove(lat, lng, alt, 50),
    ]);

    return NextResponse.json({
      above: {
        bright: brightSats.slice(0, 20),
        rocketBodies: rocketBodies.slice(0, 20),
        debris: debris.slice(0, 20),
      },
      timestamp: Date.now(),
    });
  }

  const days = 5;
  const [issPasses, tiangongPasses] = await Promise.all([
    fetchPasses(25544, lat, lng, alt, days, "iss"),
    fetchPasses(48274, lat, lng, alt, days, "satellite"),
  ]);

  let starlinkPasses: SatellitePass[] = [];
  try {
    const starlinkAbove = await fetchAbove(lat, lng, alt, 52);
    if (starlinkAbove.length > 0) {
      const starlinkIds = starlinkAbove.slice(0, 3).map((s) => s.satid);
      const starlinkResults = await Promise.all(
        starlinkIds.map((id) => fetchPasses(id, lat, lng, alt, 2, "starlink"))
      );
      starlinkPasses = starlinkResults.flat();
    }
  } catch {
    // Starlink data is bonus
  }

  let rocketPasses: SatellitePass[] = [];
  try {
    const rocketAbove = await fetchAbove(lat, lng, alt, 8);
    if (rocketAbove.length > 0) {
      const rocketIds = rocketAbove.slice(0, 2).map((s) => s.satid);
      const rocketResults = await Promise.all(
        rocketIds.map((id) => fetchPasses(id, lat, lng, alt, 2, "rocket-body"))
      );
      rocketPasses = rocketResults.flat();
    }
  } catch {
    // Rocket body data is bonus
  }

  const allPasses = [
    ...issPasses,
    ...tiangongPasses,
    ...starlinkPasses,
    ...rocketPasses,
  ].sort((a, b) => a.startUTC - b.startUTC);

  return NextResponse.json({
    passes: allPasses,
    timestamp: Date.now(),
  });
}
