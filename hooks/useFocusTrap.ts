import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseFocusTrapOptions {
  active: boolean;
  onEscape?: () => void;
}

// Point d'entrée unique pour tout overlay bloquant de l'app (audit #67, PR2).
// `onEscape` omis = overlay non-dismissable (WakeUpRitual, cf. CLAUDE.md) ;
// fourni = fermeture standard sur Echap.
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, onEscape }: UseFocusTrapOptions,
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    (focusables()[0] ?? container).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusables();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [active, containerRef, onEscape]);
}
