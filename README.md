# Earth Trend Globe

Interactive 3D globe for the NASA Space Apps challenge on Earth science trends.
Spin the globe, pick a variable, click anywhere to see how it has changed since
1980, whether the change is significant, and where it might go by 2040.

It also shows live storms, floods, fires and icebergs from NASA's natural event
tracker (EONET), and links each one to the long-term trend at the same spot.

> **Note:** the long-term trend data in `public/data` is generated placeholder
> data in the real MERRA-2 file format, made by `npm run generate-data`, until you
> run the Planetary Computer script below for the real thing. The live events are real and come straight from NASA.

Built from the "Earth Trend Globe – Frontend Design Brief" (Phases 1 to 6).
Phase 7 (real data, deploy) is left for when the data team sends files.

## Run it

```bash
npm install
npm run generate-data   # writes fake MERRA-2 style files into public/data
npm run dev             # http://localhost:5173
```

`npm run build` makes a static site in `dist/` ready for Vercel or Netlify.
No backend is needed. Everything is static JSON under `public/data`.

## What is where

| Path | What it does |
| --- | --- |
| `src/App.jsx` | State and layout: variable, year, selected square, demos, hardware |
| `src/components/GlobeView.jsx` | react-globe.gl globe. The 16,020 grid values are blended into one smooth colour texture wrapped just above the map, repainted and cross-faded when the variable changes |
| `src/components/SidePanel.jsx` | Place, variable, verdict card, Plotly graph, prediction note, the numbers, "How it connects", live sensor reading |
| `src/components/TrendChart.jsx` | Plotly chart: monthly line, trend line, 95% band, dotted projection with widening band |
| `src/components/TimeSlider.jsx` | 1980 to 2040 slider with measured/projected styling and play button |
| `src/components/Legend.jsx`, `TopBar.jsx`, `Tooltip.jsx`, `IntroScreen.jsx`, `DemoOverlay.jsx`, `HowItWorks.jsx`, `SignificanceExplainer.jsx` | The other screens and cards |
| `src/hooks/useSerialController.js` | Web Serial link to the Arduino/ESP32 box |
| `src/lib/data.js` | Loads the JSON files. Falls back to a synthesised series when a cell has no file yet |
| `src/lib/fakeSeries.js` | Deterministic fake monthly series, shared by the browser and the generator script. Each one's fitted line equals the cell's slope in the trends file, and its noise is sized so the chart agrees with the cell's significance |
| `src/lib/colors.js` | Red-blue diverging ramps, how see-through each trend is, and the pale "not significant" colour |
| `src/lib/mapStyles.js` | The three map looks: satellite, night lights and street map |
| `src/components/MapControls.jsx` | Map style switcher, trend colours slider and place names switch |
| `src/lib/events.js` | NASA EONET live events: fetch, offline copy, grouping wildfires, plain-English headlines, Worldview links |
| `src/hooks/useNasaEvents.js` | Loads the events and refreshes them every 20 minutes |
| `src/components/NewsTicker.jsx`, `EventsDrawer.jsx`, `EventIcon.jsx` | Headline bar, the events list and detail view, category icons |
| `src/lib/places.js` | Continent and country label positions and the zoom levels they appear at |
| `scripts/generate-fake-data.mjs` | Writes `trends_<variable>.json` for all six variables and series files for the demo locations |
| `public/data/variables.json` | Names, plain-English definitions, units, colour ranges and sensor mapping. The dropdown, legend and side panel all read from here |
| `public/data/regions.json` | Named areas (bounding boxes) plus a list of places for the nearest-place fallback |
| `public/data/demos.json` | Guided demo steps: lat, lon, variable, year, caption |

## Data format

Exactly as in the brief, so real files drop in with no code changes.

* `public/data/trends_<variable>.json` colours the globe:
  `{ variable, units_per_decade, start_year, end_year, cells: [{ id, lat, lon, slope_per_decade, p_value, significant, direction }] }`
  Cell ids are `c_<lat>_<lon>` on even degrees, for example `c_54_-6` covers 53 to 55 N and 7 to 5 W.
* `public/data/series/<variable>/<cell id>.json` is loaded on click:
  `{ dates, values, deseasonalised, trend_line, ci_low, ci_high, prediction: { dates, values, low, high }, mann_kendall: { tau, p_value }, total_change }`
  Missing files are synthesised in the browser so the UI never breaks before real data arrives.
  To write a file for every cell (about 100k files) run `node scripts/generate-fake-data.mjs --all-series`.

To swap in real data: copy the data team's files over `public/data`, keep
`variables.json`, `regions.json` and `demos.json`, and reload.

## Real data from Microsoft Planetary Computer

`scripts/planetary_computer/build_from_pc.py` replaces the placeholder files for
**temperature, rainfall, sunlight and humidity** with real monthly data from
[TerraClimate](https://planetarycomputer.microsoft.com/dataset/terraclimate)
(Abatzoglou et al. 2018, CC0), read straight from the Planetary Computer's Zarr
store on Azure. No account or key is needed.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/planetary_computer/requirements.txt
python scripts/planetary_computer/build_from_pc.py fetch --start 2020 --end 2021   # quick test, times one year
python scripts/planetary_computer/build_from_pc.py all                             # 1980-2021, all four variables
```

* Each 2° cell is the average of the 48 × 48 TerraClimate pixels (~4 km) inside it.
  TerraClimate covers land only, so ocean cells have no data and stay clear on the globe.
* Temperature is the mean of monthly max and min. Rainfall is converted to mm per day.
  Sunlight is downward shortwave radiation. Humidity becomes water vapour pressure in hPa
  (`variables.json` is updated to match).
* The data on Planetary Computer runs to December 2021, so `end_year` becomes 2021.
* Fetching is the slow part: about 45 Zarr chunks per variable per year. Finished years are
  cached in `.cache/terraclimate`, so you can stop and resume. It runs fastest on an Azure VM
  in West Europe (the Azure Global Offer credit covers this), next to the data.
* Trend significance uses the least-squares slope of the deseasonalised monthly series, with
  the p-value corrected for month-to-month autocorrelation. Mann-Kendall on yearly means is
  shown alongside it in the panel.
* Series files are compact (`start` + monthly `values`, ~3 KB). The browser works out the
  seasons-removed line, trend, band and projection with the same code as the placeholder data
  (`analyseSeries` in `src/lib/fakeSeries.js`). Once a variable is real, missing cells show no
  chart rather than a made-up one.
* Air pollution and ozone are not in TerraClimate and stay as placeholder data. The side panel
  shows each variable's source so this is visible.

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
them all. All three choices are remembered per
browser.

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
and day. This is how the app adds on to NASA's own tools: Worldview and EONET
show what is happening, and the globe answers whether it fits a long-term trend.

The last good copy is kept in the browser, so a demo on bad Wi-Fi still shows
events (marked "SAVED" instead of "LIVE"). The "NASA live events" switch in the
map controls hides it all. Event text from the feed is only ever shown as text,
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
arrow keys spin, `[` and `]` switch variable, Escape closes the panel.

## Notes for the team

* Predictions are a straight extension of the trend line, not a climate
  forecast. The UI says so wherever a projection is shown.
* Colours are red-orange (rising) and blue (falling), never red-green, and the
  direction is always written in words in the panel as well.
* All text is at least 14px and every number carries its units.
