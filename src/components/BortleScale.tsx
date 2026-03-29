"use client";

import { LightPollution } from "@/lib/types";

export function BortleScale({
  lightPollution,
}: {
  lightPollution: LightPollution;
}) {
  const { bortleClass, bortleName, description, canSee, cantSee } =
    lightPollution;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3
            className="text-lg text-text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Light Pollution
          </h3>
          <span className="text-text-secondary text-sm">
            Bortle Class {bortleClass}
          </span>
        </div>
        <p className="text-text-secondary text-sm mb-3">{bortleName}</p>
      </div>

      {/* Bortle scale bar */}
      <div className="relative">
        <div className="bortle-bar h-2 rounded-full w-full" />
        <div
          className="absolute top-0 w-3 h-3 rounded-full border-2 border-text-primary bg-midnight -translate-y-[2px]"
          style={{ left: `${((bortleClass - 1) / 8) * 100}%` }}
        />
        <div className="flex justify-between mt-2 text-[10px] text-text-dim">
          <span>Pristine</span>
          <span>Inner city</span>
        </div>
      </div>

      <p className="text-text-secondary text-sm leading-relaxed">
        {description}
      </p>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-dim mb-2">
            Visible from here
          </p>
          <ul className="space-y-1">
            {canSee.map((item) => (
              <li
                key={item}
                className="text-sm text-text-secondary flex items-start gap-1.5"
              >
                <span className="text-accent-gold mt-0.5 text-xs">●</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        {cantSee.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-text-dim mb-2">
              Too faint to see
            </p>
            <ul className="space-y-1">
              {cantSee.map((item) => (
                <li
                  key={item}
                  className="text-sm text-text-dim flex items-start gap-1.5"
                >
                  <span className="mt-0.5 text-xs">○</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
