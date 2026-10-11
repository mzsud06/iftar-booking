export default function Star({ className = "" }: { className?: string }) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? 12 : 9.2;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <polygon points={pts.join(" ")} fill="currentColor" />
    </svg>
  );
}
