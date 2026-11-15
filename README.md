# Earth Trend Globe

An interactive 3D globe for the NASA Space Apps challenge on Earth science trends.
Spin the globe, pick a variable, click anywhere or choose a whole region to see
how it has changed since 1981, whether the change is significant, and where it
might go by 2040.

* **Real NASA data.** Monthly values from NASA POWER (MERRA-2 reanalysis, plus
  GEWEX SRB and CERES for sunlight), 1981 to 2025, every 2 degrees.
* **Be a data detective.** Answer two questions (what, and where) and get places
  ranked by how clearly they are changing, with a reason to look at each. Search
  for a place, pick a kind of place, or draw your own area on the globe.
* **Regions.** Any area is averaged into one monthly record (area-weighted) and
  tested the same way as a single point. If parts of it rise and parts fall,
  the panel says so.
* **Significance.** Slope per decade, a p-value that allows for month-to-month
  memory in the data, the Mann-Kendall test, and a 95% confidence band. When a
  trend isn't significant yet, the panel estimates how many more years of data
  it would need.
* **Live events.** Storms, floods, fires and icebergs from NASA's natural event
  tracker (EONET), each linked to the long-term trend at the same spot.
* **2040 outlook.** A statistical model (trend plus realistic ups and downs, run
  2,000 times and tested on 2008 to 2025) shows what 2040 could look like for
  184 areas, written for people who don't study science.
* **Month by month.** The side panel names every month and compares it with a
  normal month of the same name.

**How every number is calculated, with the name of each formula:
[METHODS.md](METHODS.md).**

Built from the "Earth Trend Globe – Frontend Design Brief".

## Run it

```bash
npm install
npm run dev             # http://localhost:5173
```

The real data is already in `public/data`, so that's all you need.
`npm run build` makes a static site in `dist/` ready for Vercel or Netlify.
No backend is needed. Everything is static files under `public/data`.

### Refreshing the real data

```bash
npm run fetch-data   # download NASA POWER monthly data for 16,020 points (several hours)
npm run build-data   # turn it into public/data (a few seconds)
```

`fetch-data` keeps what it downloads in `.cache/power` (not committed) and skips
points it already has, so it is safe to stop and run again, and running it again
fills any points that failed. NASA POWER is free and needs no account.

Notes on the data:
* Values come from NASA POWER's native grid, sampled at each 2-degree point.
  They are not averages over the whole 2-degree square.
* Sunlight starts in 1984 and haze (aerosol optical depth) in 2001, because
  that is where those records begin.
* Sunlight is converted from MJ/m²/day to W/m² (× 11.574).

## What is where

| Path | What it does |
| --- | --- |
| `src/App.jsx` | State and layout: variable, year, selected square, demos, hardware |
| `src/components/GlobeView.jsx` | react-globe.gl globe. The 16,020 grid values are blended into one smooth colour texture wrapped just above the map, repainted and cross-faded when the variable changes |
| `src/components/SidePanel.jsx` | Place, variable, verdict card, Plotly graph, prediction note, the numbers, "How it connects", live sensor reading |
| `src/components/TrendChart.jsx` | Plotly chart: monthly line, trend line, 95% band, dotted projection with widening band |
| `src/components/TimeSlider.jsx` | 1981 to 2040 slider with measured/projected styling and play button |
| `src/components/Legend.jsx`, `TopBar.jsx`, `Tooltip.jsx`, `IntroScreen.jsx`, `DemoOverlay.jsx`, `HowItWorks.jsx`, `SignificanceExplainer.jsx` | The other screens and cards |
| `src/hooks/useSerialController.js` | Web Serial link to the Arduino/ESP32 box |
| `src/lib/data.js` | Loads the JSON files and the monthly band files; builds any point's or region's series in the browser |
| `src/lib/stats.js` | Trend statistics shared by the browser and the build script: anomalies, trend line, autocorrelation-aware p-value, Mann-Kendall, years to significance |
| `src/lib/explore.js` | Data detective logic: place catalogue and search, kinds of place, "why look here" hints, ranking places by trend |
| `src/components/DataDetective.jsx` | The question flow: what, where, then ranked suggestions |
| `scripts/fetch-nasa-power.mjs`, `scripts/build-real-data.mjs` | Real data pipeline: download from NASA POWER, then write `public/data` |
| `src/lib/fakeSeries.js` | Deterministic fake monthly series, shared by the browser and the generator script. Each one's fitted line equals the cell's slope in the trends file, and its noise is sized so the chart agrees with the cell's significance |
| `src/lib/colors.js` | Red-blue diverging ramps, how see-through each trend is, and the pale "not significant" colour |
| `src/lib/mapStyles.js` | The three map looks: satellite, night lights and street map |
| `src/components/MapControls.jsx` | Map style switcher, "Trend colours" slider and "Place names" switch |
| `src/lib/events.js` | NASA EONET live events: fetch, offline copy, grouping wildfires, plain-English headlines, Worldview links |
| `src/hooks/useNasaEvents.js` | Loads the events and refreshes them every 20 minutes |
| `src/components/NewsTicker.jsx`, `EventsDrawer.jsx`, `EventIcon.jsx` | Headline bar, the events list and detail view, category icons |
| `src/lib/places.js` | Continent and country label positions and the zoom levels they appear at |
| `src/lib/outlook.js`, `scripts/build-outlook.mjs` | 2040 outlook model and the script that runs it for every area (`npm run build-outlook`, about 2 minutes) into `public/data/outlook` |
| `src/components/OutlookView.jsx` | The 2040 outlook screen |
| `src/components/MonthByMonth.jsx` | The month-by-month table in the side panel |
| `METHODS.md` | Every calculation with its name, formula and plain-English meaning |
| `scripts/generate-fake-data.mjs` | Old placeholder generator. Refuses to run while real data is present unless given `--force` |
| `public/data/variables.json` | Names, plain-English definitions, units, colour ranges and sensor mapping. The dropdown, legend and side panel all read from here |
| `public/data/regions.json` | Named areas (bounding boxes) plus a list of places for the nearest-place fallback |
| `public/data/demos.json` | Guided demo steps: lat, lon, variable, year, caption |

## Data format

The format is exactly as in the brief, so real files drop in with no code changes.

* `public/data/trends_<variable>.json` colours the globe:
  `{ variable, units_per_decade, start_year, end_year, cells: [{ id, lat, lon, slope_per_decade, p_value, significant, direction }] }`
  Cell ids are `c_<lat>_<lon>` on even degrees, for example `c_54_-6` covers 53°N to 55°N and 7°W to 5°W.
* `public/data/series/<variable>/<cell id>.json` (brief format) is used when it
  exists. The build script writes these for the demo locations:
  `{ dates, values, deseasonalised, trend_line, ci_low, ci_high, prediction: { dates, values, low, high }, mann_kendall: { tau, p_value }, total_change }`
* `public/data/monthly/<variable>.json` and `monthly/<variable>/band_N.bin` hold
  every point's monthly values as 16-bit integers (value = integer × scale), nine
  rows of latitude per file, so the browser only loads the bands it needs. Any
  point's or region's series is built from these with `src/lib/stats.js`.

If the data team delivers their own files in the brief's format, copy them over
`public/data` and they take priority for those points.

## Map styles

Visitors pick how Earth looks on the intro screen and can switch any time from
the map controls (bottom left on desktop, under the top bar on phones):

* **Satellite**: NASA Blue Marble photo with terrain bumps and shiny oceans.
* **Night lights**: city lights seen from space.
* **Street map**: OpenStreetMap tiles with borders and place names. These load
  from the internet and need the "Map data © OpenStreetMap contributors" credit,
  which the map controls show. OpenStreetMap's free tiles are fine for a
  hackathon demo, but for heavy public traffic switch to a keyed provider
  (for example MapTiler or Stadia Maps) in `src/lib/mapStyles.js`.

Colour strength follows trend size. Small trends are a faint tint and strong
ones build to deep crimson (rising) or bright blue (falling). Places with no
significant trend get only a light grey veil, so the map shows through them.
The "Trend colours" slider scales all of this, from map only up to solid data.

Place names float over the globe and fade out as they turn to the far side.
Zoomed out you see continents. Zooming in swaps them for country names, the
largest countries first and smaller ones up close (positions and size tiers are
in `src/lib/places.js`). The street map prints its own country names, so only
continents are added there. A "Place names" switch in the map controls hides
them all. Each browser remembers all three choices.

The satellite and night textures in `public/textures` come from the three-globe
examples.

## Live events from NASA

The headline bar and the icons on the globe come from NASA's Earth Observatory
Natural Event Tracker (EONET, https://eonet.gsfc.nasa.gov/docs/v3). It is free,
needs no key and allows requests straight from the browser. The app asks for
every event from the past 30 days, then:

* groups nearby wildfire reports into one marker with a count, because there are
  hundreds of them,
* ranks events so active storms, recent floods and big fire clusters lead the
  headlines, and planned burns sink to the bottom,
* hides small or older events when zoomed right out (zoom in to see them all),
* draws storm paths as moving dotted lines.

Opening an event shows the long-term trend at the same spot from our MERRA-2
data (rainfall for storms and floods, temperature for fires and ice, air
pollution for volcanoes and dust) and a link to NASA Worldview for that place
and day. This is how the app builds on NASA's own tools: Worldview and EONET
show what is happening, and the globe answers whether it fits a long-term trend.

The last good copy is kept in the browser, so a demo on bad Wi-Fi still shows
events (marked "SAVED" instead of "LIVE"). The "Live NASA events" switch in the
map controls hides them all. Event text from the feed is only ever shown as text,
and only http(s) links are kept.

## Hardware controller

Chrome or Edge only (Web Serial). Click "Connect controller" and pick the USB
port. The box sends one line per event at 115200 baud:

```
DIAL,+1          spin right a few degrees      DIAL,-1   spin left
BTN,next         next variable                 BTN,prev  previous variable
SENSOR,temp,18.4 live reading (keys: temp, humidity, light, air, rain)
```

The site sends back `LED,up`, `LED,down` or `LED,none` whenever the selected
square changes. Without a controller everything works with mouse and keyboard:
arrow keys spin, `[` and `]` switch variables, Escape closes the panel.

## Notes for the team

* Projections in the side panel and time slider are a straight extension of
  the trend line, not a climate forecast. The UI says so wherever one is shown.
* Colours are red-orange (rising) and blue (falling), never red-green, and the
  direction is always written in words in the panel as well.
* All text is at least 14px and every number carries its units.
