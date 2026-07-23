"use client";

import { useInstallPrompt } from "@/hooks/useInstallPrompt";

// CTA d'installation maison, ton pixel-art, affiché uniquement quand
// Chrome/Android a effectivement proposé l'installation (capture de
// `beforeinstallprompt`). Pas d'équivalent sur iOS (voir Manuel du Dojo,
// section #installation, pour les instructions manuelles).
export default function InstallCta() {
  const { canInstall, promptInstall } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void promptInstall();
      }}
      className="rounded-md border border-border bg-surface px-4 py-2 font-display text-xs uppercase tracking-wide text-gold"
    >
      📲 Installer Dodojo
    </button>
  );
}
