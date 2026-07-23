"use client";

import { useState, useTransition } from "react";
import { HEROES, getHero, isHeroOwned, DEFAULT_HERO_ID } from "@/lib/heroes";
import { getSkinsForHero, isSkinOwned, defaultSkinIdFor } from "@/lib/hero-skins";
import {
  equipHero,
  purchaseHero,
  equipSkin,
  purchaseSkin,
} from "@/app/actions/shop";
import HeroIdle from "@/components/combat/HeroIdle";

// US-18/US-53 : écran de sélection de combattant façon VS Fighting. Stage
// (héros + idle + bande tenues) en haut, matrice compacte en bas.
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
  const [selectedSkinId, setSelectedSkinId] = useState(
    () => equippedSkinId ?? defaultSkinIdFor(equippedId),
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmSkin, setConfirmSkin] = useState<{ heroId: string; skinId: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = getHero(selectedId) ?? getHero(DEFAULT_HERO_ID)!;
  const owned = isHeroOwned(selected.id, ownedIds);
  const equipped = selected.id === equippedId;
  const affordable = balance >= selected.price;

  // Quand la sélection de héros change, réinitialise la tenue prévisualisée :
  // l'équipée s'il s'agit du héros actif, sinon sa tenue par défaut. Ajustement
  // pendant le rendu (pas d'effet) pour éviter un rendu en cascade —
  // react-hooks/set-state-in-effect (cf. PushReminderToggle, US-11).
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setSelectedSkinId(
      selectedId === equippedId
        ? (equippedSkinId ?? defaultSkinIdFor(selectedId))
        : defaultSkinIdFor(selectedId),
    );
  }

  function onAction() {
    setError(null);
    if (equipped) return;
    if (owned) {
      startTransition(async () => {
        const res = await equipHero(selected.id);
        if (res.error) setError(res.error);
      });
    } else if (affordable) {
      setConfirmId(selected.id);
    }
  }

  function confirmPurchase() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    startTransition(async () => {
      const res = await purchaseHero(id);
      if (res.error) setError(res.error);
    });
  }

  function onSkinAction(skinId: string) {
    setError(null);
    if (!owned) return;
    const skinOwned = isSkinOwned(skinId, selected.id, ownedSkinIds);
    const isEquippedSkin =
      selected.id === equippedId && (equippedSkinId ?? defaultSkinIdFor(selected.id)) === skinId;
    if (isEquippedSkin) return;
    if (skinOwned) {
      startTransition(async () => {
        const res = await equipSkin(selected.id, skinId);
        if (res.error) setError(res.error);
      });
      return;
    }
    const skin = getSkinsForHero(selected.id).find((s) => s.id === skinId);
    if (skin && balance >= skin.price) {
      setConfirmSkin({ heroId: selected.id, skinId });
    }
  }

  function confirmSkinPurchase() {
    const target = confirmSkin;
    setConfirmSkin(null);
    if (!target) return;
    startTransition(async () => {
      const res = await purchaseSkin(target.heroId, target.skinId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div data-testid="character-select" className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between font-display text-xs uppercase tracking-wide text-ink">
        <span>⚔️ Choisis ton combattant</span>
        <span data-testid="gold-balance" className="text-gold">
          🪙 {balance}
        </span>
      </div>

      {/* Stage */}
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/40 p-4">
        <HeroIdle hero={selected} skinId={selectedSkinId} locked={!owned} className="h-28" />
        <div className="font-display text-sm uppercase tracking-wide text-ink">
          {selected.name}
        </div>
        <div className="text-xs text-muted">Élément : {selected.element}</div>
        {error && (
          <p role="alert" className="text-xs text-hp">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onAction}
          disabled={pending || equipped || (!owned && !affordable)}
          className="mt-1 rounded border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {equipped
            ? "✓ Équipé"
            : owned
              ? "Équiper"
              : affordable
                ? `🪙 ${selected.price} · Débloquer`
                : `🪙 ${selected.price}`}
        </button>
      </div>

      {/* Bande tenues (US-53) — active seulement si le héros est possédé */}
      <div
        className="flex flex-wrap justify-center gap-1.5"
        aria-disabled={!owned}
        title={owned ? undefined : "Débloque le héros d'abord"}
      >
        {getSkinsForHero(selected.id).map((skin) => {
          const skinOwned = isSkinOwned(skin.id, selected.id, ownedSkinIds);
          const isEquippedSkin =
            selected.id === equippedId &&
            (equippedSkinId ?? defaultSkinIdFor(selected.id)) === skin.id;
          const isSelectedSkin = skin.id === selectedSkinId;
          return (
            <button
              key={skin.id}
              type="button"
              data-skin-swatch={skin.id}
              data-owned={skinOwned}
              aria-pressed={isSelectedSkin}
              aria-label={skin.name}
              disabled={!owned}
              onClick={() => {
                setSelectedSkinId(skin.id);
                onSkinAction(skin.id);
              }}
              className={`h-6 w-6 rounded-full border-2 disabled:opacity-40 ${
                isEquippedSkin ? "border-xp" : isSelectedSkin ? "border-gold" : "border-border"
              }`}
              style={{
                backgroundColor: skin.swatchColor,
                filter: owned && !skinOwned ? "grayscale(1) brightness(0.5)" : undefined,
              }}
            />
          );
        })}
      </div>

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
              style={hOwned ? undefined : { filter: "grayscale(1) brightness(0.4)" }}
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
          role="dialog"
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
          role="dialog"
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
    </div>
  );
}
