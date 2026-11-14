"""Pull real climate data from Microsoft Planetary Computer into the globe's data files.

Source: TerraClimate (monthly, ~4 km, global land, 1958 to 2021) from the Planetary
Computer STAC catalogue, read straight from its Zarr store on Azure. Each 2-degree app
cell is the average of the 48 x 48 TerraClimate pixels inside it, so oceans have no data.

    temperature  <- (tmax + tmin) / 2            degC
    rainfall     <- ppt / days in month           mm per day
    sunlight     <- srad                          W/m2 (downward shortwave at the ground)
    humidity     <- vap x 10                      hPa (water vapour pressure)

Air pollution and ozone are not in TerraClimate, so their files are left alone.

Usage (from the repo root):
    pip install -r scripts/planetary_computer/requirements.txt
    python scripts/planetary_computer/build_from_pc.py fetch     # download + shrink, cached per year
    python scripts/planetary_computer/build_from_pc.py build     # write public/data files
    python scripts/planetary_computer/build_from_pc.py all       # both

Fetch reads 45 Zarr chunks per variable-year from Azure West Europe,
so the full run is big (fastest on an Azure VM in West Europe). It is resumable: finished years are cached in .cache/terraclimate
and skipped next time. Try `fetch --start 2020 --end 2021` first to time it.
"""
import argparse
import calendar
import json
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gridstats import (  # noqa: E402
    N_LAT, N_LON, PX, ROW_END, ROW_START, SRC_COLS, SRC_ROWS,
    accumulate_rows, cell_centres, cell_id, trend_stats,
)

ROOT = Path(__file__).resolve().parents[2]
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/"
COLLECTION = "terraclimate"
SOURCE_TEXT = "TerraClimate (Abatzoglou et al. 2018) via Microsoft Planetary Computer"
TC_LAST_YEAR = 2021  # current end of the Planetary Computer copy

# App variable -> TerraClimate inputs, how to combine them, rounding, variables.json updates.
APP_VARS = {
    "temperature": {
        "inputs": ["tmax", "tmin"],
        "combine": lambda d, dim: (d["tmax"] + d["tmin"]) / 2,
        "decimals": 2,
        "meta": {"source": f"{SOURCE_TEXT}, monthly mean of daily max and min"},
    },
    "rainfall": {
        "inputs": ["ppt"],
        "combine": lambda d, dim: d["ppt"] / dim,
        "decimals": 3,
        "meta": {"source": SOURCE_TEXT},
    },
    "sunlight": {
        "inputs": ["srad"],
        "combine": lambda d, dim: d["srad"],
        "decimals": 1,
        "meta": {"source": f"{SOURCE_TEXT}, downward shortwave radiation"},
    },
    "humidity": {
        "inputs": ["vap"],
        "combine": lambda d, dim: d["vap"] * 10,
        "decimals": 2,
        "meta": {
            "source": f"{SOURCE_TEXT}, water vapour pressure",
            "definition": "How much water vapour is in the air, measured as vapour pressure",
            "units": "hPa",
            "units_long": "hectopascals of water vapour pressure",
            "units_per_decade": "hPa per decade",
            "decimals": 2,
            "colour_range_per_decade": 0.4,
        },
    },
}


# ---------------------------------------------------------------- fetch -----

def open_terraclimate():
    import planetary_computer
    import pystac_client
    import xarray as xr

    catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    asset = catalog.get_collection(COLLECTION).assets["zarr-abfs"]
    kwargs = dict(asset.extra_fields["xarray:open_kwargs"])
    opts = dict(kwargs.get("storage_options") or {})
    # Give up on a stalled download instead of waiting forever (VPNs and flaky wifi).
    timeouts = {"connection_timeout": 30, "read_timeout": 60}
    try:
        ds = xr.open_dataset(asset.href, **{**kwargs, "storage_options": {**opts, **timeouts}})
    except TypeError:  # older adlfs without these options
        ds = xr.open_dataset(asset.href, **kwargs)
    lat = ds["lat"].values
    lon = ds["lon"].values
    if lat.size != SRC_ROWS or lon.size != SRC_COLS:
        raise RuntimeError(f"Unexpected TerraClimate grid {lat.size}x{lon.size}; expected {SRC_ROWS}x{SRC_COLS}")
    if abs(abs(lat[0]) - (90 - 1 / 48)) > 1e-3 or abs(lon[0] - (-180 + 1 / 48)) > 1e-3:
        raise RuntimeError(f"Unexpected TerraClimate grid origin lat[0]={lat[0]} lon[0]={lon[0]}")
    return ds, bool(lat[0] > lat[-1])


def read_with_retry(read, label, tries=8):
    """Read one band of Zarr chunks, retrying just this band when the connection drops
    mid-download (aiohttp 'Response payload is not completed' and friends)."""
    for attempt in range(tries):
        pool = ThreadPoolExecutor(max_workers=1)
        try:
            # Hard limit as a backstop: a band that takes over 10 minutes is treated as stuck.
            return pool.submit(read).result(timeout=600)
        except Exception as e:
            if isinstance(e, FuturesTimeout):
                e = RuntimeError("no progress for 10 minutes")
            if attempt == tries - 1:
                raise
            wait = min(60, 5 * (attempt + 1))
            print(f"  {label}: {type(e).__name__}: {str(e)[:120]}, retrying in {wait}s", flush=True)
            time.sleep(wait)
        finally:
            pool.shutdown(wait=False)


def fetch_year(var, year, cache_dir, retries=4):
    out = cache_dir / var / f"{year}.npz"
    if out.exists():
        return f"{var} {year}: cached"
    out.parent.mkdir(parents=True, exist_ok=True)
    last_err = None
    for attempt in range(retries):
        try:
            t0 = time.time()
            ds, north_first = open_terraclimate()  # re-open each time so the SAS token is fresh
            da = ds[var]
            years = ds["time"].dt.year.values
            idx = np.where(years == year)[0]
            if idx.size != 12:
                raise RuntimeError(f"{var} {year}: found {idx.size} months, need 12")
            sums = np.zeros((12, N_LAT, N_LON))
            counts = np.zeros((12, N_LAT, N_LON))
            band = 1024  # matches the Zarr chunk height
            step, n_steps = 0, 2 * len([r for r in range(0, SRC_ROWS, band) if r + band > ROW_START and r < ROW_END])
            print(f"  {var} {year}: started", flush=True)
            for r0 in range(0, SRC_ROWS, band):
                r1 = min(SRC_ROWS, r0 + band)
                if r1 <= ROW_START or r0 >= ROW_END:
                    continue
                for m0 in (0, 6):  # 6 months at a time keeps memory near 0.5 GB
                    half = idx[m0:m0 + 6]
                    if north_first:
                        block = read_with_retry(lambda: da.isel(time=half, lat=slice(r0, r1)).values, f"{var} {year} rows {r0}")
                    else:
                        block = read_with_retry(
                            lambda: da.isel(time=half, lat=slice(SRC_ROWS - r1, SRC_ROWS - r0)).values[:, ::-1, :], f"{var} {year} rows {r0}"
                        )
                    part_s = np.zeros((6, N_LAT, N_LON))
                    part_c = np.zeros((6, N_LAT, N_LON))
                    accumulate_rows(block.astype(np.float32, copy=False), r0, part_s, part_c)
                    sums[m0:m0 + 6] += part_s
                    counts[m0:m0 + 6] += part_c
                    step += 1
                    print(f"  {var} {year}: {step}/{n_steps} downloaded ({time.time() - t0:.0f}s)", flush=True)
            with np.errstate(invalid="ignore", divide="ignore"):
                mean = (sums / counts).astype(np.float32)
            frac = (counts / (PX * PX)).astype(np.float32)
            tmp = out.with_name(out.stem + ".tmp.npz")
            np.savez_compressed(tmp, mean=mean, frac=frac)
            tmp.replace(out)
            return f"{var} {year}: done in {time.time() - t0:.0f}s"
        except Exception as e:  # network blips, expired tokens
            last_err = e
            wait = 10 * (attempt + 1)
            print(f"  {var} {year}: {e!r}, retrying in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"{var} {year} failed after {retries} tries: {last_err!r}")


def cmd_fetch(args):
    tc_vars = sorted({v for name in args.variables for v in APP_VARS[name]["inputs"]})
    tasks = [(v, y) for v in tc_vars for y in range(args.start, args.end + 1)]
    todo = [t for t in tasks if not (args.cache / t[0] / f"{t[1]}.npz").exists()]
    failed = 0
    print(f"TerraClimate {', '.join(tc_vars)} {args.start}-{args.end}: {len(tasks)} variable-years, {len(todo)} to fetch")
    done = len(tasks) - len(todo)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(fetch_year, v, y, args.cache) for v, y in todo]
        failed = 0
        for f in as_completed(futures):
            done += 1
            try:
                print(f"[{done}/{len(tasks)}] {f.result()}", flush=True)
            except Exception as e:
                failed += 1
                print(f"[{done}/{len(tasks)}] FAILED: {e}", flush=True)
    if failed:
        print(f"{failed} variable-years failed. Run the same command again to retry just those.")


# ---------------------------------------------------------------- build -----

def load_cube(var, start, end, cache_dir):
    means, fracs = [], []
    for y in range(start, end + 1):
        p = cache_dir / var / f"{y}.npz"
        if not p.exists():
            raise SystemExit(f"Missing {p}. Run the fetch step first (same --start/--end).")
        z = np.load(p)
        means.append(z["mean"])
        fracs.append(z["frac"])
    return np.concatenate(means), np.concatenate(fracs)  # (months, 89, 180)


def demo_cells(data_dir):
    lats, lons = cell_centres()
    out = set()
    demos = json.loads((data_dir / "demos.json").read_text())["demos"]
    for d in demos:
        for s in d["steps"]:
            la = int(lats[np.argmin(np.abs(lats - s["lat"]))])
            lo = int(lons[np.argmin(np.abs(lons - s["lon"]))])
            out.add(cell_id(la, lo))
    return out


def cmd_build(args):
    data_dir = args.out
    dates = [f"{y}-{m:02d}" for y in range(args.start, args.end + 1) for m in range(1, 13)]
    month_idx = np.tile(np.arange(12), args.end - args.start + 1)
    dim = np.array([calendar.monthrange(y, m)[1] for y in range(args.start, args.end + 1) for m in range(1, 13)], dtype=np.float64)

    vars_path = data_dir / "variables.json"
    var_file = json.loads(vars_path.read_text())
    var_defs = {v["id"]: v for v in var_file["variables"]}
    wanted_series = demo_cells(data_dir) if args.series == "demos" else None

    lats, lons = cell_centres()
    for name in args.variables:
        spec = APP_VARS[name]
        cubes, frac = {}, None
        for v in spec["inputs"]:
            cubes[v], f = load_cube(v, args.start, args.end, args.cache)
            frac = f if frac is None else np.minimum(frac, f)
        data = spec["combine"](cubes, dim[:, None, None]).astype(np.float64)  # months, 89, 180

        # Cells: enough land in the square, and a value for every month.
        land = frac.mean(axis=0) >= args.min_land
        complete = np.isfinite(data).all(axis=0)
        ok = land & complete
        li, lo = np.nonzero(ok)
        series = data[:, li, lo].T  # cells, months
        stats = trend_stats(series, month_idx)

        d = spec["meta"].get("decimals", var_defs[name]["decimals"])
        units_per_decade = spec["meta"].get("units_per_decade", var_defs[name]["units_per_decade"])
        cells = []
        for k in range(len(li)):
            slope_dec = float(stats["slope_per_year"][k] * 10)
            p = float(stats["p_value"][k])
            cells.append({
                "id": cell_id(int(lats[li[k]]), int(lons[lo[k]])),
                "lat": int(lats[li[k]]),
                "lon": int(lons[lo[k]]),
                "slope_per_decade": round(slope_dec, d + 1),
                "p_value": round(p, 4),
                "significant": p < 0.05,
                "direction": "up" if slope_dec >= 0 else "down",
            })
        trends = {
            "variable": name,
            "units_per_decade": units_per_decade,
            "start_year": args.start,
            "end_year": args.end,
            "end_month": 12,
            "data_source": spec["meta"]["source"],
            "series_decimals": spec["decimals"],
            "cells": cells,
        }
        (data_dir / f"trends_{name}.json").write_text(json.dumps(trends, separators=(",", ":")))
        sig = sum(c["significant"] for c in cells)
        print(f"trends_{name}.json  {len(cells)} land cells, {sig} significant ({100 * sig / max(1, len(cells)):.0f}%)")

        # Compact series: the browser works out the trend line, band and projection.
        sdir = data_dir / "series" / name
        if args.series != "none":
            if sdir.exists():
                shutil.rmtree(sdir)  # old placeholder files would be mistaken for real ones
            sdir.mkdir(parents=True)
            written, total = 0, 0
            for k, c in enumerate(cells):
                if wanted_series is not None and c["id"] not in wanted_series:
                    continue
                body = json.dumps(
                    {
                        "variable": name, "cell_id": c["id"], "lat": c["lat"], "lon": c["lon"],
                        "start": dates[0],
                        "values": [round(float(x), spec["decimals"]) for x in series[k]],
                    },
                    separators=(",", ":"),
                )
                (sdir / f"{c['id']}.json").write_text(body)
                written += 1
                total += len(body)
            print(f"  series/{name}/  {written} files, {total / 1e6:.1f} MB")

        var_defs[name].update(spec["meta"])

    var_file["source"] = "See each variable's source"
    vars_path.write_text(json.dumps(var_file, indent=2, ensure_ascii=False) + "\n")
    print("variables.json updated with sources and units")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["fetch", "build", "all"])
    ap.add_argument("--start", type=int, default=1980)
    ap.add_argument("--end", type=int, default=TC_LAST_YEAR)
    ap.add_argument("--variables", default=",".join(APP_VARS), help="comma list of app variables")
    ap.add_argument("--workers", type=int, default=2, help="parallel downloads (each needs ~1 GB RAM)")
    ap.add_argument("--cache", type=Path, default=ROOT / ".cache" / "terraclimate")
    ap.add_argument("--out", type=Path, default=ROOT / "public" / "data")
    ap.add_argument("--series", choices=["all", "demos", "none"], default="all")
    ap.add_argument("--min-land", type=float, default=0.25, help="min share of land pixels for a cell")
    args = ap.parse_args()
    args.variables = [v.strip() for v in args.variables.split(",") if v.strip()]
    for v in args.variables:
        if v not in APP_VARS:
            ap.error(f"unknown variable {v}; choose from {', '.join(APP_VARS)}")
    if args.end > TC_LAST_YEAR:
        ap.error(f"TerraClimate on Planetary Computer ends in {TC_LAST_YEAR}")
    if args.step in ("fetch", "all"):
        cmd_fetch(args)
    if args.step in ("build", "all"):
        cmd_build(args)


if __name__ == "__main__":
    main()
