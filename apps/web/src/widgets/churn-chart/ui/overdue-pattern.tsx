export function OverduePattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      width={6}
      height={6}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(-45)"
    >
      <rect width={6} height={6} fill="var(--ca-risk-medium-soft)" />
      <line x1={0} y1={0} x2={0} y2={6} stroke="var(--ca-chart-overdue)" strokeWidth={2} />
    </pattern>
  );
}
