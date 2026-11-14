"""Grid and trend maths for the Planetary Computer pipeline. numpy only.

Kept separate from the network code so it can be tested without Azure access.

App grid (src/lib/cells.js): 2-degree cells centred on even degrees,
lat -88..88 (89 rows, index 0 = -88), lon -180..178 (180 columns).
Cell c_54_-6 covers lat 53..55 and lon -7..-5. Cell lon -180 wraps: 179..181.

TerraClimate on Planetary Computer: 1/24 degree, lat 4320 rows from +89.98
(north) down to -89.98, lon 8640 columns from -179.98 east.
One app cell = 48 x 48 TerraClimate pixels.
"""
import math

import numpy as np

N_LAT, N_LON, STEP = 89, 180, 2
LAT_MIN, LON_MIN = -88, -180
PX = 48  # TerraClimate pixels per 2 degrees
SRC_ROWS, SRC_COLS = 4320, 8640
ROW_START = 24  # first source row inside cell lat 88 (89..87 N)
ROW_END = ROW_START + N_LAT * PX  # 4296, last row is inside cell lat -88
COL_ROLL = 24  # roll lon so column 0 starts at 179 E (west edge of cell lon -180)


def cell_id(lat, lon):
    return f"c_{lat}_{lon}"


def cell_centres():
    lats = LAT_MIN + STEP * np.arange(N_LAT)
    lons = LON_MIN + STEP * np.arange(N_LON)
    return lats, lons


def accumulate_rows(block, row0, sums, counts):
    """Add one horizontal band of source pixels into per-cell sums and counts.

    block: (T, R, 8640) float array, source rows row0..row0+R-1 (north first).
    sums, counts: (T, 89, 180) float64 arrays, updated in place.
    """
    t, r, w = block.shape
    if w != SRC_COLS:
        raise ValueError(f"expected {SRC_COLS} columns, got {w}")
    rows = np.arange(row0, row0 + r)
    keep = (rows >= ROW_START) & (rows < ROW_END)
    if not keep.any():
        return
    sub = np.roll(block[:, keep, :], COL_ROLL, axis=2).reshape(t, keep.sum(), N_LON, PX)
    valid = np.isfinite(sub)
    row_sum = np.where(valid, sub, 0.0).sum(axis=3, dtype=np.float64)  # T, R', 180
    row_cnt = valid.sum(axis=3)
    li = (N_LAT - 1) - (rows[keep] - ROW_START) // PX  # 0 = lat -88
    for cell_row in np.unique(li):
        m = li == cell_row
        sums[:, cell_row, :] += row_sum[:, m, :].sum(axis=1)
        counts[:, cell_row, :] += row_cnt[:, m, :].sum(axis=1)


def two_sided_p(z):
    """Normal two-sided p-value, same as twoSidedP in src/lib/fakeSeries.js."""
    z = np.abs(np.asarray(z, dtype=np.float64))
    erf = np.vectorize(math.erf)
    p = 2 * (1 - 0.5 * (1 + erf(z / math.sqrt(2))))
    return np.clip(p, 1e-6, 1)


def deseasonalise(values, months):
    """values: (C, n). months: (n,) 0..11. Returns anomalies from each calendar month's mean."""
    out = np.empty_like(values, dtype=np.float64)
    for m in range(12):
        sel = months == m
        out[:, sel] = values[:, sel] - values[:, sel].mean(axis=1, keepdims=True)
    return out


def trend_stats(values, months):
    """Least-squares trend of the deseasonalised monthly series for many cells at once.

    Matches linearFit/analyseSeries in src/lib/fakeSeries.js for the slope, so the
    chart line drawn in the browser equals the slope in the trends file. The p-value
    is corrected for month-to-month memory (lag-1 autocorrelation of the residuals),
    otherwise monthly data looks far more significant than it is.

    Returns dict of (C,) arrays: slope_per_year, p_value, p_value_naive, r1.
    """
    y = deseasonalise(values, months)
    c, n = y.shape
    t = np.arange(n) / 12.0
    tc = t - t.mean()
    sxx = (tc**2).sum()
    yc = y - y.mean(axis=1, keepdims=True)
    slope = (yc * tc).sum(axis=1) / sxx
    resid = yc - slope[:, None] * tc
    s = np.sqrt((resid**2).sum(axis=1) / (n - 2))
    se = s / math.sqrt(sxx)
    with np.errstate(divide="ignore", invalid="ignore"):
        r1 = (resid[:, 1:] * resid[:, :-1]).sum(axis=1) / (resid**2).sum(axis=1)
        r1 = np.nan_to_num(np.clip(r1, 0, 0.95))
        n_eff = np.clip(n * (1 - r1) / (1 + r1), 3, n)
        se_adj = se * np.sqrt((n - 2) / (n_eff - 2))
        z_naive = np.where(se > 0, slope / se, 0)
        z = np.where(se_adj > 0, slope / se_adj, 0)
    return {
        "slope_per_year": slope,
        "p_value": two_sided_p(z),
        "p_value_naive": two_sided_p(z_naive),
        "r1": r1,
    }
