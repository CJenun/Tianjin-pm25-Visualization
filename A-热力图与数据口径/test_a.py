import tempfile
import unittest
from pathlib import Path

from integrate import integrate
from prepare_hourly import daily_summary, read_files


class AModuleTest(unittest.TestCase):
    def test_hourly_cleaning_and_daily_threshold(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "china_sites_20240105.csv"
            rows = ["date,hour,type,1027A,2922A"]
            for hour in range(20):
                rows.append(f"20240105,{hour},PM2.5,{hour + 1},")
            rows += ["20240105,0,PM2.5,999,12",  # duplicate first valid value wins
                     "20240105,20,PM2.5,-1,",
                     "20240105,21,PM2.5_24h,1000,1000"]
            source.write_text("\n".join(rows), encoding="utf-8")
            hourly, rejected = read_files([source], {"1027A", "2922A"})
            self.assertEqual(len(hourly), 21)
            self.assertEqual(rejected["duplicate"], 1)
            self.assertEqual(rejected["invalid"], 1)
            day = daily_summary(hourly)
            self.assertEqual(day[0]["validHours"], 20)
            self.assertEqual(day[0]["pm25"], 10.5)
            self.assertIsNone(day[1]["pm25"])

    def test_integration_is_repeatable(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            target = repo / "C-地图与页面整合"
            target.mkdir()
            (target / "index.html").write_text(
                '  <link rel="stylesheet" href="map.css">\n'
                '  <script defer src="main.js"></script>\n'
                '    <div class="lab5-layout"></div>\n    <footer>', encoding="utf-8")
            (target / "main.js").write_text(
                "document.querySelector('#reset').addEventListener('click', () => filters.reset());",
                encoding="utf-8")
            integrate(repo)
            first = (target / "index.html").read_text(encoding="utf-8")
            integrate(repo)
            self.assertEqual(first, (target / "index.html").read_text(encoding="utf-8"))
            self.assertEqual(first.count('id="heatmap"'), 1)
            self.assertEqual((target / "main.js").read_text(encoding="utf-8").count('mountPm25Heatmap'), 1)


if __name__ == "__main__":
    unittest.main()
