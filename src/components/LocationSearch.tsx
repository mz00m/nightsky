"use client";

import { useState, useRef } from "react";
import { Location } from "@/lib/types";

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function LocationSearch({
  onSelect,
  currentName,
}: {
  onSelect: (location: Location) => void;
  currentName?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(value)}`,
          { headers: { "User-Agent": "nightsky-app" } }
        );
        const data: SearchResult[] = await res.json();
        setResults(data);
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 300);
  }

  function selectResult(result: SearchResult) {
    const name = result.display_name.split(",")[0];
    onSelect({
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      name,
    });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-accent-blue hover:text-text-primary transition-colors cursor-pointer"
      >
        {currentName || "Set location"} ✎
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="Search city or place..."
        autoFocus
        onBlur={() => {
          // Delay to allow click on results
          setTimeout(() => {
            if (results.length === 0) setOpen(false);
          }, 200);
        }}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent-blue"
      />
      {searching && (
        <span className="absolute right-3 top-2.5 text-xs text-text-dim">
          ...
        </span>
      )}
      {results.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg overflow-hidden z-50 shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                onMouseDown={() => selectResult(r)}
                className="w-full text-left px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-light hover:text-text-primary transition-colors cursor-pointer"
              >
                {r.display_name.length > 60
                  ? r.display_name.slice(0, 60) + "…"
                  : r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
