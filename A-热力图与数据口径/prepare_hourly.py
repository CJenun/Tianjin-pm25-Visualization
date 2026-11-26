"""Convert quotsoft china_sites_YYYYMMDD.csv files to the heatmap's hourly JS data.

Usage: python prepare_hourly.py path/to/china_sites_*.csv -o hourly-data.js
"""
import argparse
import csv
import glob
import json
from collections import defaultdict
from pathlib import Path

STATIONS = {"1027A", "2922A", "3051A", "3326A", "3327A"}


def read_files(paths, station_ids=STATIONS):
    """Keep the first valid value for each Beijing date, hour and station."""
    observations = {}
    rejected = defaultdict(int)
    for path in sorted(map(Path, paths)):
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            for line in csv.DictReader(stream):
                if line.get("type") != "PM2.5":
                    continue  # PM2.5_24h is a different statistic.
                raw_date = (line.get("date") or "").strip()
                raw_hour = (line.get("hour") or "").strip()
                if len(raw_date) != 8 or not raw_date.isdigit() or not raw_hour.isdigit():
                    rejected["bad_date_or_hour"] += 1
                    continue
                hour = int(raw_hour)
                if hour not in range(24):
                    rejected["bad_date_or_hour"] += 1
                    continue
                date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"
                for station in station_ids:
                    raw_value = (line.get(station) or "").strip()
                    if not raw_value:
                        rejected["missing"] += 1
                        continue
                    try:
                        value = float(raw_value)
                    except ValueError:
                        rejected["invalid"] += 1
                        continue
                    if not 0 <= value < float("inf"):
                        rejected["invalid"] += 1
                        continue
                    key = (date, station, hour)
                    if key in observations:
                        rejected["duplicate"] += 1
                        continue
                    observations[key] = {"date": date, "stationId": station,
                                         "hour": hour, "pm25": value}
    return [observations[key] for key in sorted(observations)], dict(rejected)


def daily_summary(observations):
    """Shared 20-valid-hour daily rule used by the timeline and map."""
    groups = defaultdict(list)
    for row in observations:
        groups[(row["date"], row["stationId"])].append(row["pm25"])
    return [{"date": date, "stationId": station, "validHours": len(values),
             "pm25": sum(values) / len(values) if len(values) >= 20 else None}
            for (date, station), values in sorted(groups.items())]


def compare_daily(observations, sample_path):
    """Check that generated hours reproduce every daily point on the B+C page."""
    source = Path(sample_path).read_text(encoding="utf-8-sig").strip()
    prefix = "window.tianjinPm25 ="
    if not source.startswith(prefix):
        raise ValueError("sample-data.js 格式不符合预期")
    published = json.loads(source[len(prefix):].strip().rstrip(";"))
    actual = {(row["date"], row["stationId"]): row
              for row in daily_summary(observations)}
    differences = []
    for expected in published["daily"]:
        key = (expected["date"], expected["stationId"])
        got = actual.get(key)
        if (got is None or got["validHours"] != expected["validHours"]
                or got["pm25"] is None
                or abs(got["pm25"] - expected["pm25"]) > 1e-6):
            differences.append(key)
    return differences


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_files", nargs="+", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=Path("hourly-data.js"))
    parser.add_argument("--check-daily", type=Path,
                        help="与 B+C 的 sample-data.js 逐日均值核验")
    args = parser.parse_args()
    files = [Path(match) for pattern in args.csv_files
             for match in glob.glob(str(pattern))]
    if not files:
        parser.error("未找到输入 CSV 文件")
    rows, rejected = read_files(files)
    if not rows:
        parser.error("输入文件中没有指定天津站点的有效 PM2.5 小时记录")
    if args.check_daily:
        differences = compare_daily(rows, args.check_daily)
        if differences:
            parser.error(f"与现有日均样本不一致，共 {len(differences)} 个站点日；前五项: {differences[:5]}")
    args.output.write_text("window.tianjinPm25Hourly = "
                           + json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
                           + ";\n", encoding="utf-8")
    print(f"wrote {len(rows)} hourly rows to {args.output}")
    print("rejected:", json.dumps(rejected, ensure_ascii=False))
    print("daily rows with >=20 hours:", sum(row["pm25"] is not None
                                             for row in daily_summary(rows)))


if __name__ == "__main__":
    main()
