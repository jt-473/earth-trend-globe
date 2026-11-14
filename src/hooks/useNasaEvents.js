import { useCallback, useEffect, useState } from 'react'
import { fetchEvents, prepareEvents } from '../lib/events.js'

// Loads NASA EONET events once, refreshes every 20 minutes while the page is open.
// state.status: 'loading' | 'ready' | 'error'
export function useNasaEvents() {
  const [state, setState] = useState({ status: 'loading', events: [], savedAt: null, offline: false })

  const load = useCallback(async (force = false) => {
    try {
      const { raw, savedAt, offline } = await fetchEvents({ force })
      const { events } = prepareEvents(raw)
      setState({ status: 'ready', events, savedAt, offline })
    } catch {
      setState((s) => (s.events.length ? { ...s, offline: true } : { status: 'error', events: [], savedAt: null, offline: true }))
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(), 20 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  const retry = useCallback(() => {
    setState((s) => ({ ...s, status: s.events.length ? s.status : 'loading' }))
    load(true)
  }, [load])

  return { ...state, retry }
}
