import Modal from './Modal.jsx'

export default function HowItWorks({ onClose, variables }) {
  return (
    <Modal title="How it works" onClose={onClose} wide>
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">1</span>
          <div>
            <div className="font-semibold">Pick a variable</div>
            <p className="text-muted">The dropdown switches between six things NASA has recorded every month since 1981 (sunlight since 1984, haze since 2001). The globe recolours smoothly.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">2</span>
          <div>
            <div className="font-semibold">Read the colours</div>
            <p className="text-muted">
              The colour on the map shows how each part of the planet has changed, measured on a grid of points about 220 km apart. Warm red-orange means the value is rising,
              cool blue means it is falling, and stronger colour means a bigger change per decade. Pale, see-through areas are places where the change is too small to tell
              apart from random wobble.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">3</span>
          <div>
            <div className="font-semibold">Change how Earth looks</div>
            <p className="text-muted">
              The map controls switch between a satellite photo, city lights at night and a street map with place names. The "Trend colours" slider fades the
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
              and the label says "Projected". A projection here is only the straight trend line carried forward. It is not a climate forecast.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">6</span>
          <div>
            <div className="font-semibold">Follow a glowing pin</div>
            <p className="text-muted">Glowing pins on the globe start short guided tours of the most interesting places.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">7</span>
          <div>
            <div className="font-semibold">See what is happening right now</div>
            <p className="text-muted">
              The headline bar and the small icons on the globe are real storms, floods, fires and icebergs from the past 30 days, taken from NASA's
              natural event tracker. Open one to see the long-term trend at the same spot, or jump to NASA Worldview for the satellite images. One event is weather. A trend over 40 or more
              years is climate.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">8</span>
          <div>
            <div className="font-semibold">Be a data detective</div>
            <p className="text-muted">
              Press Investigate, then choose what you're curious about and where: search for a place, pick a kind of place like deserts or cities, or draw your own area on
              the globe. You get places ranked by how clearly they're changing, with a reason to look at each. Opening one averages every grid point inside it into
              a single record and tests that trend.
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
        The data is NASA POWER's monthly values, sampled every 2° across the globe. Temperature, humidity, rainfall, haze and ozone come from NASA's MERRA-2 reanalysis, which
        blends satellite and ground observations into one consistent record. Sunlight comes from NASA's GEWEX SRB and CERES satellite projects. The trend at every grid
        point, or across a whole region, is a straight line fitted to the monthly values with the seasonal cycle removed. Its p-value allows for the way one month
        tends to look like the next, so it doesn't overstate certainty, and the Mann-Kendall test checks the same trend a second way.
      </p>

      <h3 className="mt-6 mb-2 font-semibold">Keyboard and controller</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        <li>The left and right arrow keys spin the globe. The [ and ] keys switch variables. Escape closes the panel or the events list.</li>
        <li>With the hardware box connected, its dial spins the globe, its buttons change the variable and its sensors show a live reading.</li>
      </ul>
    </Modal>
  )
}
