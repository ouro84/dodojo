interface FloatingTextProps {
  amount: number;
  kind: "damage" | "heal";
}

export default function FloatingText({ amount, kind }: FloatingTextProps) {
  const sign = kind === "damage" ? "-" : "+";
  const colorClass = kind === "damage" ? "text-hp" : "text-gold";

  return (
    <span
      aria-hidden="true"
      className={`floating-text pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 font-display text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] ${colorClass}`}
    >
      {sign}
      {amount} HP
    </span>
  );
}
