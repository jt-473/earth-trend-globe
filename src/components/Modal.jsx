import { useEffect } from 'react'

export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-space/70 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className={`glass scroll-thin max-h-[85vh] w-full overflow-y-auto p-6 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold leading-tight">{title}</h2>
          <button type="button" className="btn btn-quiet h-9 w-9 justify-center px-0" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
