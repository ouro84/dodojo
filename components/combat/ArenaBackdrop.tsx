import Image from "next/image";

interface ArenaBackdropProps {
  backgroundPath: string;
}

// Issue #167 : fond étendu desktop (rail → bord du viewport), derrière le
// cabinet centré (.arena-shell, app/globals.css). Réutilise le décor RÉEL du
// jour (background.publicPath, résolu par resolveDailyBoss parmi les 16
// variantes / 7 thèmes de lib/backgrounds.ts) — jamais un asset fixe : sinon
// le fond étendu se désynchronise du boss/décor affiché dans VersusScene dès
// qu'un autre thème que celui testé au moment de l'implémentation sort.
// Masqué <1024px (mobile inchangé). object-cover, jamais de blur/
// backdrop-filter (interdit par DESIGN.md — la profondeur de ce système est
// plate, jamais floutée).
export default function ArenaBackdrop({ backgroundPath }: ArenaBackdropProps) {
  return (
    <>
      <Image
        src={backgroundPath}
        alt=""
        fill
        sizes="100vw"
        data-testid="arena-backdrop"
        className="hidden object-cover [image-rendering:pixelated] lg:block"
      />
      <div className="absolute inset-0 hidden bg-gradient-to-b from-black/10 via-black/45 to-black/75 lg:block" />
    </>
  );
}
