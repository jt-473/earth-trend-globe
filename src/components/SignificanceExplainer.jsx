import Modal from './Modal.jsx'

export default function SignificanceExplainer({ onClose }) {
  return (
    <Modal title='What does "significant" mean?' onClose={onClose}>
      <p className="text-lg font-semibold leading-snug">Imagine flipping a coin.</p>
      <p className="mt-2 text-muted">
        Flip it 10 times and get 7 heads. Suspicious, but it happens by luck fairly often, so you would not call the coin biased. Flip it 1,000 times and get 700
        heads, and luck is no longer a believable explanation. The coin really is biased.
      </p>
      <p className="mt-3 text-muted">
        A trend works the same way. Values wobble up and down every month for all sorts of reasons. The question is whether the slope we see is bigger than that
        wobble could produce on its own.
      </p>
      <div className="mt-4 rounded-xl border border-slate-400/20 bg-slate-400/5 p-4">
        <div className="font-semibold">The p-value</div>
        <p className="mt-1 text-muted">
          The chance of seeing a trend at least this strong if nothing were really changing. A p-value of <span className="mono text-ink">0.05</span> means a 1-in-20
          chance. Below that line we say the trend is <span className="font-semibold text-ink">significant</span>: real, not random. Above it we say{' '}
          <span className="font-semibold text-ink">no clear trend</span>, and that place is drawn pale and see-through.
        </p>
      </div>
      <div className="mt-3 rounded-xl border border-slate-400/20 bg-slate-400/5 p-4">
        <div className="font-semibold">The Mann-Kendall test</div>
        <p className="mt-1 text-muted">
          A second check that does not assume the trend is a straight line. It simply asks: when you compare every pair of years, do later years tend to be higher
          or lower than earlier ones? Its tau runs from <span className="mono text-ink">−1</span> (always falling) to <span className="mono text-ink">+1</span> (always
          rising).
        </p>
      </div>
      <p className="mt-4 text-muted">
        Significant does not mean large or dangerous. It only means we are confident the change is real. The size of the change is shown separately, with its units.
      </p>
    </Modal>
  )
}
