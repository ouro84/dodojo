"use client";

import { useState } from "react";
import Image from "next/image";
import type { Boss } from "@/lib/bosses";
import type { Background } from "@/lib/backgrounds";
import IdleSprite from "./IdleSprite";

interface RosterPreviewProps {
  bosses: Boss[];
  backgrounds: Background[];
}

// Écran de test interne (chemin obscur, login requis, non listé). Permet de
// vérifier visuellement, boss par boss : (1) que le sprite idle s'extrait/rend
// correctement, (2) la cohérence lore ↔ décors. Chaque boss peut être posé sur
// n'importe quel décor ; les décors cohérents (catalogue) sont surlignés.
export default function RosterPreview({ bosses, backgrounds }: RosterPreviewProps) {
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      bosses.map((b) => {
        const first =
          backgrounds.find((bg) => b.backgroundThemes.includes(bg.theme)) ??
          backgrounds[0];
        return [b.id, first.id];
      }),
    ),
  );
  const [flips, setFlips] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(bosses.map((b) => [b.id, b.flip])),
  );

  const bgById = new Map(backgrounds.map((b) => [b.id, b]));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted">
        {bosses.length} boss · {backgrounds.length} décors. Décors cohérents en
        surbrillance ; clique n&apos;importe quel décor pour tester la combinaison.
      </p>
      {bosses.map((boss) => {
        const bgId = selected[boss.id];
        const bg = bgById.get(bgId);
        return (
          <section key={boss.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-sm text-ink">{boss.name}</span>
              <span className="text-[10px] text-faint">
                {boss.id} · {boss.idleFrameCount} frames
              </span>
            </div>
            <p className="text-[11px] text-muted">{boss.lore}</p>
            <div className="relative h-48 w-full overflow-hidden rounded-lg border border-border">
              {bg && (
                <Image
                  src={bg.publicPath}
                  alt=""
                  fill
                  sizes="336px"
                  className="object-cover [image-rendering:pixelated]"
                />
              )}
              <IdleSprite
                framePrefix={boss.idleFramePrefix}
                frameCount={boss.idleFrameCount}
                flip={flips[boss.id]}
                alt={boss.name}
                className="absolute bottom-2 right-6 h-32 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
              />
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-ink">
                {bg?.name ?? bgId}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFlips((f) => ({ ...f, [boss.id]: !f[boss.id] }))
                }
                className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-ink"
              >
                flip : {flips[boss.id] ? "ON" : "OFF"} (catalogue : {boss.flip ? "ON" : "OFF"})
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {backgrounds.map((b) => {
                const coherent = boss.backgroundThemes.includes(b.theme);
                const active = b.id === bgId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      setSelected((s) => ({ ...s, [boss.id]: b.id }))
                    }
                    className={`rounded px-2 py-1 text-[10px] ${
                      active
                        ? "bg-hp text-bg"
                        : coherent
                          ? "border border-hp text-hp"
                          : "border border-border text-faint"
                    }`}
                  >
                    {coherent ? "★ " : ""}
                    {b.name}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
