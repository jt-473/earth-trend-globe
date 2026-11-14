import { useEffect, useState } from 'react'
import EventIcon from './EventIcon.jsx'
import { timeAgo } from '../lib/events.js'

const ROTATE_MS = 7000
const TOP_N = 15

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// One rotating headline from NASA's live event feed, with controls to step through
// them, pause, or open the full list.
export default function NewsTicker({ feed, onOpenEvent, onOpenAll, className = '' }) {
  const top = feed.events.slice(0, TOP_N)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [paused, setPaused] = useState(prefersReducedMotion)
  const count = top.length
  const i = count ? index % count : 0

  useEffect(() => {
    if (!count || paused || hovered) return
    const id = setInterval(() => setIndex((n) => (n + 1) % count), ROTATE_MS)
    return () => clearInterval(id)
  }, [count, paused, hovered])

  const step = (d) => setIndex((n) => (n + d + count) % count)

  let body
  if (feed.status === 'loading') {
    body = <span className="px-2 text-muted">Loading what's happening around the world…</span>
  } else if (!count) {
    body = (
      <span className="flex min-w-0 items-center gap-2 px-2 text-muted">
        <span className="truncate">NASA's live events are unavailable right now.</span>
        <button type="button" className="btn btn-quiet h-8 px-2" onClick={feed.retry}>
          Try again
        </button>
      </span>
    )
  } else {
    const e = top[i]
    body = (
      <button
        type="button"
        key={e.id}
        className="anim-fade flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-1.5 py-1 text-left hover:bg-slate-400/10 focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => onOpenEvent(e)}
        title="Show this on the globe"
      >
        <EventIcon category={e.category} size={28} />
        <span className="min-w-0 flex-1 truncate font-medium">{e.headline}</span>
        <span className="hidden shrink-0 text-muted sm:inline">{e.active ? timeAgo(e.latest) : 'ended'}</span>
      </button>
    )
  }

  return (
    <section
      className={`glass pointer-events-auto flex items-center gap-1.5 py-1.5 pl-3 pr-1.5 ${className}`}
      style={{ borderRadius: 999 }}
      aria-label="Live headlines from NASA's natural event tracker"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span className="flex shrink-0 items-center gap-1.5 pr-1 font-semibold tracking-wide text-[#fda4af]">
        <span className="live-dot" aria-hidden="true" />
        <span className="hidden sm:inline">{feed.offline ? 'SAVED' : 'LIVE'}</span>
      </span>
      {body}
      {count > 1 && (
        <div className="hidden shrink-0 items-center sm:flex">
          <button type="button" className="btn btn-quiet h-8 w-8 justify-center px-0" onClick={() => step(-1)} aria-label="Previous headline">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
          </button>
          <button
            type="button"
            className="btn btn-quiet h-8 w-8 justify-center px-0"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play headlines' : 'Pause headlines'}
          >
            {paused ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2h3v12H4zM9 2h3v12H9z" /></svg>
            )}
          </button>
          <button type="button" className="btn btn-quiet h-8 w-8 justify-center px-0" onClick={() => step(1)} aria-label="Next headline">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
          </button>
        </div>
      )}
      {feed.events.length > 0 && (
        <button type="button" className="btn btn-ghost h-9 shrink-0 rounded-full px-3" onClick={onOpenAll}>
          <span className="sm:hidden">All</span>
          <span className="hidden sm:inline">All {feed.events.length}</span>
        </button>
      )}
    </section>
  )
}
