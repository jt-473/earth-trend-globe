import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import { N_CELLS, N_LAT, N_LON, LAT_MIN, LON_MIN, STEP, centreFromIndex, cellId, nearestCell } from '../lib/cells.js'
import { trendAlpha, trendRgb } from '../lib/colors.js'
import { useWindowSize } from '../hooks/useWindowSize.js'
import { getMapStyle } from '../lib/mapStyles.js'
import { CONTINENTS, COUNTRIES, zoomLevel } from '../lib/places.js'
import { categoryInfo } from '../lib/events.js'

const GLOBE_RADIUS = 100 // three-globe's internal radius
const ALT = 0.004 // the colour wash floats just above the map
const FADE_MS = 650

// The trend colours are painted onto one smooth texture that wraps the globe.
// Each texture pixel blends the four nearest 2-degree grid points (bilinear), so
// the colours flow into each other with no squares, seams or edges.
const TEX_W = 720 // 0.5 degree per pixel
const TEX_H = 360

// Per-row and per-column blend weights, computed once.
const ROWS = (() => {
  const li0 = new Int32Array(TEX_H)
  const li1 = new Int32Array(TEX_H)
  const t = new Float32Array(TEX_H)
  for (let py = 0; py < TEX_H; py++) {
    const lat = 90 - ((py + 0.5) * 180) / TEX_H
    const f = Math.max(0, Math.min(N_LAT - 1, (lat - LAT_MIN) / STEP))
    li0[py] = Math.floor(f)
    li1[py] = Math.min(N_LAT - 1, li0[py] + 1)
    t[py] = f - li0[py]
  }
  return { li0, li1, t }
})()
const COLS = (() => {
  const lo0 = new Int32Array(TEX_W)
  const lo1 = new Int32Array(TEX_W)
  const s = new Float32Array(TEX_W)
  for (let px = 0; px < TEX_W; px++) {
    const lon = -180 + ((px + 0.5) * 360) / TEX_W
    let f = (lon - LON_MIN) / STEP
    f = ((f % N_LON) + N_LON) % N_LON
    lo0[px] = Math.floor(f) % N_LON
    lo1[px] = (lo0[px] + 1) % N_LON // wraps across the date line
    s[px] = f - Math.floor(f)
  }
  return { lo0, lo1, s }
})()

// Soften the grid with a small [1 2 1] blur in both directions (wrapping in longitude),
// so neighbouring places blend instead of meeting at hard edges.
function smoothCells(src, passes = 2) {
  let a = src
  let b = new Float32Array(src.length)
  for (let pass = 0; pass < passes; pass++) {
    for (let li = 0; li < N_LAT; li++) {
      const row = li * N_LON
      for (let lo = 0; lo < N_LON; lo++) {
        const l = row + ((lo + N_LON - 1) % N_LON)
        const r = row + ((lo + 1) % N_LON)
        const m = row + lo
        for (let k = 0; k < 4; k++) b[m * 4 + k] = (a[l * 4 + k] + 2 * a[m * 4 + k] + a[r * 4 + k]) / 4
      }
    }
    ;[a, b] = [b, a === src ? new Float32Array(src.length) : a]
    for (let li = 0; li < N_LAT; li++) {
      const up = Math.max(0, li - 1) * N_LON
      const dn = Math.min(N_LAT - 1, li + 1) * N_LON
      const row = li * N_LON
      for (let lo = 0; lo < N_LON; lo++) {
        for (let k = 0; k < 4; k++) {
          b[(row + lo) * 4 + k] = (a[(up + lo) * 4 + k] + 2 * a[(row + lo) * 4 + k] + a[(dn + lo) * 4 + k]) / 4
        }
      }
    }
    ;[a, b] = [b, a]
  }
  return a
}

// cellRgba: Float32Array(N_CELLS * 4), values 0..1. Writes into an ImageData buffer.
function paintTexture(cellRgba, out) {
  const { li0, li1, t } = ROWS
  const { lo0, lo1, s } = COLS
  let p = 0
  for (let py = 0; py < TEX_H; py++) {
    const r0 = li0[py] * N_LON
    const r1 = li1[py] * N_LON
    const ty = t[py]
    for (let px = 0; px < TEX_W; px++) {
      const sx = s[px]
      const a = (r0 + lo0[px]) * 4
      const b = (r0 + lo1[px]) * 4
      const c = (r1 + lo0[px]) * 4
      const d = (r1 + lo1[px]) * 4
      const w00 = (1 - sx) * (1 - ty)
      const w01 = sx * (1 - ty)
      const w10 = (1 - sx) * ty
      const w11 = sx * ty
      for (let k = 0; k < 4; k++) {
        out[p + k] = 255 * (cellRgba[a + k] * w00 + cellRgba[b + k] * w01 + cellRgba[c + k] * w10 + cellRgba[d + k] * w11)
      }
      p += 4
    }
  }
}

const GlobeView = forwardRef(function GlobeView(
  {
    trends,
    varDef,
    year,
    selectedCell,
    demos,
    showPins,
    showLabels = true,
    events = null,
    selectedEventId = null,
    onSelectEvent,
    autoRotate,
    mapStyle,
    dataOpacity = 0.7,
    onUserInteract,
    onHoverCell,
    onSelectCell,
    onStartDemo,
    onReady,
  },
  ref,
) {
  const globeRef = useRef(null)
  const wrapRef = useRef(null)
  const meshRef = useRef(null)
  const texRef = useRef(null) // { canvas, ctx, image, texture }
  const cellRgbaRef = useRef(null)
  const { width, height } = useWindowSize()

  // Colour animation state
  const animRef = useRef({ from: null, to: null, start: 0, raf: 0, lastVariable: null })
  const hoverRef = useRef({ pending: null, raf: 0, lastId: null })
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS * (1 + ALT)), [])
  const hitPoint = useMemo(() => new THREE.Vector3(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  const getMesh = useCallback(() => {
    if (!meshRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = TEX_W
      canvas.height = TEX_H
      const ctx = canvas.getContext('2d')
      const image = ctx.createImageData(TEX_W, TEX_H)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      texRef.current = { canvas, ctx, image, texture }
      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
      const geo = new THREE.SphereGeometry(GLOBE_RADIUS * (1 + ALT), 180, 90)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.y = -Math.PI / 2 // same orientation three-globe uses for the Earth image
      mesh.raycast = () => {} // let clicks reach the globe underneath
      mesh.__trendMesh = true
      mesh.renderOrder = 1
      meshRef.current = mesh
    }
    return meshRef.current
  }, [])

  const pushTexture = useCallback((cellRgba) => {
    const tex = texRef.current
    if (!tex) return
    paintTexture(smoothCells(cellRgba), tex.image.data)
    tex.ctx.putImageData(tex.image, 0, 0)
    tex.texture.needsUpdate = true
  }, [])

  // Cells in grid order (real files may list cells in any order).
  const cellsByIndex = useMemo(() => {
    if (!trends) return null
    const arr = new Array(N_CELLS)
    for (let i = 0; i < N_CELLS; i++) {
      const { lat, lon } = centreFromIndex(i)
      arr[i] = trends.byId.get(cellId(lat, lon)) || null
    }
    return arr
  }, [trends])

  const style = getMapStyle(mapStyle)
  const globeMaterial = useMemo(() => new THREE.MeshPhongMaterial({ color: new THREE.Color('#ffffff'), shininess: 4 }), [])

  // Shiny oceans for the daytime satellite view; matte everywhere else.
  useEffect(() => {
    let cancelled = false
    const mat = globeMaterial
    const reset = () => {
      mat.specularMap = null
      mat.specular = new THREE.Color('#111111')
      mat.shininess = 4
      mat.needsUpdate = true
    }
    if (!style.specular) {
      reset()
      return
    }
    new THREE.TextureLoader().load(style.specular, (tex) => {
      if (cancelled) return
      mat.specularMap = tex
      mat.specular = new THREE.Color('#4a5a70')
      mat.shininess = 16
      mat.needsUpdate = true
    })
    return () => {
      cancelled = true
    }
  }, [style, globeMaterial])

  // Repaint the colour wash whenever the variable, year, data or see-through level changes.
  useEffect(() => {
    if (!cellsByIndex || !varDef) return
    const mesh = getMesh()
    const years = Math.max(0, year - trends.start_year)
    const fullYears = Math.max(1, trends.end_year - trends.start_year)
    const range = varDef.colour_range_per_decade * (fullYears / 10)
    // Strong trends are nearly solid and weak ones see-through (trendAlpha). The slider
    // scales that up to its default of 70%, then fills everything in towards "data only".
    const o = Math.max(0, Math.min(1, dataOpacity))
    const scale = Math.min(1, o / 0.7)
    const fill = Math.max(0, (o - 0.7) / 0.3)
    mesh.visible = o > 0.001
    const target = new Float32Array(N_CELLS * 4)
    for (let i = 0; i < N_CELLS; i++) {
      const c = cellsByIndex[i]
      const value = c ? (c.slope_per_decade * years) / 10 : 0
      const sig = !!(c && c.significant)
      const rgb = trendRgb(value, range, sig)
      const base = trendAlpha(value, range, sig)
      const j = i * 4
      target[j] = rgb[0]
      target[j + 1] = rgb[1]
      target[j + 2] = rgb[2]
      // Cells with no data (e.g. oceans in a land-only dataset) stay clear.
      target[j + 3] = c ? scale * (base + (1 - base) * fill) : 0
    }
    const anim = animRef.current
    const variableChanged = anim.lastVariable !== varDef.id
    cancelAnimationFrame(anim.raf)
    if (!variableChanged || anim.lastVariable === null || !cellRgbaRef.current) {
      anim.lastVariable = varDef.id
      cellRgbaRef.current = target
      pushTexture(target)
      return
    }
    // Cross-fade to the new variable.
    anim.lastVariable = varDef.id
    const from = cellRgbaRef.current
    const current = new Float32Array(target.length)
    anim.start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - anim.start) / FADE_MS)
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      for (let i = 0; i < current.length; i++) current[i] = from[i] + (target[i] - from[i]) * e
      cellRgbaRef.current = current
      pushTexture(current)
      if (t < 1) anim.raf = requestAnimationFrame(step)
      else cellRgbaRef.current = target
    }
    anim.raf = requestAnimationFrame(step)
  }, [cellsByIndex, varDef, year, trends, getMesh, pushTexture, dataOpacity])

  // Auto-rotation on/off
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    const controls = g.controls()
    if (controls) controls.autoRotate = !!autoRotate
  }, [autoRotate])

  // Country names appear in stages as the camera gets closer (see places.js).
  const handleZoom = useCallback((pov) => {
    const wrap = wrapRef.current
    if (!wrap || !pov) return
    const level = String(zoomLevel(pov.altitude))
    if (wrap.dataset.zoom !== level) wrap.dataset.zoom = level
  }, [])

  const handleReady = useCallback(() => {
    const g = globeRef.current
    if (!g) return
    const controls = g.controls()
    controls.autoRotate = !!autoRotate
    controls.autoRotateSpeed = 0.45
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = GLOBE_RADIUS * 1.25
    controls.maxDistance = GLOBE_RADIUS * 4.5
    controls.addEventListener('start', () => onUserInteract && onUserInteract())
    const portrait = window.innerWidth < window.innerHeight
    g.pointOfView({ lat: 18, lng: 8, altitude: portrait ? 3.6 : 2.3 }, 0)
    handleZoom(g.pointOfView())
    onReady && onReady()
  }, [autoRotate, onUserInteract, onReady, handleZoom])

  useImperativeHandle(
    ref,
    () => ({
      flyTo(lat, lng, altitude = 1.1, ms = 900) {
        const g = globeRef.current
        if (!g) return
        g.pointOfView({ lat, lng, altitude }, ms)
      },
      rotateBy(deg) {
        const g = globeRef.current
        if (!g) return
        const pov = g.pointOfView()
        g.pointOfView({ ...pov, lng: pov.lng + deg }, 160)
      },
      pointOfView() {
        return globeRef.current ? globeRef.current.pointOfView() : null
      },
    }),
    [],
  )

  // Hover: raycast against the sphere and snap to the 2-degree cell.
  const resolveHover = useCallback(() => {
    const h = hoverRef.current
    h.raf = 0
    const g = globeRef.current
    const wrap = wrapRef.current
    if (!g || !wrap || !h.pending) return
    const { x, y } = h.pending
    const rect = wrap.getBoundingClientRect()
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1))
    raycaster.setFromCamera(ndc, g.camera())
    const hit = raycaster.ray.intersectSphere(sphere, hitPoint)
    if (!hit) {
      if (h.lastId !== null) {
        h.lastId = null
        onHoverCell && onHoverCell(null)
      }
      return
    }
    const { lat, lng } = g.toGeoCoords(hit)
    const snapped = nearestCell(lat, lng)
    const record = trends ? trends.byId.get(snapped.id) : null
    if (snapped.id !== h.lastId) {
      h.lastId = snapped.id
      onHoverCell && onHoverCell({ cell: record || { ...snapped, slope_per_decade: 0, significant: false, noData: true }, x, y })
    } else {
      onHoverCell && onHoverCell({ cell: record || { ...snapped, slope_per_decade: 0, significant: false, noData: true }, x, y, moveOnly: true })
    }
  }, [trends, onHoverCell, raycaster, sphere, hitPoint, ndc])

  const onPointerMove = useCallback(
    (e) => {
      if (e.pointerType === 'touch') return
      if (e.target && e.target.closest && e.target.closest('.demo-pin, .event-pin')) {
        hoverRef.current.lastId = null
        onHoverCell && onHoverCell(null)
        return
      }
      hoverRef.current.pending = { x: e.clientX, y: e.clientY }
      if (!hoverRef.current.raf) hoverRef.current.raf = requestAnimationFrame(resolveHover)
    },
    [resolveHover, onHoverCell],
  )
  const onPointerLeave = useCallback(() => {
    hoverRef.current.lastId = null
    hoverRef.current.pending = null
    onHoverCell && onHoverCell(null)
  }, [onHoverCell])

  const handleGlobeClick = useCallback(
    ({ lat, lng }) => {
      if (!trends) return
      const snapped = nearestCell(lat, lng)
      const record = trends.byId.get(snapped.id)
      if (record) onSelectCell && onSelectCell(record)
    },
    [trends, onSelectCell],
  )

  const selectedEvent = useMemo(() => (events && selectedEventId ? events.find((e) => e.id === selectedEventId) : null), [events, selectedEventId])
  const rings = useMemo(() => {
    const r = []
    if (selectedCell) r.push({ lat: selectedCell.lat, lng: selectedCell.lon, rgb: '34, 211, 238' })
    if (selectedEvent) {
      const n = parseInt(categoryInfo(selectedEvent.category).color.slice(1), 16)
      r.push({ lat: selectedEvent.lat, lng: selectedEvent.lon, rgb: `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}` })
    }
    return r
  }, [selectedCell, selectedEvent])
  // The street map already prints country names, so only continents are added there.
  const showCountries = showLabels && style.id !== 'map'
  const onSelectEventRef = useRef(onSelectEvent)
  onSelectEventRef.current = onSelectEvent

  // Highlight the chosen event's marker without rebuilding the markers.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.querySelectorAll('.event-pin').forEach((el) => el.classList.toggle('is-selected', el.dataset.eventId === selectedEventId))
  }, [selectedEventId, events])

  // Storm paths, drawn as moving dotted lines.
  const tracks = useMemo(() => (events ? events.filter((e) => e.track) : []), [events])

  const htmlItems = useMemo(() => {
    const items = []
    if (showLabels) for (const c of CONTINENTS) items.push({ kind: 'continent', ...c })
    if (showCountries) for (const c of COUNTRIES) items.push({ kind: 'country', ...c })
    if (events) for (const e of events) items.push({ kind: 'event', lat: e.lat, lon: e.lon, event: e })
    if (showPins && demos) for (const d of demos) items.push({ kind: 'pin', lat: d.pin.lat, lon: d.pin.lon, demo: d })
    return items
  }, [showPins, demos, showLabels, showCountries, events])

  const makeHtml = useCallback(
    (item) => {
      if (item.kind === 'continent' || item.kind === 'country') {
        const el = document.createElement('div')
        el.className = `place-label ${item.kind}-label`
        if (item.tier) el.dataset.tier = String(item.tier)
        el.textContent = item.name
        el.setAttribute('aria-hidden', 'true')
        return el
      }
      if (item.kind === 'event') {
        const e = item.event
        const info = categoryInfo(e.category)
        const el = document.createElement('div')
        el.className = `event-pin${e.active ? '' : ' is-ended'}${e.count > 1 || e.category !== 'wildfires' ? '' : ' is-small'}${e.minor ? ' is-minor' : ''}`
        el.style.setProperty('--c', info.color)
        el.dataset.eventId = e.id
        el.dataset.title = e.headline // shown by CSS attr(), never parsed as HTML
        el.setAttribute('aria-hidden', 'true') // keyboard and screen readers use the events list instead
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('stroke', 'currentColor')
        svg.setAttribute('stroke-width', '2.2')
        svg.setAttribute('stroke-linecap', 'round')
        svg.setAttribute('stroke-linejoin', 'round')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', info.icon)
        svg.appendChild(path)
        el.appendChild(svg)
        if (e.count > 1) {
          const badge = document.createElement('span')
          badge.className = 'count'
          badge.textContent = e.count > 99 ? '99+' : String(e.count)
          el.appendChild(badge)
        }
        const open = (ev) => {
          ev.stopPropagation()
          onSelectEventRef.current && onSelectEventRef.current(e)
        }
        el.onclick = open
        return el
      }
      const d = item.demo
      const el = document.createElement('div')
      el.className = 'demo-pin'
      el.setAttribute('role', 'button')
      el.setAttribute('aria-label', `Start demo: ${d.title}`)
      el.dataset.title = d.title
      el.onclick = (e) => {
        e.stopPropagation()
        onStartDemo && onStartDemo(d)
      }
      return el
    },
    [onStartDemo],
  )

  // Fade labels and pins out smoothly as they turn to the far side of the globe.
  const setHtmlVisible = useCallback((el, visible) => {
    el.classList.toggle('is-hidden', !visible)
  }, [])

  const customData = useMemo(() => [{ id: 'trend-mesh' }], [])
  const noop = useCallback(() => undefined, [])
  const filter = useCallback((obj) => !obj.__trendMesh, [])

  return (
    <div ref={wrapRef} className="absolute inset-0 isolate z-0" data-zoom="0" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={style.image || null}
        bumpImageUrl={style.bump || null}
        globeTileEngineUrl={style.tiles || null}
        globeMaterial={globeMaterial}
        showAtmosphere
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.16}
        showGraticules={false}
        animateIn={false}
        rendererConfig={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onGlobeReady={handleReady}
        onGlobeClick={handleGlobeClick}
        onZoom={handleZoom}
        pointerEventsFilter={filter}
        customLayerData={customData}
        customThreeObject={getMesh}
        customThreeObjectUpdate={noop}
        ringsData={rings}
        ringColor={(d) => (t) => `rgba(${d.rgb}, ${1 - t})`}
        ringMaxRadius={4}
        ringPropagationSpeed={2}
        ringRepeatPeriod={900}
        ringAltitude={0.006}
        pathsData={tracks}
        pathPoints={(d) => d.track}
        pathPointLat={(p) => p.lat}
        pathPointLng={(p) => p.lon}
        pathPointAlt={0.006}
        pathColor={(d) => (d.active ? categoryInfo(d.category).color : 'rgba(167, 139, 250, 0.55)')}
        pathStroke={1.6}
        pathDashLength={0.25}
        pathDashGap={0.12}
        pathDashAnimateTime={6000}
        pathTransitionDuration={0}
        htmlElementsData={htmlItems}
        htmlLat={(d) => d.lat}
        htmlLng={(d) => d.lon}
        htmlAltitude={(d) => (d.kind === 'pin' ? 0.03 : 0.01)}
        htmlElement={makeHtml}
        htmlElementVisibilityModifier={setHtmlVisible}
        htmlTransitionDuration={0}
      />
    </div>
  )
})

export default GlobeView
