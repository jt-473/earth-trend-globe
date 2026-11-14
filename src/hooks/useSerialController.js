import { useCallback, useEffect, useRef, useState } from 'react'

// Reads the Arduino/ESP32 controller over the Web Serial API (Chrome and Edge).
// Protocol: one line per event at 115200 baud.
//   DIAL,+1 / DIAL,-1        spin the globe
//   BTN,next / BTN,prev      switch variable
//   SENSOR,<key>,<value>     live sensor reading (temp, humidity, light, air, rain)
// We send back LED,up / LED,down / LED,none when the selected square changes.
export function useSerialController(handlers) {
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator
  const [status, setStatus] = useState(supported ? 'disconnected' : 'unsupported')
  const [readings, setReadings] = useState({})
  const [error, setError] = useState(null)
  const portRef = useRef(null)
  const writerRef = useRef(null)
  const readerRef = useRef(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const handleLine = useCallback((raw) => {
    const line = raw.trim()
    if (!line) return
    const parts = line.split(',').map((s) => s.trim())
    const h = handlersRef.current || {}
    if (parts[0] === 'DIAL') {
      const delta = Number(parts[1])
      if (!Number.isNaN(delta)) h.onDial && h.onDial(delta)
    } else if (parts[0] === 'BTN') {
      h.onButton && h.onButton(parts[1])
    } else if (parts[0] === 'SENSOR') {
      const value = Number(parts[2])
      if (!Number.isNaN(value)) {
        setReadings((r) => ({ ...r, [parts[1]]: value }))
        h.onSensor && h.onSensor(parts[1], value)
      }
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel().catch(() => {})
        readerRef.current = null
      }
      if (writerRef.current) {
        await writerRef.current.close().catch(() => {})
        writerRef.current = null
      }
      if (portRef.current) {
        await portRef.current.close().catch(() => {})
        portRef.current = null
      }
    } finally {
      setStatus(supported ? 'disconnected' : 'unsupported')
    }
  }, [supported])

  const connect = useCallback(async () => {
    if (!supported) return
    setError(null)
    setStatus('connecting')
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 115200 })
      portRef.current = port
      const encoder = new TextEncoderStream()
      encoder.readable.pipeTo(port.writable).catch(() => {})
      writerRef.current = encoder.writable.getWriter()
      setStatus('connected')

      const decoder = new TextDecoderStream()
      port.readable.pipeTo(decoder.writable).catch(() => {})
      const reader = decoder.readable.getReader()
      readerRef.current = reader
      let buffer = ''
      ;(async () => {
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += value
            let idx
            while ((idx = buffer.indexOf('\n')) >= 0) {
              handleLine(buffer.slice(0, idx))
              buffer = buffer.slice(idx + 1)
            }
          }
        } catch {
          // port closed or unplugged
        } finally {
          readerRef.current = null
          setStatus((s) => (s === 'connected' ? 'disconnected' : s))
        }
      })()
    } catch (e) {
      // User cancelled the picker or the port failed to open. Never block on hardware.
      if (e && e.name !== 'NotFoundError') setError(e.message || String(e))
      setStatus('disconnected')
    }
  }, [supported, handleLine])

  const send = useCallback(async (line) => {
    const w = writerRef.current
    if (!w) return
    try {
      await w.write(`${line}\n`)
    } catch {
      // ignore write errors; the box may have been unplugged
    }
  }, [])

  useEffect(() => {
    if (!supported) return
    const onDisconnect = (e) => {
      if (portRef.current && e.target === portRef.current) disconnect()
    }
    navigator.serial.addEventListener('disconnect', onDisconnect)
    return () => navigator.serial.removeEventListener('disconnect', onDisconnect)
  }, [supported, disconnect])

  return { supported, status, readings, error, connect, disconnect, send }
}
