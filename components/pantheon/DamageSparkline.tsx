// US-10 (A1) : sparkline SVG pure des dégâts des N derniers jours. Aucune
// animation → compatible prefers-reduced-motion par nature. Serveur-render OK.
interface DamageSparklineProps {
  values: number[];
}

export default function DamageSparkline({ values }: DamageSparklineProps) {
  if (values.length < 2) {
    return (
      <p className="text-xs text-faint">Pas encore assez de jours pour tracer.</p>
    );
  }

  const width = 240;
  const height = 48;
  const max = Math.max(...values, 1);
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * stepX},${height - (v / max) * (height - 4) - 2}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-12 w-full"
      role="img"
      aria-label={`Dégâts des ${values.length} derniers jours`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-hp"
      />
    </svg>
  );
}
