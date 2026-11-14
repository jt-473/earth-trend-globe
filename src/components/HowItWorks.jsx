import Modal from './Modal.jsx'

export default function HowItWorks({ onClose, variables }) {
  return (
    <Modal title="How it works" onClose={onClose} wide>
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">1</span>
          <div>
            <div className="font-semibold">Pick a variable</div>
            <p className="text-muted">The dropdown switches between six things NASA has measured every month since 1980. The globe recolours smoothly.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">2</span>
          <div>
            <div className="font-semibold">Read the colours</div>
            <p className="text-muted">
              The colour on the map shows how each part of the planet has changed, measured on a grid about 220 km apart. Warm red-orange means the value is rising,
              cool blue means falling, and stronger colour means a bigger change per decade. Pale, see-through areas are places where the change is too small to tell
              apart from random wobble.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">3</span>
          <div>
            <div className="font-semibold">Change how Earth looks</div>
            <p className="text-muted">
              The map controls switch between a satellite photo, city lights at night and a street map with place names. The trend colours slider fades the
              colours from fully see-through, so you only see the map, to fully solid, so you only see the data.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">4</span>
          <div>
            <div className="font-semibold">Click anywhere</div>
            <p className="text-muted">
              The camera flies in and a panel opens with a plain-English verdict, the full monthly record, the trend line with its 95% confidence band, and the raw
              numbers for anyone who wants them.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">5</span>
          <div>
            <div className="font-semibold">Slide through time</div>
            <p className="text-muted">
              The slider recolours the globe by how much change had built up by that year. Beyond the end of the data the track turns dotted, the screen edges glow orange
              and the label says projected. A projection here is only the straight trend line carried forward. It is not a climate forecast.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">6</span>
          <div>
            <div className="font-semibold">Follow a glowing pin</div>
            <p className="text-muted">Pins on the globe start short guided tours that show the interesting bits.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">7</span>
          <div>
            <div className="font-semibold">See what is happening right now</div>
            <p className="text-muted">
              The headline bar and the small icons on the globe are real storms, floods, fires and icebergs from NASA's natural event tracker, from the past 30
              days. Open one to see the long-term trend at the same spot, or jump to NASA Worldview for the satellite images. One event is weather. A trend over 40
              years is climate.
            </p>
          </div>
        </li>
      </ol>

      <h3 className="mt-6 mb-2 font-semibold">The six variables</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {(variables || []).map((v) => (
          <div key={v.id} className="contents">
            <dt className="font-semibold">{v.name}</dt>
            <dd className="text-muted">
              {v.definition}. Units: <span className="mono text-ink">{v.units_long || v.units}</span>.
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 mb-2 font-semibold">Where the data comes from</h3>
      <p className="text-muted">
        NASA's MERRA-2 reanalysis blends satellite and ground observations into a consistent monthly record from 1980 to now, here averaged onto a 2° grid. The
        trend at every grid point is a straight line fitted to the monthly values with the seasonal cycle removed. The p-value and Mann-Kendall test tell us whether that
        line could have appeared by chance.
      </p>

      <h3 className="mt-6 mb-2 font-semibold">Keyboard and controller</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        <li>Left and right arrow keys spin the globe. Square brackets switch variables. Escape closes the panel or the events list.</li>
        <li>With the hardware box connected, its dial spins the globe, its buttons change variable and its sensors appear as a live reading.</li>
      </ul>
    </Modal>
  )
}
