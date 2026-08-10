"use client";

import Image from "next/image";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

// CTA d'installation maison, ton pixel-art, affiché uniquement quand
// Chrome/Android a effectivement proposé l'installation (capture de
// `beforeinstallprompt`). Pas d'équivalent sur iOS (voir Le Guide,
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
      className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 font-display text-xs uppercase tracking-wide text-gold"
    >
      <Image src="/icons/icon-192.png" alt="" width={16} height={16} unoptimized />
      Installer Dodojo
    </button>
  );
}
