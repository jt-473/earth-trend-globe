import { categoryInfo } from '../lib/events.js'

// Round badge with the category's line icon, tinted in its colour.
export default function EventIcon({ category, size = 28 }) {
  const info = categoryInfo(category)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, color: info.color, background: `${info.color}22`, boxShadow: `inset 0 0 0 1.5px ${info.color}66` }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={info.icon} />
      </svg>
    </span>
  )
}
