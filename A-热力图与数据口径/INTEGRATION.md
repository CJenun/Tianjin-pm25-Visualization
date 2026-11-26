# 接入现有 B+C 页面

有现成仓库克隆时，先在本目录运行 `python integrate.py 仓库路径`，即可自动复制组件并修改 `index.html`、`main.js`。重复运行不会重复插入。若随后生成了 `hourly-data.js`，再运行一次以加入数据脚本标签。

下面是手工接入时对应的修改。

在 `C-地图与页面整合/index.html` 的样式区加入：

```html
<link rel="stylesheet" href="heatmap.css">
```

在 `sample-data.js` 后、`main.js` 前加入：

```html
<script defer src="hourly-data.js"></script>
<script defer src="heatmap.js"></script>
```

在 `lab5-layout` 结束后、`footer` 之前加入：

```html
<section aria-labelledby="heatmap-title">
  <h2 id="heatmap-title">月份×小时 PM2.5 热力图</h2>
  <div id="heatmap"></div>
</section>
```

在 `C-地图与页面整合/main.js` 的 `#reset` 监听前加入：

```js
window.mountPm25Heatmap(document.querySelector('#heatmap'), {
  filters, stations, hourly: window.tianjinPm25Hourly || [],
});
```

`hourly-data.js` 由 `prepare_hourly.py` 生成。文件缺席时，移除它的 script 标签；热力图会显示缺少数据提示。
