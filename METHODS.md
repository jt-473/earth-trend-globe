# How Earth Trend Globe calculates everything

Every calculation the globe, the side panel, the data detective and the 2040 outlook
use. Each one has its proper name (so you can look it up or say it to a judge), the
formula, what it means in plain words, and where it shows up in the app.

**Symbols:** $x$ is a monthly value, $a$ is a value with the seasons removed, $t$ is time
in years, $n$ is the number of months, $\Sigma$ means "add them all up", and $\bar{x}$ is
the average of $x$.

| Part | Code |
| --- | --- |
| Trend statistics for points and regions | [`src/lib/stats.js`](src/lib/stats.js), [`src/lib/fakeSeries.js`](src/lib/fakeSeries.js) (Mann-Kendall, p-values) |
| Globe colours | [`src/lib/colors.js`](src/lib/colors.js), [`src/components/GlobeView.jsx`](src/components/GlobeView.jsx) |
| Regions and the data detective | [`src/lib/data.js`](src/lib/data.js), [`src/lib/explore.js`](src/lib/explore.js) |
| 2040 outlook model | [`src/lib/outlook.js`](src/lib/outlook.js), [`scripts/build-outlook.mjs`](scripts/build-outlook.mjs) |

## Contents

1. [The data](#1-the-data)
2. [Removing the seasons](#2-removing-the-seasons)
3. [The trend line](#3-the-trend-line)
4. [Is the trend real?](#4-is-the-trend-real)
5. [A second test: Mann–Kendall](#5-a-second-test-mannkendall)
6. [Confidence band and side-panel projection](#6-confidence-band-and-side-panel-projection)
7. [Years until significant](#7-years-until-significant)
8. [Colours on the globe](#8-colours-on-the-globe)
9. [Regions and the data detective](#9-regions-and-the-data-detective)
10. [The 2040 outlook model](#10-the-2040-outlook-model)
11. [Testing on the past](#11-testing-on-the-past)
12. [The other numbers on the 2040 screen](#12-the-other-numbers-on-the-2040-screen)
13. [What it can't do](#13-what-it-cant-do)

---

## 1. The data

The steps run in this order: **download** NASA POWER monthly values for 16,020 points
(1981 to 2025) → **store** them in small files the browser loads in pieces → **analyse**
the trend and tests for every point, area and month → **model** 2,000 possible futures to
2040 for 184 areas.

### NASA POWER monthly point data

Source: MERRA-2 reanalysis (temperature, humidity, rainfall, haze, ozone); GEWEX SRB and
CERES satellites (sunlight). One point every 2 degrees: 89 rows × 180 columns = 16,020
points, one value per month for six variables. Sunlight starts in 1984 and haze (aerosol
optical depth) in 2001, because that's where those records begin.

$$\text{W/m}^2 = \text{MJ/m}^2\text{/day} \times \frac{1{,}000{,}000}{86{,}400} = \text{MJ/m}^2\text{/day} \times 11.574$$

$$\text{value} = \text{stored whole number} \times \text{scale} \qquad (0.01 \text{ for °C},\ 0.0001 \text{ for haze}, \dots)$$

**In plain words:** NASA gives sunlight as energy per day; dividing by the seconds in a
day turns it into watts. Values are saved as whole numbers to keep the files small, then
multiplied back in the browser.

## 2. Removing the seasons

July is always hotter than January. To see long-term change, each month is compared with
a normal month of the same name.

### Monthly climatology

Also called: the "normal" or long-term monthly mean.

$$c_m = \frac{1}{N_m} \sum_{\text{years}} x_{\text{year}, m}$$

**In plain words:** the normal value for a month (say July) is the average of every July
in the record.
**Where you see it:** "Normal" in the Month by month table.

### Anomaly (deseasonalising)

Also called: seasonally adjusted value, departure from normal.

$$a_t = x_t - c_{m(t)}$$

**In plain words:** each month minus the normal for that month. Zero means a perfectly
normal month; +0.4 means 0.4 above normal.
**Example:** North Atlantic, January 2025: measured 22.78 °C, normal January 21.41 °C,
so the anomaly is +1.37 °C.
**Where you see it:** the "Seasons removed" chart, the "Compared with normal" column, and
every trend below.

## 3. The trend line

### Ordinary least squares (OLS) linear regression

Also called: line of best fit, least-squares trend.

$$b = \frac{\sum (t_i - \bar{t})(a_i - \bar{a})}{\sum (t_i - \bar{t})^2} \qquad \alpha = \bar{a} - b \bar{t}$$

$$\text{slope per decade} = 10 b \qquad \text{total change} = b \times \text{years of data}$$

**In plain words:** finds the one straight line closest to all the dots (it makes the
squared gaps as small as possible). $b$ is how much the value goes up each year; times 10
gives "per 10 years". The bottom part, $\sum (t_i - \bar{t})^2$, is called $S_{xx}$ below.
**Where you see it:** globe colours, the verdict ("Getting warmer by 0.20 °C every 10
years"), the blue trend line, "Total change since 1981".

### Residuals and residual standard deviation

$$e_i = a_i - (\alpha + b t_i) \qquad s = \sqrt{\frac{\sum e_i^2}{n - 2}}$$

**In plain words:** the residual is how far each month sits above or below the line. $s$
is the typical size of those wobbles.

## 4. Is the trend real?

Any wobbly line has some slope by chance. These steps decide whether the slope is bigger
than chance would give.

### Lag-1 autocorrelation

Also called: serial correlation, $r_1$.

$$r_1 = \frac{\sum e_i  e_{i-1}}{\sum e_i^2} \qquad \text{(kept between 0 and 0.95)}$$

**In plain words:** how much one month looks like the month before. A warm month is often
followed by another warm month, so the months aren't fully independent.

### Effective sample size

Method from Santer et al. (2000).

$$n_\text{eff} = n \frac{1 - r_1}{1 + r_1}$$

**In plain words:** because neighbouring months are alike, 540 months carry less
information than 540 separate measurements. This works out how many truly independent
values they're worth.

### Standard error of the slope (adjusted for autocorrelation)

$$\text{SE}(b) = \frac{s}{\sqrt{S_{xx}}} \times \sqrt{\frac{n - 2}{n_\text{eff} - 2}}$$

**In plain words:** how uncertain the slope is. The first part is the textbook formula;
the second makes it bigger to account for month-to-month memory, so the app doesn't
overstate how sure it is.

### z-score and two-sided p-value

Also called: Wald test on the slope, using the normal distribution.

$$z = \frac{b}{\text{SE}(b)} \qquad p = 2 \bigl(1 - \Phi(|z|)\bigr) \qquad \Phi(z) = \tfrac{1}{2}\Bigl(1 + \mathrm{erf}\bigl(z/\sqrt{2}\bigr)\Bigr)$$

Rule: **significant if $p < 0.05$** (the same as $|z| \ge 1.96$).

**In plain words:** $z$ says how many "uncertainties" the slope is away from zero. The
p-value is the chance of seeing a slope this big if nothing was really changing. Below 5%,
we call the change real. $\Phi$ is the bell curve's running total; the error function
erf is worked out with the Abramowitz and Stegun approximation 7.1.26.
**Where you see it:** the Rising / Falling / No clear trend badges, pale see-through areas
on the globe, the p-value in The numbers.

## 5. A second test: Mann–Kendall

### Mann–Kendall trend test, with Kendall's tau

A non-parametric (rank-based) test, run on yearly averages of the anomalies (years with at
least 9 months).

$$S = \sum_{i \lt j} \mathrm{sign}(x_j - x_i) \qquad \tau = \frac{S}{n(n-1)/2}$$

$$\mathrm{Var}(S) = \frac{n(n-1)(2n+5)}{18} \qquad z = \frac{S - \mathrm{sign}(S)}{\sqrt{\mathrm{Var}(S)}}$$

**In plain words:** compare every year with every later year and count "went up" minus
"went down". Tau runs from −1 (always falling) to +1 (always rising). Only the order
matters, so one extreme year can't fake a trend. The "− sign(S)" is a small continuity
correction.
**Where you see it:** Mann-Kendall tau and p-value in The numbers.

## 6. Confidence band and side-panel projection

### 95% confidence interval of the regression line

$$\hat{y}(t) \pm 1.96 \cdot s \cdot F \cdot \sqrt{\frac{1}{n} + \frac{(t - \bar{t})^2}{S_{xx}}} \qquad F = \sqrt{\frac{n - 2}{n_\text{eff} - 2}}$$

**In plain words:** the shaded band around the trend line. We're 95% sure the true line is
inside it. It's narrowest in the middle of the record and wider at the ends. $F$ is the
same autocorrelation adjustment as above.

### Straight-line extrapolation

$$\text{band width uses } \sqrt{\frac{1}{n} + \frac{(t - \bar{t})^2}{S_{xx}} + \left(\frac{\Delta}{12}\right)^2} \qquad \Delta = \text{years past the end of the data}$$

**In plain words:** the dotted orange line in the side panel just carries the trend line
forward to 2040. The extra $(\Delta/12)^2$ term is a simple rule of thumb that makes the
band widen the further ahead it goes. For a proper forecast with tested ranges, use the
2040 outlook (section 10).

## 7. Years until significant

### Power-law scaling of the slope's uncertainty

$$\text{SE}(b) \propto T^{-3/2} \quad\Rightarrow\quad z \propto T^{3/2} \quad\Rightarrow\quad \text{extra years} = T\left(\left(\frac{1.96}{|z|}\right)^{2/3} - 1\right)$$

**In plain words:** with a longer record the slope gets more certain: its uncertainty
shrinks with the record length $T$ to the power 1.5. So we can work out how long the
record would need to be, at the same pace, for $z$ to reach 1.96. When only $p$ is
available, $z$ is found from it by bisection (repeatedly halving the search range). Over 60
extra years, the app says it's most likely natural ups and downs.
**Where you see it:** "Not significant yet. About N more years of data could be enough…"

## 8. Colours on the globe

### Accumulated change for the time slider

$$\text{change by year } Y = \frac{\text{slope per decade} \times (Y - \text{start year})}{10} \qquad R = \text{colour range per decade} \times \frac{\text{years in record}}{10}$$

**In plain words:** moving the slider recolours each point by how much change has built up
by that year. $R$ is the amount that gets full colour (temperature: 0.5 °C per decade).

### Colour strength (power-curve scaling) and ramp interpolation

$$\text{strength} = \left|\mathrm{clamp}\left(\frac{\text{change}}{R}, -1, 1\right)\right|^{0.7} \qquad \text{opacity} = 0.2 + 0.8 \times \text{strength}$$

**In plain words:** the 0.7 power lifts medium-sized changes so they still show. The colour
is picked by linear interpolation along a 5-colour ramp (pale cream → yellow → orange → red
for rising, pale → light blue → deep blue for falling). Places that aren't significant get
a light grey at 22% opacity. The Trend colours slider then scales the opacity: up to 70%
it fades everything in, above 70% it fills in towards solid.

### Binomial smoothing filter and bilinear interpolation

$$\text{new value} = \frac{\text{left} + 2 \times \text{middle} + \text{right}}{4} \qquad \text{(run twice, across and up/down)}$$

**In plain words:** softens the hard edges between 2-degree squares so the map reads as one
smooth picture. Each pixel of the texture then blends its four nearest grid points
(bilinear interpolation). This is only for looks; every number in the panel comes from the
unsmoothed data.

## 9. Regions and the data detective

### Area-weighted mean (cosine of latitude weighting)

$$w = \cos(\text{latitude}) \qquad \bar{x}_t = \frac{\sum w x_t}{\sum w}$$

**In plain words:** grid squares get smaller towards the poles, so each point counts in
proportion to the ground it covers. A month is used only if points covering at least half
the area have data. The averaged record then goes through exactly the same steps 2 to 7.
**Where you see it:** any region from Investigate, a drawn box, and every area in the 2040
outlook.

### Share of area rising or falling

$$\text{up share} = \frac{\sum w \ (\text{significant and rising})}{\sum w} \qquad \text{mixed if up share} \ge 0.2 \text{ and down share} \ge 0.2$$

**In plain words:** an average can hide places going opposite ways (like Antarctica's
warming inland and cooling coast), so the detective also reports how much of the area is
significantly rising and falling.

### Ranking score

$$\text{score} = \min\left(1, \frac{\lvert\text{average slope}\rvert}{\text{colour range}}\right) \times \bigl(0.3 + 0.7 \times \max(\text{up share}, \text{down share})\bigr)$$

**In plain words:** places rank higher when they change a lot and when a large share of
them changes significantly. This orders the suggestions in Investigate.

## 10. The 2040 outlook model

A statistical forecasting model: trend plus realistic random ups and downs, run thousands
of times. Built for 184 areas and six variables by `npm run build-outlook`.

### The model equation

A linear trend with AR(1) noise, month-specific variability and a yearly random effect.

$$x_t = L + \beta (t - \bar{t}) + \sigma_{m(t)} u_t + Y_{\text{year}(t)}$$

**In plain words:** each future month = the trend line (level $L$ and slope $\beta$) + a
monthly wobble $u$ scaled by how wobbly that calendar month usually is ($\sigma_m$) + a
whole-year wobble $Y$ for slow swings like El Niño. Everything is fitted to the
season-free values from section 2.

### First-order autoregressive process, AR(1)

$$u_t = \varphi u_{t-1} + \sqrt{1 - \varphi^2} \varepsilon_t \qquad Y_k = \varphi_Y Y_{k-1} + \sqrt{1 - \varphi_Y^2} \sigma_Y \varepsilon_k$$

**In plain words:** each month carries a share $\varphi$ of the last month's wobble, plus
something new and random ($\varepsilon$). $\varphi$ is the lag-1 autocorrelation of the
residuals (section 4). The year wobble works the same way from year to year, with
$\varphi_Y$ capped at 0.8. The futures start from the last real month's wobble.

### Per-month variability and variance decomposition

$$\sigma_m = \sqrt{\frac{\sum e^2 \ (\text{that calendar month})}{N_m - 1}} \qquad V_{12}(\varphi) = \frac{1}{144}\sum_{i=1}^{12}\sum_{j=1}^{12} \varphi^{|i-j|}$$

$$\sigma_Y^2 = \max\bigl(0,\ \mathrm{Var}(\text{yearly residuals}) - \bar{\sigma}^2 V_{12}(\varphi)\bigr)$$

**In plain words:** $\sigma_m$ lets winter be wobblier than summer (or the other way
round). $V_{12}$ is how much the average of 12 AR(1) months should vary on its own. If
real years vary more than that, the difference becomes the extra year-to-year wobble
$\sigma_Y$.

### Parameter uncertainty

$$\text{SE}(\beta) = \max(\text{monthly SE from section 4},\ \text{yearly SE}) \qquad \text{SE}(L) = \sqrt{\mathrm{Var}(\text{yearly residuals}) / n_{\text{eff, yearly}}}$$

**In plain words:** we don't know the exact trend line, so each future picks its own:
$\beta \sim N(\hat\beta, \text{SE}(\beta)^2)$ and $L \sim N(\hat{L}, \text{SE}(L)^2)$. The
yearly SE repeats section 4 on yearly averages; taking the larger of the two is the
cautious choice.

### Monte Carlo simulation

Random numbers: Box–Muller transform, from a Mulberry32 seeded random generator.

$$\varepsilon = \sqrt{-2 \ln U_1} \cos(2\pi U_2) \qquad 2{,}000 \text{ futures per area per variable}$$

**In plain words:** the model is run 2,000 times, each with its own trend line and its own
random wobbles. Box–Muller turns two plain random numbers between 0 and 1 into one
bell-curve random number. The generator is seeded from the variable and area name, so
running the build again gives exactly the same results.

### Percentiles (empirical quantiles)

Sort the 2,000 yearly values, then take position $(2000 - 1) \times q$ for
$q$ = 5%, 25%, 50%, 75%, 95% (linear interpolation between neighbours).

**In plain words:** the middle (50th percentile) is "most likely". 25% to 75% is the
"1 in 2 chance" band; 5% to 95% is the "9 in 10 chance" band. Everything is shown as
change from the average of the first 10 years (1981 to 1990 for most variables).
**Where you see it:** the headline number, the orange fan, and the thin "possible
futures" lines (the runs at the 15th, 40th, 60th and 85th percentile of 2040).

### Model selection: whole record or the last 20 years

$$\text{for each area: ratio} = \frac{\text{MAE of the model}}{\text{MAE of "no change"}} \qquad \text{keep the version with the lower median ratio across 184 areas}$$

**In plain words:** we built two versions: one fits the trend to the whole record, one to
the last 20 years only. Both were tested on the past (section 11). Whichever guessed
better is used for that variable.

## 11. Testing on the past

### Backtesting (out-of-sample hindcast)

$$\text{training years} = \mathrm{clamp}\bigl(\mathrm{round}(0.6 \times \text{years}),\ 10,\ 30\bigr)$$

For temperature: train on 1981–2007, test on 2008–2025.

**In plain words:** we hide the later years, fit the model to the early years only, and
ask it to forecast years we already know. Then we compare.

### Mean absolute error (MAE) against a persistence forecast

$$\text{MAE} = \frac{1}{N}\sum \bigl|\text{real} - \text{model's middle guess}\bigr| \qquad \text{"no change"} = \text{average of the last 10 training years}$$

**In plain words:** how far off the guesses were on average, compared with the simplest
possible forecast: assume nothing changes from the last 10 years.
**Example:** whole-world temperature: the model was off by 0.14 °C on average; "no change"
was off by 0.20 °C. All 18 real years landed inside its 9 in 10 range.

### Coverage and calibration by bisection

$$\text{coverage} = \frac{\text{real years inside the 5 to 95 percent range}}{\text{all tested years}} \qquad \text{find } k \in [1, 4] \text{ so coverage} \ge 90 \text{ percent}$$

**In plain words:** a 9 in 10 range should catch about 9 in 10 real years. The first
version caught fewer (it was too confident), so the uncertainty of the level, the slope
and the year wobble is multiplied by a spread factor $k$. $k$ is found by bisection: try
the middle of the range, keep the half that works, repeat 7 times.

| Variable | Version chosen | Error vs "no change" (whole / last 20) | Caught before | Spread $k$ | Caught after |
| --- | --- | ---: | ---: | ---: | ---: |
| Temperature | Whole record | 0.89 / 0.96 | 77% | 2.01 | 90% |
| Humidity | Last 20 years | 0.84 / 0.81 | 81% | 1.59 | 90% |
| Rainfall | Whole record | 1.09 / 1.13 | 75% | 2.15 | 90% |
| Sunlight | Last 20 years | 1.21 / 1.13 | 81% | 1.42 | 90% |
| Air pollution | Whole record | 1.10 / 1.10 | 75% | 1.84 | 90% |
| Ozone | Last 20 years | 1.22 / 1.07 | 95% | 1.00 | 95% |

Below 1 means the model beat "no change" in a typical area. Temperature and humidity beat
it. Rainfall, sunlight, haze and ozone are harder: in a typical small area they did no
better than "no change", which is why their ranges are wide. Ozone picked the last 20
years because the ozone layer stopped thinning and started recovering after the 1987
Montreal Protocol.

## 12. The other numbers on the 2040 screen

### Unusual months (percentile thresholds)

$$\text{threshold}_m = \text{90th percentile of month } m\text{'s anomalies in the first 10 years} \qquad \text{share} = \frac{\text{months above it}}{\text{all months}}$$

**In plain words:** by definition, 1 in 10 months was "unusually hot" in the 1980s. We
count how often that bar is beaten in each later decade, and in the 2031–2040 futures.
"Unusually cold" uses the 10th percentile the same way.

### Record probabilities (Monte Carlo frequencies)

$$P(\text{2040 beats the record}) = \frac{\text{futures where 2040} > \text{highest year measured}}{2{,}000}$$

**In plain words:** chances are simply counted across the 2,000 futures. "At least one new
record by 2040" counts futures with any year above the record; the typical number of new
records is the median count. "A typical 2040 beats N of 45 years" counts measured years
below the 2040 middle value.

### Warmest month

$$\text{late-2030s value} = \text{normal}_m^{\text{first 10 yrs}} + \Bigl(\overline{\text{future anomaly}}_{m,\ 2036\text{–}2040} - \overline{\text{anomaly}}_{m,\ \text{first 10 yrs}}\Bigr)$$

**In plain words:** turns the change back into a real temperature people recognise, like
"July: 18.3 °C → 20.3 °C" for Europe.

### Is it speeding up? (split-half trend comparison)

$$\text{ratio} = \frac{\text{OLS slope of the second half of the years}}{\text{OLS slope of the first half}} \qquad \text{faster if} > 1.25,\ \text{slower if} < 0.8$$

**Example:** Europe temperature: +0.30 °C per decade in 1981–2002, +0.58 °C per decade in
2003–2025.

### Your age numbers

$$\text{birth year} = 2026 - \text{age} \qquad \text{change since birth} = \frac{\text{slope per decade} \times (2025 - \text{birth year})}{10}$$

$$\text{more by 2040} = \text{2040 middle value} - \text{trend value in 2025}$$

### Clausius–Clapeyron check

Physics says warmer air holds about 7% more water vapour per 1 °C.

$$\text{percent per °C} = \frac{100 \times (\text{humidity slope} \div \text{average humidity})}{\text{temperature slope}} = \frac{100 \times (0.120 \div 10.209)}{0.172} \approx 6.8 \text{ percent}$$

**In plain words:** using the whole world's trends from our data, the air gained 6.8% more
water vapour for each degree of warming. This is an independent check that the data hangs
together.

## 13. What it can't do

* **Not a climate model.** It learns only from the pattern in NASA's data. It doesn't know
  about future emissions, policy or physics. IPCC climate models simulate those.
* **Straight lines.** The trend is a straight line (over the whole record or the last 20
  years). If change speeds up a lot, the forecast will be too low; the Compare line on the
  2040 screen shows the other version.
* **Surprises.** A big volcanic eruption or a very strong El Niño can push a single year
  outside the range. The ranges are tuned to catch 9 in 10 years, not all of them.
* **Grid, not cities.** Values are NASA's grid sampled every 2 degrees (about 220 km), so a
  city is part of a much bigger square. Rainfall from reanalysis is less certain than
  temperature.
