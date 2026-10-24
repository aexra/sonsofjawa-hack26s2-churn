interface NowBadgeProps {
  viewBox?: { x?: number; y?: number };
  value?: string;
}

const WIDTH = 52;
const HEIGHT = 18;

export function NowBadge({ viewBox, value }: NowBadgeProps) {
  const x = viewBox?.x ?? 0;
  const y = (viewBox?.y ?? 0) - HEIGHT / 2;
  return (
    <g>
      <rect x={x - WIDTH / 2} y={y} width={WIDTH} height={HEIGHT} rx={6} fill="var(--ca-ink)" />
      <text
        x={x}
        y={y + HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ca-canvas)"
        fontSize={11}
        fontWeight={600}
      >
        {value}
      </text>
    </g>
  );
}
