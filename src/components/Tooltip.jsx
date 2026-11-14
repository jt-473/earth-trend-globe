import { useEffect, useRef } from 'react'
import { fmtSigned } from '../lib/format.js'

// Follows the pointer directly via the DOM so the rest of the app does not re-render on every move.
export default function Tooltip({ cell, varDef, region }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const place = (x, y) => {
      const flipX = x > window.innerWidth - 260
      const flipY = y > window.innerHeight - 120
      el.style.left = `${flipX ? x - 14 : x + 14}px`
      el.style.top = `${flipY ? y - 14 : y + 14}px`
      el.style.transform = `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`
    }
    const onMove = (e) => place(e.clientX, e.clientY)
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [cell])
  if (!cell || !varDef) return null
  return (
    <div ref={ref} className="glass pointer-events-none fixed z-30 px-3 py-2" style={{ borderRadius: 10, minWidth: 170, left: -9999, top: -9999 }} role="status">
      <div className="font-semibold leading-tight">{region ? region.name : '…'}</div>
      {cell.noData ? (
        <div className="mt-0.5 text-muted">No {varDef.name.toLowerCase()} data here</div>
      ) : (
        <>
          <div className="mono mt-0.5 text-muted">
            {fmtSigned(cell.slope_per_decade, varDef.decimals)} {varDef.units_per_decade}
          </div>
          {!cell.significant && <div className="mt-0.5 text-muted">Not significant</div>}
        </>
      )}
    </div>
  )
}
