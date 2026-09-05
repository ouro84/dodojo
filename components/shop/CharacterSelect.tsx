"use client";

import { useRef, useState, useTransition } from "react";
import { HEROES, getHero, isHeroOwned, DEFAULT_HERO_ID } from "@/lib/heroes";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { getSkinsForHero } from "@/lib/hero-skins";
import { purchaseHero, equipHeroAndSkin, purchaseSkin } from "@/app/actions/shop";
import SkinCarousel from "@/components/shop/SkinCarousel";
import AchievementToast from "@/components/combat/AchievementToast";
import GameIcon from "@/components/ui/GameIcon";

// US-18/US-53 : écran de sélection de combattant façon VS Fighting.
// En-tête héros + carrousel 3D de tenues (issue #75) en haut, matrice
// compacte de héros en bas.
export function CharacterSelect({
  ownedIds,
  equippedId,
  ownedSkinIds,
  equippedSkinId,
  balance,
}: {
  ownedIds: string[];
  equippedId: string;
  ownedSkinIds: string[];
  equippedSkinId: string | null;
  balance: number;
}) {
  const [selectedId, setSelectedId] = useState(equippedId);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmSkin, setConfirmSkin] = useState<{ heroId: string; skinId: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [achievementQueue, setAchievementQueue] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const confirmHeroRef = useRef<HTMLDivElement>(null);
  const confirmSkinRef = useRef<HTMLDivElement>(null);
  useFocusTrap(confirmHeroRef, { active: confirmId !== null, onEscape: () => setConfirmId(null) });
  useFocusTrap(confirmSkinRef, { active: confirmSkin !== null, onEscape: () => setConfirmSkin(null) });

  const selected = getHero(selectedId) ?? getHero(DEFAULT_HERO_ID)!;
  const owned = isHeroOwned(selected.id, ownedIds);
  const equipped = selected.id === equippedId;
  const affordable = balance >= selected.price;

  function onAction() {
    setError(null);
    if (!owned && affordable) setConfirmId(selected.id);
  }

  function confirmPurchase() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    startTransition(async () => {
      const res = await purchaseHero(id);
      if (res.error) setError(res.error);
      const newAchievements = res.newAchievements;
      if (newAchievements?.length) {
        setAchievementQueue((prev) => [...prev, ...newAchievements]);
      }
    });
  }

  function onEquipSkin(skinId: string) {
    setError(null);
    startTransition(async () => {
      const res = await equipHeroAndSkin(selected.id, skinId);
      if (res.error) setError(res.error);
    });
  }

  function onRequestSkinPurchase(skinId: string) {
    setError(null);
    setConfirmSkin({ heroId: selected.id, skinId });
  }

  function confirmSkinPurchase() {
    const target = confirmSkin;
    setConfirmSkin(null);
    if (!target) return;
    startTransition(async () => {
      const res = await purchaseSkin(target.heroId, target.skinId);
      if (res.error) setError(res.error);
      const newAchievements = res.newAchievements;
      if (newAchievements?.length) {
        setAchievementQueue((prev) => [...prev, ...newAchievements]);
      }
    });
  }

  return (
    <div data-testid="character-select" className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between font-display text-xs uppercase tracking-wide text-ink">
        <span className="inline-flex items-center gap-1.5">
          <GameIcon name="sword" className="h-4 w-4" /> Choisis ton combattant
        </span>
        <span data-testid="gold-balance" className="inline-flex items-center gap-1 text-gold">
          <GameIcon name="gold" className="h-4 w-4" /> {balance}
        </span>
      </div>

      {/* En-tête héros : nom, élément, achat du héros lui-même si non possédé.
          Issue #183 : l'équipement (héros possédé) se fait désormais via le
          seul CTA du carrousel de tenues ci-dessous — deux boutons "Équiper"
          distincts sur le même écran (héros vs tenue) créaient une confusion
          réelle ("le bouton n'a aucun effet" quand le mauvais était cliqué). */}
      <div className="flex flex-col items-center gap-1">
        <div className="font-display text-sm uppercase tracking-wide text-ink">
          {selected.name}
        </div>
        <div className="text-xs text-muted">Élément : {selected.element}</div>
        {error && (
          <p role="alert" className="text-xs text-hp-text">
            {error}
          </p>
        )}
        {!owned && (
          <button
            type="button"
            data-testid="hero-cta"
            onClick={onAction}
            disabled={pending || !affordable}
            className="mt-1 inline-flex items-center gap-1.5 rounded border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
          >
            <GameIcon name="gold" className="h-4 w-4" />
            {affordable ? `${selected.price} · Débloquer` : selected.price}
          </button>
        )}
      </div>

      {/* Carrousel 3D de tenues (issue #75) — fusionne l'ancien Stage (gros
          héros statique) et la bande de pastilles de couleur. Navigable en
          lecture seule si le héros n'est pas possédé (Q19 du grilling). */}
      <SkinCarousel
        key={selected.id}
        hero={selected}
        heroOwned={owned}
        isHeroEquipped={equipped}
        equippedSkinId={equippedSkinId}
        ownedSkinIds={ownedSkinIds}
        balance={balance}
        pending={pending}
        onEquip={onEquipSkin}
        onRequestPurchase={onRequestSkinPurchase}
      />

      {/* Matrice */}
      <div className="mx-auto flex max-w-[240px] flex-wrap justify-center gap-1.5">
        {HEROES.map((h) => {
          const hOwned = isHeroOwned(h.id, ownedIds);
          const isSelected = h.id === selectedId;
          const isEquipped = h.id === equippedId;
          return (
            <button
              key={h.id}
              type="button"
              data-hero-cell={h.id}
              data-owned={hOwned}
              aria-pressed={isSelected}
              aria-label={h.name}
              onClick={() => {
                setSelectedId(h.id);
                setError(null);
              }}
              className={`h-11 w-11 overflow-hidden rounded border-2 bg-black/40 ${
                isEquipped
                  ? "border-xp"
                  : isSelected
                    ? "border-gold"
                    : "border-border"
              }`}
              // Issue #169 : brightness(0.4) sur bg-black/40 rendait le
              // portrait quasi noir uniforme — remonté pour garder la
              // silhouette lisible, le grayscale reste (convention roster
              // verrouillé, la forme prime sur la couleur pour un portrait).
              style={hOwned ? undefined : { filter: "grayscale(1) brightness(0.85)" }}
            >
              {/* Portrait : sprite rogné (vide transparent retiré), perso entier. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- mini-portrait pixel, next/image inutile */}
              <img
                src={`/sprites/mc/${h.slug}/portrait.png`}
                alt=""
                className="h-full w-full object-contain p-0.5 [image-rendering:pixelated]"
              />
            </button>
          );
        })}
      </div>

      {/* Modale de confirmation héros */}
      {confirmId && (
        <div
          ref={confirmHeroRef}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer l'achat"
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/60 p-4 text-center"
        >
          <p className="text-sm text-ink">
            Débloquer {getHero(confirmId)?.name} pour {getHero(confirmId)?.price} or ?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmPurchase}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-gold"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirmId(null)}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modale de confirmation tenue */}
      {confirmSkin && (
        <div
          ref={confirmSkinRef}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer l'achat de la tenue"
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/60 p-4 text-center"
        >
          <p className="text-sm text-ink">
            Débloquer la tenue{" "}
            {getSkinsForHero(confirmSkin.heroId).find((s) => s.id === confirmSkin.skinId)?.name}{" "}
            pour{" "}
            {getSkinsForHero(confirmSkin.heroId).find((s) => s.id === confirmSkin.skinId)?.price}{" "}
            or ?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmSkinPurchase}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-gold"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirmSkin(null)}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      <AchievementToast
        codes={achievementQueue}
        onDismissAll={() => setAchievementQueue([])}
      />
    </div>
  );
}
