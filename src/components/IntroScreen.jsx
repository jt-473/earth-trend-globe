import { MAP_STYLES } from '../lib/mapStyles.js'

export default function IntroScreen({ onStart, onDemo, ready, mapStyle, onChangeMapStyle }) {
  return (
    <div className="anim-fade pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-6" style={{ background: "radial-gradient(ellipse at center, rgba(11,16,32,0.8) 0%, rgba(11,16,32,0.6) 40%, rgba(11,16,32,0.35) 100%)" }}>
      {/* Phones and tablets: darker backing so the text stays readable over the bright globe */}
      <div className="pointer-events-none absolute inset-0 bg-[#0b1020]/55 lg:hidden" aria-hidden="true" />
      <div className="relative max-w-xl text-center">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent">
          <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_#22d3ee]" aria-hidden="true" />
          NASA Space Apps · Earth science trends
        </div>
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Earth Trend Globe</h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">
          Spin the planet, pick a variable and click anywhere to see how it has changed since 1981, whether that change is real, and where it points by 2040.
        </p>
        <div className="mt-7">
          <div id="view-label" className="mb-2 font-semibold">
            Choose how Earth looks
          </div>
          <div role="radiogroup" aria-labelledby="view-label" className="mx-auto grid max-w-md grid-cols-3 gap-2">
            {MAP_STYLES.map((s) => {
              const active = s.id === mapStyle
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChangeMapStyle(s.id)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition-colors ${
                    active ? 'border-accent bg-accent/15 shadow-[0_0_24px_rgba(34,211,238,0.25)]' : 'border-slate-400/25 bg-slate-400/10 hover:bg-slate-400/20'
                  }`}
                >
                  <span
                    className={`block h-12 w-12 rounded-full bg-cover bg-center ring-2 ${active ? 'ring-accent' : 'ring-slate-400/30'}`}
                    style={{ backgroundImage: `url("${s.thumb}")` }}
                    aria-hidden="true"
                  />
                  <span className="font-semibold leading-tight">{s.name}</span>
                  <span className="hidden text-muted leading-snug sm:block">{s.blurb}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-muted">You can switch any time from the map controls.</p>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn btn-primary px-6 py-3 text-base" onClick={onStart} disabled={!ready}>
            {ready ? 'Start exploring' : 'Loading the planet…'}
          </button>
          <button type="button" className="btn btn-ghost px-6 py-3 text-base" onClick={onDemo} disabled={!ready}>
            Watch a demo
          </button>
        </div>
        <p className="mt-6 text-muted">Data: real monthly NASA data (MERRA-2 via NASA POWER), 1981 to 2025, every 2° across the whole world.</p>
      </div>
    </div>
  )
}
