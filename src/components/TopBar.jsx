export default function TopBar({ variables, variableId, onChangeVariable, onHowItWorks, onInvestigate, onOutlook, serial, onToggleSerial }) {
  const status = serial.status
  const serialLabel =
    status === 'connected' ? 'Controller connected' : status === 'connecting' ? 'Connecting…' : status === 'unsupported' ? 'Controller (Chrome or Edge only)' : 'Connect controller'
  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 py-3 md:px-6">
      {/* On phones the title gives way to the variable menu; the intro screen names the app. */}
      <div className="glass hidden shrink-0 items-center gap-3 px-3 py-2 sm:flex md:px-4">
        <span className="hidden h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_#22d3ee] sm:inline-block" aria-hidden="true" />
        <div className="leading-tight">
          <div className="whitespace-nowrap font-semibold">Earth Trend Globe</div>
          <div className="hidden text-muted sm:block">NASA data · 1981 to 2040</div>
        </div>
      </div>

      <div className="glass flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-1.5 md:flex-none md:px-3">
        <label htmlFor="variable" className="hidden text-muted md:block">
          Variable
        </label>
        <select
          id="variable"
          className="field w-full min-w-0 md:w-56"
          value={variableId || ''}
          onChange={(e) => onChangeVariable(e.target.value)}
          aria-label="Choose a variable"
        >
          {(variables || []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.units})
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={onInvestigate} aria-label="Investigate: find places where something is changing">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <span className="hidden md:inline">Investigate</span>
        </button>
        {onOutlook && (
          <button type="button" className="btn btn-ghost glass" onClick={onOutlook} aria-label="2040 outlook: what could the future look like?">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 17l5-5 4 3 8-8" />
              <path d="M15 7h5v5" />
            </svg>
            <span>2040</span>
          </button>
        )}
        <button type="button" className="btn btn-ghost glass hidden sm:inline-flex" onClick={onHowItWorks}>
          How it works
        </button>
        <button type="button" className="btn btn-ghost glass sm:hidden" onClick={onHowItWorks} aria-label="How it works">
          ?
        </button>
        <button
          type="button"
          className={`btn glass hidden sm:inline-flex ${status === 'connected' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={onToggleSerial}
          aria-label={serialLabel}
          disabled={status === 'unsupported' || status === 'connecting'}
          title={status === 'unsupported' ? 'Web Serial needs Chrome or Edge on a computer. The site works fully without the controller.' : 'Connect the Arduino controller box over USB'}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-slate-500'}`}
            aria-hidden="true"
          />
          <span className="hidden md:inline">{serialLabel}</span>
          <span className="hidden sm:inline md:hidden">{status === 'connected' ? 'Connected' : 'Controller'}</span>
        </button>
      </div>
    </header>
  )
}
