interface FloatingTextProps {
  amount: number;
  kind: "damage" | "heal";
  unit?: "HP" | "XP";
  anchor?: "boss" | "hero";
}

export default function FloatingText({
  amount,
  kind,
  unit = "HP",
  anchor = "boss",
}: FloatingTextProps) {
  const sign = kind === "damage" ? "-" : "+";
  const colorClass =
    unit === "XP" ? "text-xp" : kind === "damage" ? "text-hp" : "text-gold";
  const positionClass =
    unit === "XP"
      ? "right-3 top-2"
      : anchor === "hero"
        ? "left-6 bottom-12"
        : "left-1/2 top-2 -translate-x-1/2";

  return (
    <span
      aria-hidden="true"
      className={`floating-text pointer-events-none absolute z-10 font-display text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${positionClass} ${colorClass}`}
    >
      {sign}
      {amount} {unit}
    </span>
  );
}
