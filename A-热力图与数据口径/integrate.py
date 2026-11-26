"""Install the A heatmap into an existing Tianjin-pm25-Visualization clone.

Usage: python integrate.py PATH_TO_REPOSITORY
"""
import argparse
import shutil
from pathlib import Path


def insert_once(text, marker, addition):
    if addition.strip() in text:
        return text
    if marker not in text:
        raise ValueError(f"找不到预期的页面片段: {marker!r}")
    return text.replace(marker, addition + marker, 1)


def integrate(repo):
    source = Path(__file__).resolve().parent
    target = Path(repo) / "C-地图与页面整合"
    index = target / "index.html"
    main = target / "main.js"
    if not index.is_file() or not main.is_file():
        raise FileNotFoundError("仓库中缺少 C-地图与页面整合/index.html 或 main.js")
    html = index.read_text(encoding="utf-8")
    js = main.read_text(encoding="utf-8")
    html = insert_once(html, '  <link rel="stylesheet" href="map.css">',
                       '  <link rel="stylesheet" href="heatmap.css">\n')
    html = insert_once(html, '  <script defer src="main.js"></script>',
                       '  <script defer src="heatmap.js"></script>\n')
    html = insert_once(html, '    <footer>',
                       '    <section aria-labelledby="heatmap-title">\n'
                       '      <h2 id="heatmap-title">月份×小时 PM2.5 热力图</h2>\n'
                       '      <div id="heatmap"></div>\n    </section>\n')
    # The data script is optional until original hourly CSV files have been prepared.
    html = insert_once(html, '  <script defer src="heatmap.js"></script>',
                       '  <script defer src="hourly-data.js"></script>\n') if (target / "hourly-data.js").exists() else html
    js = insert_once(js, "document.querySelector('#reset').addEventListener",
                     "window.mountPm25Heatmap(document.querySelector('#heatmap'), {\n"
                     "  filters, stations, hourly: window.tianjinPm25Hourly || [],\n"
                     "});\n")
    index.write_text(html, encoding="utf-8")
    main.write_text(js, encoding="utf-8")
    for name in ("heatmap.js", "heatmap.css"):
        shutil.copy2(source / name, target / name)
    print(f"热力图已接入 {target}")
    if not (target / "hourly-data.js").exists():
        print("尚无 hourly-data.js；请先用 prepare_hourly.py 处理原始逐小时 CSV，再重新运行本脚本。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", type=Path)
    integrate(parser.parse_args().repository)
