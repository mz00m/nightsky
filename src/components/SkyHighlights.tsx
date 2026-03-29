"use client";

import { SkyHighlight } from "@/lib/types";

const TYPE_ICONS: Record<SkyHighlight["type"], string> = {
  planet: "◉",
  moon: "☽",
  meteor: "✦",
  constellation: "✧",
  event: "◈",
};

const TYPE_COLORS: Record<SkyHighlight["type"], string> = {
  planet: "text-accent-gold",
  moon: "text-accent-silver",
  meteor: "text-accent-blue",
  constellation: "text-text-secondary",
  event: "text-accent-gold",
};

export function SkyHighlights({
  highlights,
  bortleClass,
}: {
  highlights: SkyHighlight[];
  bortleClass: number;
}) {
  // Split into visible from your location vs. need darker skies
  const visible = highlights.filter((h) => h.visibleWithLightPollution);
  const needDarkerSkies = highlights.filter(
    (h) => !h.visibleWithLightPollution
  );

  return (
    <div className="space-y-6">
      {visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((h, i) => (
            <HighlightCard key={`${h.title}-${i}`} highlight={h} index={i} />
          ))}
        </div>
      )}

      {needDarkerSkies.length > 0 && bortleClass > 4 && (
        <div className="mt-8">
          <p className="text-xs uppercase tracking-wider text-text-dim mb-3">
            With darker skies
          </p>
          <div className="space-y-3 opacity-60">
            {needDarkerSkies.slice(0, 3).map((h, i) => (
              <HighlightCard
                key={`dark-${h.title}-${i}`}
                highlight={h}
                index={i}
                dimmed
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HighlightCard({
  highlight,
  index,
  dimmed = false,
}: {
  highlight: SkyHighlight;
  index: number;
  dimmed?: boolean;
}) {
  const icon = TYPE_ICONS[highlight.type];
  const colorClass = TYPE_COLORS[highlight.type];

  return (
    <div
      className={`
        p-4 rounded-lg border border-border bg-surface/50
        animate-fade-in-delay-${Math.min(index, 3)}
        ${dimmed ? "opacity-60" : ""}
      `}
    >
      <div className="flex items-start gap-3">
        <span className={`text-lg ${colorClass} mt-0.5`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-text-primary font-medium">{highlight.title}</h3>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            {highlight.description}
          </p>
          <div className="flex gap-4 mt-2 text-xs text-text-dim">
            <span>{highlight.when}</span>
            <span>·</span>
            <span>{highlight.where}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
