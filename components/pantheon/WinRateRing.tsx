// US-10 (A1) : anneau de win-rate (victoires / jours joués), SVG pur, statique.
interface WinRateRingProps {
  ratio: number; // 0..1
}

export default function WinRateRing({ ratio }: WinRateRingProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const size = 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = clamped * circumference;
  const pct = Math.round(clamped * 100);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-20 w-20"
      role="img"
      aria-label={`Taux de victoire ${pct} %`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="text-border"
        stroke="currentColor"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        className="text-gold"
        stroke="currentColor"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-ink font-display text-lg"
      >
        {pct}%
      </text>
    </svg>
  );
}
