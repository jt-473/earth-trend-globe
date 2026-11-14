import { useId } from 'react'
import { MAP_STYLES, getMapStyle } from '../lib/mapStyles.js'

export default function MapControls({
  mapStyle,
  onChangeStyle,
  dataOpacity,
  onChangeOpacity,
  showLabels,
  onChangeLabels,
  showEvents,
  onChangeEvents,
  className = '',
}) {
  const style = getMapStyle(mapStyle)
  const pct = Math.round(dataOpacity * 100)
  const sliderId = useId()
  return (
    <section className={`glass pointer-events-auto px-3 py-3 ${className}`} aria-label="Map view">
      <div role="radiogroup" aria-label="Map style" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-400/10 p-1">
        {MAP_STYLES.map((s) => {
          const active = s.id === style.id
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChangeStyle(s.id)}
              className={`whitespace-nowrap rounded-lg px-2 py-1.5 font-semibold transition-colors ${
                active ? 'bg-accent text-[#06202a]' : 'text-ink hover:bg-slate-400/15'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between px-1">
        <label htmlFor={sliderId} className="font-semibold">
          Trend colours
        </label>
        <span className="mono text-muted">{pct}%</span>
      </div>
      <div className="mt-1 flex items-center gap-3 px-1">
        <span className="text-muted">Map</span>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => onChangeOpacity(Number(e.target.value) / 100)}
          className="range-plain min-w-0 flex-1"
          aria-valuetext={`${pct}% trend colour, ${100 - pct}% map`}
        />
        <span className="text-muted">Data</span>
      </div>
      {onChangeLabels && (
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 px-1">
          <span>
            <span className="block font-semibold">Place names</span>
            <span className="block text-muted">Zoom in to see countries</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!!showLabels}
            onChange={(e) => onChangeLabels(e.target.checked)}
            className="toggle"
          />
        </label>
      )}
      {onChangeEvents && (
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 px-1">
          <span>
            <span className="block font-semibold">NASA live events</span>
            <span className="block text-muted">Storms, floods, fires and ice</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!!showEvents}
            onChange={(e) => onChangeEvents(e.target.checked)}
            className="toggle"
          />
        </label>
      )}
      {style.attribution && <div className="mt-2 px-1 text-muted">{style.attribution}</div>}
    </section>
  )
}
