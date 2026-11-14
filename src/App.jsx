import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StarField from './components/StarField.jsx'
import GlobeView from './components/GlobeView.jsx'
import TopBar from './components/TopBar.jsx'
import Legend from './components/Legend.jsx'
import TimeSlider from './components/TimeSlider.jsx'
import SidePanel from './components/SidePanel.jsx'
import Tooltip from './components/Tooltip.jsx'
import IntroScreen from './components/IntroScreen.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import SignificanceExplainer from './components/SignificanceExplainer.jsx'
import DemoOverlay from './components/DemoOverlay.jsx'
import MapControls from './components/MapControls.jsx'
import NewsTicker from './components/NewsTicker.jsx'
import EventsDrawer from './components/EventsDrawer.jsx'
import { useNasaEvents } from './hooks/useNasaEvents.js'
import { DEFAULT_MAP_STYLE, MAP_STYLES } from './lib/mapStyles.js'
import { loadVariables, loadRegions, loadDemos, loadTrends, loadSeries, findRegion } from './lib/data.js'
import { nearestCell } from './lib/cells.js'
import { useSerialController } from './hooks/useSerialController.js'

const PLAY_MS_PER_YEAR = 200 // about 2 seconds per decade

// Per-viewer conveniences: remember the chosen map look and see-through level.
function readPref(key, fallback) {
  try {
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}
function writePref(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked; the choice just won't be remembered
  }
}

export default function App() {
  const [variables, setVariables] = useState(null)
  const [regions, setRegions] = useState(null)
  const [demos, setDemos] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [variableId, setVariableId] = useState('temperature')
  const [trends, setTrends] = useState(null)
  const [year, setYear] = useState(null)
  const [playing, setPlaying] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const [hoverCell, setHoverCell] = useState(null)
  const [series, setSeries] = useState(null)
  const [otherSeries, setOtherSeries] = useState({})

  const [showIntro, setShowIntro] = useState(true)
  const [showHow, setShowHow] = useState(false)
  const [showSig, setShowSig] = useState(false)
  const [demo, setDemo] = useState(null) // { demo, step }
  const [autoRotate, setAutoRotate] = useState(true)
  const [globeReady, setGlobeReady] = useState(false)
  const [mapStyle, setMapStyle] = useState(() => {
    const saved = readPref('etg.mapStyle', DEFAULT_MAP_STYLE)
    return MAP_STYLES.some((m) => m.id === saved) ? saved : DEFAULT_MAP_STYLE
  })
  const [dataOpacity, setDataOpacity] = useState(() => {
    const saved = Number(readPref('etg.dataOpacity', 0.7))
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.7
  })
  useEffect(() => writePref('etg.mapStyle', mapStyle), [mapStyle])
  useEffect(() => writePref('etg.dataOpacity', dataOpacity), [dataOpacity])
  const [showLabels, setShowLabels] = useState(() => readPref('etg.showLabels', true) !== false)
  useEffect(() => writePref('etg.showLabels', showLabels), [showLabels])
  const [showEvents, setShowEvents] = useState(() => readPref('etg.showEvents', true) !== false)
  useEffect(() => writePref('etg.showEvents', showEvents), [showEvents])

  // ---- NASA live events (EONET) --------------------------------------------
  const feed = useNasaEvents()
  const [eventsOpen, setEventsOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const selectedEvent = useMemo(
    () => (selectedEventId ? feed.events.find((e) => e.id === selectedEventId) || null : null),
    [feed.events, selectedEventId],
  )

  const globeApi = useRef(null)

  const varDef = useMemo(() => (variables ? variables.find((v) => v.id === variableId) : null), [variables, variableId])
  const selected = useMemo(() => (trends && selectedId ? trends.byId.get(selectedId) || null : null), [trends, selectedId])
  const endYear = trends ? trends.end_year : new Date().getFullYear()
  const projected = year !== null && year > endYear

  // ---- Static lookup files ------------------------------------------------
  useEffect(() => {
    Promise.all([loadVariables(), loadRegions(), loadDemos()])
      .then(([v, r, d]) => {
        setVariables(v.variables)
        setRegions(r)
        setDemos(d.demos)
      })
      .catch((e) => setLoadError(e.message))
  }, [])

  // ---- Trend grid for the current variable --------------------------------
  useEffect(() => {
    let alive = true
    loadTrends(variableId)
      .then((t) => {
        if (!alive) return
        setTrends(t)
        setYear((y) => (y === null ? Math.min(t.end_year, new Date().getFullYear()) : y))
      })
      .catch((e) => setLoadError(e.message))
    return () => {
      alive = false
    }
  }, [variableId])

  // ---- Time series for the selected square --------------------------------
  useEffect(() => {
    if (!selected || !trends || !variables) {
      setSeries(null)
      return
    }
    // Right after a variable switch the old variable's trends are still loaded. Wait for
    // the new ones, or the chart would be built from the wrong variable's trend.
    if (trends.variableId !== variableId) return
    let alive = true
    setSeries(null)
    loadSeries(variableId, selected, trends).then((s) => alive && setSeries(s))
    setOtherSeries({})
    // The small charts for the other variables need each variable's own trend for this
    // spot, not the current variable's.
    for (const v of variables) {
      if (v.id === variableId) continue
      loadTrends(v.id)
        .then((t) => {
          const cell = t.byId.get(selected.id)
          return cell ? loadSeries(v.id, cell, t) : null
        })
        .then((s) => alive && s && setOtherSeries((o) => ({ ...o, [v.id]: s })))
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [selected, trends, variableId, variables])

  // ---- Play button --------------------------------------------------------
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setYear((y) => {
        if (y >= 2040) {
          setPlaying(false)
          return y
        }
        return y + 1
      })
    }, PLAY_MS_PER_YEAR)
    return () => clearInterval(id)
  }, [playing])

  // ---- Variable switching -------------------------------------------------
  const cycleVariable = useCallback(
    (dir) => {
      if (!variables) return
      const i = variables.findIndex((v) => v.id === variableId)
      const next = variables[(i + dir + variables.length) % variables.length]
      setVariableId(next.id)
    },
    [variables, variableId],
  )

  // ---- Selection ----------------------------------------------------------
  // Fly so the spot sits in the part of the screen a panel doesn't cover: above the
  // bottom sheet on phones, left of the right-hand panel on wider screens.
  const flyToPoint = useCallback((lat, lon) => {
    if (!globeApi.current) return
    const mobile = window.innerWidth < 1024
    if (mobile) {
      globeApi.current.flyTo(lat - 10, lon, 1.4, 900)
      return
    }
    const shift = Math.min(30, 9 / Math.max(0.3, Math.cos((lat * Math.PI) / 180)))
    globeApi.current.flyTo(lat, lon + shift, 1.05, 900)
  }, [])

  const selectCell = useCallback((record, fly = true) => {
    setEventsOpen(false)
    setSelectedEventId(null)
    setSelectedId(record.id)
    setAutoRotate(false)
    if (fly) flyToPoint(record.lat, record.lon)
  }, [flyToPoint])

  const closePanel = useCallback(() => setSelectedId(null), [])

  const openEvent = useCallback(
    (e) => {
      setSelectedId(null)
      setEventsOpen(true)
      setAutoRotate(false)
      if (!e) {
        setSelectedEventId(null)
        return
      }
      setSelectedEventId(e.id)
      flyToPoint(e.lat, e.lon)
    },
    [flyToPoint],
  )
  const openAllEvents = useCallback(() => openEvent(null), [openEvent])
  const closeEvents = useCallback(() => {
    setEventsOpen(false)
    setSelectedEventId(null)
  }, [])
  // From an event to the long-term trend at the same spot.
  const showTrendForEvent = useCallback(
    (e, varId, cellId) => {
      setEventsOpen(false)
      setSelectedEventId(null)
      setVariableId(varId)
      setSelectedId(cellId)
      setAutoRotate(false)
      flyToPoint(e.lat, e.lon)
    },
    [flyToPoint],
  )

  const onHoverCell = useCallback((h) => {
    if (!h) {
      setHoverCell(null)
      return
    }
    if (h.moveOnly) return
    setHoverCell(h.cell)
  }, [])

  const onUserInteract = useCallback(() => setAutoRotate(false), [])
  const onGlobeReady = useCallback(() => setGlobeReady(true), [])

  // ---- Hardware controller ------------------------------------------------
  const serial = useSerialController({
    onDial: (delta) => {
      setAutoRotate(false)
      globeApi.current && globeApi.current.rotateBy(delta * 4)
    },
    onButton: (name) => {
      if (name === 'next') cycleVariable(1)
      if (name === 'prev') cycleVariable(-1)
    },
  })
  const serialSend = serial.send
  useEffect(() => {
    if (serial.status !== 'connected') return
    const led = selected ? (selected.significant ? selected.direction : 'none') : 'none'
    serialSend(`LED,${led}`)
  }, [selected, serial.status, serialSend])

  // ---- Guided demos -------------------------------------------------------
  const startDemo = useCallback((d) => {
    setShowIntro(false)
    setDemo({ demo: d, step: 0 })
  }, [])
  useEffect(() => {
    if (!demo) return
    const step = demo.demo.steps[demo.step]
    setPlaying(false)
    setVariableId(step.variable)
    setYear(step.year)
    const snapped = nearestCell(step.lat, step.lon)
    setSelectedId(snapped.id)
    setAutoRotate(false)
    if (globeApi.current) globeApi.current.flyTo(snapped.lat, snapped.lon, window.innerWidth < 1024 ? 1.5 : 1.15, 1100)
  }, [demo])

  // ---- Keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        setAutoRotate(false)
        globeApi.current && globeApi.current.rotateBy(e.key === 'ArrowLeft' ? -8 : 8)
      } else if (e.key === ']') cycleVariable(1)
      else if (e.key === '[') cycleVariable(-1)
      else if (e.key === 'Escape') {
        if (showHow || showSig) return // modals handle their own Escape
        if (demo) setDemo(null)
        else if (selectedId) setSelectedId(null)
        else if (eventsOpen) {
          if (selectedEventId) setSelectedEventId(null)
          else setEventsOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleVariable, demo, selectedId, showHow, showSig, eventsOpen, selectedEventId])

  const hoverRegion = useMemo(() => (hoverCell ? findRegion(hoverCell.lat, hoverCell.lon, regions) : null), [hoverCell, regions])
  const selectedRegion = useMemo(() => (selected ? findRegion(selected.lat, selected.lon, regions) : null), [selected, regions])

  const ready = globeReady && !!trends && !!varDef && year !== null
  const panelOpen = !!selected
  const drawerOpen = eventsOpen && !panelOpen && !showIntro && !demo
  const rightOpen = panelOpen || drawerOpen
  const showTicker = !showIntro && !demo && showEvents

  return (
    <div className="relative h-full w-full overflow-hidden bg-space text-ink">
      <StarField />

      <GlobeView
        ref={globeApi}
        trends={trends}
        varDef={varDef}
        year={year ?? endYear}
        selectedCell={selected}
        demos={demos}
        showPins={!showIntro && !demo}
        showLabels={showLabels && !showIntro}
        events={showEvents && !showIntro && !demo ? feed.events : null}
        selectedEventId={drawerOpen ? selectedEventId : null}
        onSelectEvent={openEvent}
        autoRotate={autoRotate}
        mapStyle={mapStyle}
        dataOpacity={dataOpacity}
        onUserInteract={onUserInteract}
        onHoverCell={onHoverCell}
        onSelectCell={selectCell}
        onStartDemo={startDemo}
        onReady={onGlobeReady}
      />

      {/* Glow that marks projected years */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: projected ? 1 : 0,
          // A warm glow around the screen edges marks projected years. It never
          // blurs or tints the globe, so the map and labels stay sharp.
          background: 'radial-gradient(ellipse at center, rgba(251,146,60,0) 55%, rgba(251,146,60,0.07) 80%, rgba(251,146,60,0.16) 100%)',
        }}
        aria-hidden="true"
      />

      {!showIntro && !panelOpen && <Tooltip cell={hoverCell} varDef={varDef} region={hoverRegion} />}
      {!showIntro && panelOpen && hoverCell && hoverCell.id !== selectedId && <Tooltip cell={hoverCell} varDef={varDef} region={hoverRegion} />}

      {!showIntro && (
        <TopBar
          variables={variables}
          variableId={variableId}
          onChangeVariable={setVariableId}
          onHowItWorks={() => setShowHow(true)}
          serial={serial}
          onToggleSerial={() => (serial.status === 'connected' ? serial.disconnect() : serial.connect())}
        />
      )}

      {showTicker && (
        <div
          className={`pointer-events-none absolute inset-x-4 top-[72px] z-10 flex justify-center lg:top-[76px] ${
            rightOpen ? 'lg:right-[452px]' : ''
          }`}
        >
          <NewsTicker feed={feed} onOpenEvent={openEvent} onOpenAll={openAllEvents} className="w-full max-w-[640px]" />
        </div>
      )}

      {!showIntro && demo && (
        <div className="pointer-events-none absolute inset-x-4 top-[72px] z-20 flex justify-center lg:top-20">
          <DemoOverlay
            demo={demo.demo}
            stepIndex={demo.step}
            onPrev={() => setDemo((d) => ({ ...d, step: Math.max(0, d.step - 1) }))}
            onNext={() => setDemo((d) => ({ ...d, step: Math.min(d.demo.steps.length - 1, d.step + 1) }))}
            onExit={() => setDemo(null)}
            className="w-full max-w-[560px]"
          />
        </div>
      )}

      {!showIntro && varDef && (
        <div className={`pointer-events-none absolute left-4 z-10 flex flex-col gap-3 ${rightOpen ? 'hidden xl:flex' : ''} bottom-[132px] lg:bottom-4`}>
          <MapControls
            mapStyle={mapStyle}
            onChangeStyle={setMapStyle}
            dataOpacity={dataOpacity}
            onChangeOpacity={setDataOpacity}
            showLabels={showLabels}
            onChangeLabels={setShowLabels}
            showEvents={showEvents}
            onChangeEvents={setShowEvents}
            className="hidden w-[300px] lg:block"
          />
          <Legend varDef={varDef} year={year ?? endYear} startYear={trends ? trends.start_year : 1980} />
        </div>
      )}

      {/* Phones and tablets: map controls sit under the top bar */}
      {!showIntro && !demo && !rightOpen && (
        <div className={`pointer-events-none absolute left-4 right-4 z-10 lg:hidden ${showTicker ? 'top-[128px]' : 'top-[72px]'}`}>
          <MapControls
            mapStyle={mapStyle}
            onChangeStyle={setMapStyle}
            dataOpacity={dataOpacity}
            onChangeOpacity={setDataOpacity}
            showLabels={showLabels}
            onChangeLabels={setShowLabels}
            showEvents={showEvents}
            onChangeEvents={setShowEvents}
            className="mx-auto max-w-[400px]"
          />
        </div>
      )}

      {!showIntro && year !== null && (
        <div
          className={`pointer-events-none absolute left-4 right-4 z-10 transition-[bottom] duration-300 ${
            rightOpen ? 'bottom-[calc(56vh+12px)] lg:bottom-4 lg:right-[452px] xl:left-[336px]' : 'bottom-4 lg:left-[336px] lg:right-4'
          }`}
        >
          <TimeSlider year={year} endYear={endYear} playing={playing} onChange={(y) => { setPlaying(false); setYear(y) }} onTogglePlay={() => setPlaying((p) => !p)} />
        </div>
      )}

      {!showIntro && panelOpen && varDef && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[56vh] anim-slide-up lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-[76px] lg:h-auto lg:w-[436px] lg:anim-slide-right">
          <SidePanel
            cell={selected}
            varDef={varDef}
            variables={variables}
            trends={trends}
            series={series}
            region={selectedRegion}
            year={year ?? endYear}
            otherSeries={otherSeries}
            serial={serial}
            onClose={closePanel}
            onOpenSignificance={() => setShowSig(true)}
            onSwitchVariable={setVariableId}
            className="rounded-b-none lg:rounded-b-[18px]"
          />
        </div>
      )}

      {drawerOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[56vh] anim-slide-up lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-[76px] lg:h-auto lg:w-[436px] lg:anim-slide-right">
          <EventsDrawer
            feed={feed}
            selected={selectedEvent}
            regions={regions}
            variables={variables}
            onSelect={openEvent}
            onClose={closeEvents}
            onShowTrend={showTrendForEvent}
            className="rounded-b-none lg:rounded-b-[18px]"
          />
        </div>
      )}

      {showIntro && (
        <IntroScreen
          ready={ready}
          mapStyle={mapStyle}
          onChangeMapStyle={setMapStyle}
          onStart={() => setShowIntro(false)}
          onDemo={() => demos && demos.length && startDemo(demos[0])}
        />
      )}

      {showHow && <HowItWorks onClose={() => setShowHow(false)} variables={variables} />}
      {showSig && <SignificanceExplainer onClose={() => setShowSig(false)} />}

      {serial.error && (
        <div className="glass absolute bottom-24 left-1/2 z-40 -translate-x-1/2 px-4 py-2 text-muted" role="alert">
          Controller: {serial.error}. The site keeps working with mouse and keyboard.
        </div>
      )}
      {loadError && (
        <div className="glass absolute left-1/2 top-24 z-50 -translate-x-1/2 px-4 py-3 text-rising" role="alert">
          Could not load data: {loadError}. Run <span className="mono">npm run generate-data</span> and reload.
        </div>
      )}
    </div>
  )
}
