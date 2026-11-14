import { useEffect, useRef } from 'react'

// Faint star field drawn once per resize on a canvas behind the globe.
export default function StarField() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let seed = 1234567
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const glow = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.7)
      glow.addColorStop(0, 'rgba(34, 211, 238, 0.06)')
      glow.addColorStop(0.5, 'rgba(30, 41, 80, 0.12)')
      glow.addColorStop(1, 'rgba(11, 16, 32, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)
      seed = 1234567
      const count = Math.round((w * h) / 2600)
      for (let i = 0; i < count; i++) {
        const x = rand() * w
        const y = rand() * h
        const r = rand() * 1.1 + 0.2
        const a = 0.15 + rand() * 0.55
        ctx.fillStyle = `rgba(226, 232, 240, ${a})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [])
  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 pointer-events-none" />
}
