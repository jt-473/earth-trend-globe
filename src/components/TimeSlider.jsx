const MIN_YEAR = 1981
const MAX_YEAR = 2040

export default function TimeSlider({ year, endYear, playing, onChange, onTogglePlay, className = '' }) {
  const pct = (y) => ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100
  const projected = year > endYear
  return (
    <section className={`glass pointer-events-auto px-4 pb-3 pt-3 ${className}`} aria-label="Time slider">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost h-10 w-10 justify-center px-0"
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause' : 'Play through the years'}
          title={playing ? 'Pause' : 'Play (about 2 seconds per decade)'}
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ width: 18, height: 18, flex: "none" }}>
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ width: 18, height: 18, flex: "none" }}>
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
        </button>

        <div className="relative flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className={`font-semibold ${projected ? 'text-rising' : 'text-accent'}`}>
              {projected ? 'Projected: if this trend continues' : 'Measured'}
            </span>
            <span className="text-muted hidden xl:inline">Drag to recolour the globe by change since the record began</span>
          </div>
          <div className="relative h-7">
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2">
              <div className="absolute top-0 h-1.5 rounded-l-full bg-accent/80" style={{ left: 0, width: `${pct(endYear)}%` }} />
              <div
                className="absolute top-0 h-1.5 rounded-r-full border-t-[6px] border-dotted border-rising/70"
                style={{ left: `${pct(endYear)}%`, right: 0, height: 0 }}
              />
              <div className="absolute -top-2 h-5 w-0.5 bg-ink/80" style={{ left: `${pct(endYear)}%` }} />
            </div>
            <input
              type="range"
              className="slider absolute inset-0"
              min={MIN_YEAR}
              max={MAX_YEAR}
              step={1}
              value={year}
              onChange={(e) => onChange(Number(e.target.value))}
              aria-label="Year"
              aria-valuetext={`${year}${projected ? ', projected' : ', measured'}`}
            />
          </div>
          <div className="relative mt-1 h-5 text-muted">
            <span className="mono absolute left-0">{MIN_YEAR}</span>
            <span className="absolute hidden -translate-x-1/2 whitespace-nowrap sm:inline" style={{ left: `${pct(endYear)}%` }}>
              Data ends <span className="mono">{endYear}</span>
            </span>
            <span className="mono absolute right-0">{MAX_YEAR}</span>
          </div>
        </div>

        <div className="mono w-[4.5ch] text-right text-2xl font-semibold leading-none" aria-live="polite">
          {year}
        </div>
      </div>
    </section>
  )
}
