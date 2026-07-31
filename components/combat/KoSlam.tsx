"use client";

// Texte « K.O. » qui claque pendant le fondu qui précède PerfectOverlay.
// Police BoldPixels : libellé court et en majuscules, seul usage autorisé
// (cf. ASSETS.md § Fonts). `.ko-burst` existe déjà dans globals.css, avec son
// variant reduced-motion.
export default function KoSlam() {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <span className="ko-burst font-display text-5xl uppercase tracking-widest text-ink drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]">
        K.O.
      </span>
    </div>
  );
}
