export default function DemoOverlay({ demo, stepIndex, onPrev, onNext, onExit, className = '' }) {
  if (!demo) return null
  const step = demo.steps[stepIndex]
  const last = stepIndex === demo.steps.length - 1
  return (
    <section className={`glass anim-slide-up pointer-events-auto px-5 py-4 ${className}`} aria-live="polite" aria-label="Guided demo">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-accent font-semibold">Guided demo</div>
          <h2 className="text-lg font-semibold leading-tight">{demo.title}</h2>
        </div>
        <div className="mono text-muted whitespace-nowrap">
          {stepIndex + 1} / {demo.steps.length}
        </div>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed">{step.caption}</p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={onPrev} disabled={stepIndex === 0}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={last ? onExit : onNext}>
          {last ? 'Finish' : 'Next'}
        </button>
        <button type="button" className="btn btn-quiet ml-auto" onClick={onExit}>
          Exit demo
        </button>
      </div>
    </section>
  )
}
