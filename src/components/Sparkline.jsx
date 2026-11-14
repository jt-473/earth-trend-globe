// Tiny SVG chart: annual means of the deseasonalised series plus its trend line.
export default function Sparkline({ series, tone = 'none', width = 120, height = 36 }) {
  if (!series) return <div className="h-9 w-full animate-pulse rounded bg-slate-700/30" />
  const d = series.deseasonalised
  const annual = []
  for (let i = 0; i + 12 <= d.length; i += 12) {
    let s = 0
    for (let k = 0; k < 12; k++) s += d[i + k]
    annual.push(s / 12)
  }
  const t0 = series.trend_line[0]
  const t1 = series.trend_line[series.trend_line.length - 1]
  const all = annual.concat([t0, t1])
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const x = (i, n) => (i / (n - 1)) * (width - 2) + 1
  const y = (v) => height - 2 - ((v - min) / span) * (height - 4)
  const path = annual.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, annual.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const color = tone === 'up' ? '#f97316' : tone === 'down' ? '#3b82f6' : '#94a3b8'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <path d={path} fill="none" stroke="rgba(148,163,184,0.6)" strokeWidth="1" />
      <line x1={x(0, 2)} y1={y(t0)} x2={x(1, 2)} y2={y(t1)} stroke={color} strokeWidth="2" />
    </svg>
  )
}
