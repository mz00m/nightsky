import { NextRequest, NextResponse } from "next/server";

// Rate limit: 5 geocode requests per minute per IP
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 5;

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

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json([], { status: 429 });
  }

  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.length < 2 || q.length > 200) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
      {
        headers: { "User-Agent": "nightsky-app (server proxy)" },
        next: { revalidate: 3600 }, // cache geocode results for 1 hour
      }
    );

    if (!res.ok) return NextResponse.json([]);

    const data = await res.json();

    // Only return the fields the client needs — strip everything else
    const results = (data as { display_name: string; lat: string; lon: string }[])
      .slice(0, 5)
      .map((r) => ({
        display_name: String(r.display_name || "").slice(0, 200),
        lat: String(r.lat),
        lon: String(r.lon),
      }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
