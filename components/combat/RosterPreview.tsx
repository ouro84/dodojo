"use client";

import { useState } from "react";
import Image from "next/image";
import type { Boss } from "@/lib/bosses";
import type { Background } from "@/lib/backgrounds";
import type { Hero } from "@/types";
import CharacterSprite from "./CharacterSprite";
import { heroSpriteMeta, bossSpriteMeta } from "@/lib/sprite-metadata";

interface RosterPreviewProps {
  bosses: Boss[];
  backgrounds: Background[];
  heroes: Hero[];
}

// Écran de test interne (chemin obscur, login requis, non listé). Permet de
// vérifier visuellement, boss par boss : (1) que le sprite idle s'extrait/rend
// correctement à la même hauteur que dans l'Arène réelle (h-24 boss / h-[88px]
// héros, cf. VersusScene), (2) la cohérence lore ↔ décors. Chaque boss peut
// être posé sur n'importe quel décor ; les décors cohérents (catalogue) sont
// surlignés. Un héros au choix (global à toute la page) est posé à côté de
// chaque boss pour comparer les tailles côte à côte.
export default function RosterPreview({ bosses, backgrounds, heroes }: RosterPreviewProps) {
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
  const [heroId, setHeroId] = useState(heroes[0]?.id ?? "");

  const bgById = new Map(backgrounds.map((b) => [b.id, b]));
  const hero = heroes.find((h) => h.id === heroId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted">
        {bosses.length} boss · {backgrounds.length} décors. Décors cohérents en
        surbrillance ; clique n&apos;importe quel décor pour tester la combinaison.
      </p>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-faint">Héros affiché</span>
        <div className="flex flex-wrap gap-1">
          {heroes.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHeroId(h.id)}
              className={`rounded px-2 py-1 text-[10px] ${
                h.id === heroId
                  ? "bg-hp text-bg"
                  : "border border-border text-faint"
              }`}
            >
              {h.name}
            </button>
          ))}
        </div>
      </div>
      {bosses.map((boss) => {
        const bgId = selected[boss.id];
        const bg = bgById.get(bgId);
        const bossMeta = bossSpriteMeta(boss.slug);
        return (
          <section key={boss.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-sm text-ink">{boss.name}</span>
              <span className="text-[10px] text-faint">
                {boss.id} · {bossMeta.anims.idle.frames} frames
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
              {hero && (
                <CharacterSprite
                  spriteBase={hero.spriteBase}
                  meta={heroSpriteMeta(hero.slug)}
                  baseHeight={88}
                  state="idle"
                  alt={hero.name}
                  className="absolute bottom-2 left-4 [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
                />
              )}
              <CharacterSprite
                spriteBase={boss.spriteBase}
                meta={bossMeta}
                baseHeight={96}
                state="idle"
                flip={flips[boss.id]}
                alt={boss.name}
                className="absolute bottom-2 right-6 [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
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
