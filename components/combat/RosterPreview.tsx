"use client";

import { useState } from "react";
import Image from "next/image";
import type { Boss } from "@/lib/bosses";
import type { Background } from "@/lib/backgrounds";
import type { Hero } from "@/types";
import CharacterSprite, { type CharacterAnimState } from "./CharacterSprite";
import { heroSpriteMeta, bossSpriteMeta, type CharacterSpriteMeta } from "@/lib/sprite-metadata";

interface RosterPreviewProps {
  bosses: Boss[];
  backgrounds: Background[];
  heroes: Hero[];
}

const SPEEDS = [1, 0.25] as const;

// Cale l'attaque testée pour un personnage : boss -> "attack" unique,
// héros -> une des 4 attaques (atk1/atk2/atk3/sp_atk).
function attackAnimsFor(anims: Record<string, unknown>): string[] {
  const candidates = ["attack", "atk1", "atk2", "atk3", "sp_atk"];
  return candidates.filter((name) => anims[name] !== undefined);
}

// Panneau de calage réutilisé pour chaque héros et chaque boss (Task 3.6,
// issue #48) : force un état, une anim d'attaque et une vitesse, affiche
// l'impactFrame courante et flashe une bordure au moment exact de l'impact
// (onImpact de CharacterSprite) — sert à caler IMPACT_FRAME_OVERRIDES à l'œil.
function CalibrationStage({
  spriteBase,
  meta,
  baseHeight,
  flip,
  alt,
}: {
  spriteBase: string;
  meta: CharacterSpriteMeta;
  baseHeight: number;
  flip?: boolean;
  alt: string;
}) {
  const attackAnims = attackAnimsFor(meta.anims);
  const [state, setState] = useState<CharacterAnimState>("idle");
  const [attackAnim, setAttackAnim] = useState(attackAnims[0]);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [stateKey, setStateKey] = useState(0);
  const [flashing, setFlashing] = useState(false);

  const currentAnimName = state === "attack" ? attackAnim : state;
  const currentAnim = meta.anims[currentAnimName];

  function play(next: CharacterAnimState, anim?: string) {
    if (anim) setAttackAnim(anim);
    setState(next);
    setStateKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-black/30 p-2">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => play("idle")}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-faint"
        >
          idle
        </button>
        {attackAnims.map((anim) => (
          <button
            key={anim}
            type="button"
            onClick={() => play("attack", anim)}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-faint"
          >
            {anim}
          </button>
        ))}
        <button
          type="button"
          onClick={() => play("hurt")}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-faint"
        >
          hurt
        </button>
        <button
          type="button"
          onClick={() => play("death")}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-faint"
        >
          death
        </button>
        <div className="ml-auto flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                speed === s ? "bg-hp text-bg" : "border border-border text-faint"
              }`}
            >
              ×{s}
            </button>
          ))}
        </div>
      </div>
      <div
        className={`relative h-56 w-full overflow-hidden rounded border ${
          flashing ? "border-gold" : "border-transparent"
        }`}
      >
        {/* Ancrage identique à VersusScene (absolute bottom-2, centré) : le
            translateY interne de CharacterSprite pousse le sprite vers le bas
            depuis cette ligne de base, jamais depuis le haut d'un flex
            items-end (qui le ferait glisser hors de la boîte). */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <CharacterSprite
            spriteBase={spriteBase}
            meta={meta}
            baseHeight={baseHeight}
            state={state}
            attackAnim={attackAnim}
            stateKey={stateKey}
            flip={flip}
            alt={alt}
            speedMultiplier={speed}
            onImpact={() => {
              setFlashing(true);
              setTimeout(() => setFlashing(false), 150);
            }}
            className="[image-rendering:pixelated]"
          />
        </div>
      </div>
      <p className="text-[10px] text-faint">
        anim : {currentAnimName} · frames : {currentAnim?.frames ?? "—"} · impactFrame :{" "}
        {currentAnim?.impactFrame ?? "aucune"} · vitesse ×{speed}
      </p>
    </div>
  );
}

// Écran de test interne (chemin obscur, login requis, non listé). Permet de
// vérifier visuellement, boss par boss : (1) que le sprite idle s'extrait/rend
// correctement à la même hauteur que dans l'Arène réelle (h-24 boss / h-[88px]
// héros, cf. VersusScene), (2) la cohérence lore ↔ décors, (3) le calage des
// frames d'impact (Task 3.6, issue #48). Un héros au choix (global à toute la
// page) est posé à côté de chaque boss pour comparer les tailles côte à côte.
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
        Chaque panneau de calage permet de rejouer une anim et de repérer le
        moment exact de l&apos;impact (bordure dorée) pour caler
        IMPACT_FRAME_OVERRIDES.
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

      {hero && (
        <section className="flex flex-col gap-2">
          <span className="font-display text-sm text-ink">{hero.name} — calage</span>
          <CalibrationStage
            spriteBase={hero.spriteBase}
            meta={heroSpriteMeta(hero.slug)}
            baseHeight={88}
            alt={hero.name}
          />
        </section>
      )}

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
            {/* Issue #135 : miniature du bust utilisé par le VS card — permet
                de vérifier le cadrage tête/buste avant merge, sans lancer
                l'app en conditions réelles pour chaque boss. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- miniature fixe, next/image inutile */}
            <img
              src={`/sprites/bosses/${boss.slug}/bust.png`}
              alt={`Bust de ${boss.name}`}
              className="h-16 w-auto self-start border border-border [image-rendering:pixelated]"
            />
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
              {/* Issue #156 : même ancrage que VersusScene (25 % / 75 % sur la
                  silhouette idle). Sans ça cet écran de calage mentirait sur
                  le rendu réel de l'Arène et ne pourrait plus servir à valider
                  un ajout de boss. */}
              {hero && (
                <div
                  className="absolute bottom-2"
                  style={{
                    left: "25%",
                    transform: `translateX(-${heroSpriteMeta(hero.slug).idleAnchorX * 100}%)`,
                  }}
                >
                  <CharacterSprite
                    spriteBase={hero.spriteBase}
                    meta={heroSpriteMeta(hero.slug)}
                    baseHeight={88}
                    state="idle"
                    alt={hero.name}
                    className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
                  />
                </div>
              )}
              <div
                className="absolute bottom-2"
                style={{
                  left: "75%",
                  transform: `translateX(-${(flips[boss.id] ? 1 - bossMeta.idleAnchorX : bossMeta.idleAnchorX) * 100}%)`,
                }}
              >
                <CharacterSprite
                  spriteBase={boss.spriteBase}
                  meta={bossMeta}
                  baseHeight={96}
                  state="idle"
                  flip={flips[boss.id]}
                  alt={boss.name}
                  className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
                />
              </div>
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
            <CalibrationStage
              spriteBase={boss.spriteBase}
              meta={bossMeta}
              baseHeight={96}
              flip={flips[boss.id]}
              alt={boss.name}
            />
          </section>
        );
      })}
    </div>
  );
}
