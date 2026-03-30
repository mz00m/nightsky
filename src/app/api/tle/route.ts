import { NextRequest, NextResponse } from "next/server";

// In-memory TLE cache: catalog → { data, fetchedAt }
const tleCache = new Map<string, { data: string; fetchedAt: number }>();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// In-flight fetch deduplication
const inFlight = new Map<string, Promise<string>>();

// Allowed catalogs
const ALLOWED_CATALOGS = new Set([
  "visual",
  "stations",
  "starlink",
  "cosmos-2251-debris",
  "iridium-33-debris",
  "1999-025",
  "active",
]);

// Rate limiting
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (now > entry.resetAt) rateLimit.delete(ip);
  }
}, RATE_LIMIT_WINDOW);

async function fetchCatalog(catalog: string): Promise<string> {
  // Check cache
  const cached = tleCache.get(catalog);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  // Deduplicate concurrent requests for the same catalog
  const existing = inFlight.get(catalog);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(catalog)}&FORMAT=tle`;
      const res = await fetch(url, {
        headers: { "User-Agent": "nightsky-app/1.0 (satellite tracker)" },
      });

      if (!res.ok) {
        // Return cached data even if stale, or empty
        return cached?.data || "";
      }

      const data = await res.text();
      tleCache.set(catalog, { data, fetchedAt: Date.now() });
      return data;
    } catch {
      return cached?.data || "";
    } finally {
      inFlight.delete(catalog);
    }
  })();

  inFlight.set(catalog, promise);
  return promise;
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const catalogsParam = request.nextUrl.searchParams.get("catalogs") || "visual,stations";
  const requestedCatalogs = catalogsParam
    .split(",")
    .map((c) => c.trim())
    .filter((c) => ALLOWED_CATALOGS.has(c));

  if (requestedCatalogs.length === 0) {
    return NextResponse.json({ error: "No valid catalogs requested" }, { status: 400 });
  }

  // Fetch all requested catalogs in parallel
  const results = await Promise.all(
    requestedCatalogs.map(async (catalog) => {
      const data = await fetchCatalog(catalog);
      return { catalog, data };
    })
  );

  // Return as { catalog: tleText } map
  const tleData: Record<string, string> = {};
  for (const { catalog, data } of results) {
    tleData[catalog] = data;
  }

  return NextResponse.json(
    { tles: tleData, timestamp: Date.now() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=7200",
      },
    }
  );
}
