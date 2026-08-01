"use client";

import { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import TomorrowSection, { type TomorrowSectionProps } from "./TomorrowSection";

interface TomorrowSheetProps extends TomorrowSectionProps {
  onClose: () => void;
}

// Issue #147 : sheet plein écran ouverte depuis TomorrowBanner. Reprend
// TomorrowSection sans modification interne — seul le chrome (header, focus
// trap, fixed inset-0) est nouveau. Dismissable (onEscape fourni), contrairement
// à WakeUpRitual qui est volontairement bloquant.
export default function TomorrowSheet({ onClose, ...sectionProps }: TomorrowSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, { active: true, onEscape: onClose });

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Demain"
      className="tomorrow-sheet fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-[oklch(0.08_0_0_/_92%)] px-4 py-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-sm uppercase tracking-wide text-ink">Demain</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="text-lg text-muted hover:text-ink"
        >
          ×
        </button>
      </div>
      <TomorrowSection {...sectionProps} />
    </div>
  );
}
