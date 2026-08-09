// Issue #75 : logique pure du carrousel 3D de tenues (Le Marché Noir). Extraite
// pour être testable sans dépendre de mesures de layout réelles (jsdom ne fait
// pas de vrai layout, getBoundingClientRect y renvoie toujours des zéros).

const MAX_ROTATE_DEG = 45;
const DEPTH_PX = 160;
const INWARD_TRANSLATE_PERCENT = 38;
const MIN_SCALE = 0.72;
const MIN_OPACITY = 0.35;
// Au-delà de cette distance du centre (en "largeurs de tenue"), la tenue est
// masquée : évite qu'une tenue lointaine ne bave visuellement dans la scène.
const VISIBLE_RANGE = 2;

export interface Carousel3DTransform {
  transform: string;
  opacity: number;
  zIndex: number;
}

// offset : distance signée de la tenue au centre, en "largeurs de tenue"
// (0 = centrée, +1 = immédiatement à droite, -1 = immédiatement à gauche...).
export function carousel3DTransform(offset: number): Carousel3DTransform {
  const abs = Math.min(Math.abs(offset), VISIBLE_RANGE);
  const sign = Math.sign(offset);
  const lean = Math.min(abs, 1); // au-delà de 1 tenue de distance, l'angle ne progresse plus — seules la profondeur et l'opacité continuent à évoluer
  const rotateY = -sign * lean * MAX_ROTATE_DEG;
  const translateZ = -abs * DEPTH_PX;
  const scale = Math.max(MIN_SCALE, 1 - abs * 0.22);
  const opacity = abs >= VISIBLE_RANGE ? 0 : Math.max(MIN_OPACITY, 1 - abs * 0.4);
  // translateX vers le CENTRE (signe opposé à `sign`) : le flex du carrousel
  // (slides à 60% de largeur, pas 100%) expose déjà une tranche de chaque
  // voisine, mais cette tranche tombe sur la marge vide du cadre du sprite
  // (le personnage est centré dans son cadre), pas sur le personnage
  // lui-même — vérifié en capture d'écran manuelle (issue #75). Tirer la
  // voisine vers le centre ramène le personnage dans la zone visible.
  const translateX = -sign * lean * INWARD_TRANSLATE_PERCENT;
  return {
    transform: `translateX(${translateX}%) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
    opacity,
    zIndex: 100 - Math.round(abs * 10),
  };
}

export type SkinCtaVariant = "equipped" | "equip" | "unlock" | "insufficient";

// Issue #187 (chasse aux emojis) : `label` ne porte plus l'emoji 🪙 en dur —
// `icon` indique au composant d'appel (GameIcon côté UI, lib/ reste sans
// dépendance React) l'icône à afficher devant le libellé, si besoin.
export interface SkinCtaState {
  label: string;
  disabled: boolean;
  variant: SkinCtaVariant;
  icon: "gold" | null;
}

export function skinCtaState({
  equipped,
  owned,
  price,
  balance,
}: {
  equipped: boolean;
  owned: boolean;
  price: number;
  balance: number;
}): SkinCtaState {
  if (equipped) return { label: "✓ Équipé", disabled: true, variant: "equipped", icon: null };
  if (owned) return { label: "Équiper", disabled: false, variant: "equip", icon: null };
  if (balance >= price) {
    return { label: `${price} · Débloquer`, disabled: false, variant: "unlock", icon: "gold" };
  }
  return { label: `${price} · Or insuffisant`, disabled: true, variant: "insufficient", icon: "gold" };
}

// Navigation d'index sans dépendre d'embla (testable en isolation). `loop`
// n'est vrai que pour le cas dégénéré à 2 tenues (issue #75, Q18) : swiper
// dans un sens ou l'autre doit alors basculer vers l'unique autre tenue.
export function stepCarouselIndex({
  current,
  direction,
  total,
  loop,
}: {
  current: number;
  direction: 1 | -1;
  total: number;
  loop: boolean;
}): number {
  if (total <= 1) return current;
  const next = current + direction;
  if (loop) return (next + total) % total;
  return Math.max(0, Math.min(total - 1, next));
}
