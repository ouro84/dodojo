"use client";

import { useState } from "react";
import type { ShareCardParams, ShareSource } from "@/lib/share-card";
import { shareCardSearchParams, pickShareStrategy } from "@/lib/share-card";
import { logShareEvent } from "@/app/actions/share";
import GameIcon from "@/components/ui/GameIcon";

interface ShareButtonProps {
  params: ShareCardParams;
  source: ShareSource;
}

type ShareStatus = "idle" | "loading" | "error";

// US-20 : bouton réutilisable (PerfectOverlay + carte de clôture du jour).
// Fetch la route de génération, puis partage natif OS > presse-papier >
// téléchargement (cf. pickShareStrategy). navigator.share annulé par
// l'utilisateur (AbortError) n'est pas une erreur — retour silencieux à idle.
export default function ShareButton({ params, source }: ShareButtonProps) {
  const [status, setStatus] = useState<ShareStatus>("idle");

  async function handleShare() {
    setStatus("loading");
    void logShareEvent("share_clicked", source, params.outcome);

    try {
      const qs = shareCardSearchParams(params);
      const response = await fetch(`/api/share-card?${qs.toString()}`);
      if (!response.ok) throw new Error("generation_failed");

      const blob = await response.blob();
      const file = new File([blob], "dodojo-victoire.png", { type: "image/png" });

      const canShareFiles =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      const canWriteClipboard =
        typeof navigator.clipboard?.write === "function" &&
        typeof window.ClipboardItem !== "undefined";

      const strategy = pickShareStrategy({ canShareFiles, canWriteClipboard });

      if (strategy === "native") {
        await navigator.share({
          files: [file],
          text: "Boss vaincu sur Dodojo — dodojo.vercel.app",
        });
        void logShareEvent("share_succeeded", source, params.outcome);
      } else if (strategy === "clipboard") {
        await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
        void logShareEvent("share_succeeded", source, params.outcome);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "dodojo-victoire.png";
        link.click();
        URL.revokeObjectURL(url);
        void logShareEvent("share_downloaded", source, params.outcome);
      }
      setStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void handleShare()}
        disabled={status === "loading"}
        className="inline-flex items-center gap-1.5 rounded-md border border-gold bg-surface px-4 py-2 font-display text-xs uppercase tracking-wide text-gold disabled:opacity-50"
      >
        {status === "loading" ? (
          "…"
        ) : (
          <>
            <GameIcon name="share" className="h-4 w-4" /> Partager
          </>
        )}
      </button>
      {status === "error" && (
        <p role="alert" className="text-xs text-alert">
          Partage impossible. Réessaie.
        </p>
      )}
    </div>
  );
}
