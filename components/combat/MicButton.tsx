"use client";

import { useCallback } from "react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { sanitizeTranscript } from "@/lib/speech";

interface MicButtonProps {
  disabled?: boolean;
  onTranscript: (title: string) => void;
  // Issue #116 : MicButton est monté deux fois sur le même écran (formulaire
  // du jour + section "Demain" via AddTaskForm) — libellé distinct requis,
  // même raison que submitLabel sur AddTaskForm (régression e2e constatée).
  label?: string;
}

export default function MicButton({
  disabled = false,
  onTranscript,
  label = "Dicter une tâche",
}: MicButtonProps) {
  const handleResult = useCallback(
    (raw: string) => {
      const clean = sanitizeTranscript(raw);
      if (clean) onTranscript(clean);
    },
    [onTranscript],
  );

  const { status, isSupported, errorMessage, start, stop } = useSpeechToText({
    onResult: handleResult,
  });

  if (!isSupported) return null;

  const isListening = status === "listening";

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        disabled={disabled}
        aria-label={isListening ? "Arrêter l'écoute" : label}
        aria-pressed={isListening}
        onClick={isListening ? stop : start}
        className={`shrink-0 rounded-md border border-border bg-surface p-3.5 text-ink disabled:opacity-40 ${
          isListening ? "mic-listening border-hp" : ""
        }`}
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="1" width="4" height="8" rx="2" />
          <path d="M4 7v1a4 4 0 0 0 8 0V7h1v1a5 5 0 0 1-4.5 4.97V15h2v1H5.5v-1h2v-2.03A5 5 0 0 1 3 8V7h1z" />
        </svg>
      </button>
      {status === "error" && errorMessage && (
        <span role="alert" className="absolute top-full left-0 mt-1 w-max max-w-[20ch] text-xs text-alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
