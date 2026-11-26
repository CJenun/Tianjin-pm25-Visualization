(function (root) {
  'use strict';

  const valueText = d3.format('.1f');
  const missingColor = '#d5d9dd';
  const cell = 32;
  const left = 92;
  const top = 22;
  const legendMax = 150;
  const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, legendMax]).clamp(true);

  // The source contract is one Beijing-time observation per station, date and hour.
  function cleanHourly(rows, stationIds) {
    const known = new Set(stationIds);
    const unique = new Map();
    for (const row of rows || []) {
      if (!row || !known.has(row.stationId) || typeof row.date !== 'string'
          || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
          || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23
          || !Number.isFinite(row.pm25) || row.pm25 < 0) continue;
      const key = `${row.stationId}|${row.date}|${row.hour}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    return [...unique.values()];
  }

  function aggregate(rows, state, months) {
    const groups = new Map();
    for (const row of rows) {
      if (row.date < state.startDate || row.date > state.endDate
          || (state.stationId !== null && row.stationId !== state.stationId)) continue;
      const key = `${row.date.slice(0, 7)}|${row.hour}`;
      const item = groups.get(key) || {sum: 0, count: 0};
      item.sum += row.pm25;
      item.count += 1;
      groups.set(key, item);
    }
    return months.flatMap(month => d3.range(24).map(hour => {
      const item = groups.get(`${month}|${hour}`);
      return {month, hour, count: item?.count || 0, value: item ? item.sum / item.count : null};
    }));
  }

  function monthKeys(start, end) {
    const keys = [];
    let year = +start.slice(0, 4);
    let month = +start.slice(5, 7);
    const limit = +end.slice(0, 4) * 12 + +end.slice(5, 7);
    while (year * 12 + month <= limit) {
      keys.push(`${year}-${String(month).padStart(2, '0')}`);
      if (++month === 13) { month = 1; year++; }
    }
    return keys;
  }

  function mountHeatmap(container, {filters, stations, hourly}) {
    const rows = cleanHourly(hourly, stations.map(station => station.id));
    const names = new Map(stations.map(station => [station.id, station.name]));
    const panel = d3.select(container).classed('pm25-heatmap', true);
    const status = panel.append('p').attr('class', 'heatmap-status').attr('aria-live', 'polite');
    const chart = panel.append('div').attr('class', 'heatmap-chart');
    const svg = chart.append('svg').attr('role', 'img').attr('aria-label', '月份与小时 PM2.5 热力图');
    const tip = chart.append('div').attr('class', 'heatmap-tip').attr('role', 'tooltip').attr('hidden', true);
    const legend = panel.append('div').attr('class', 'heatmap-legend');
    legend.append('span').text('低 0');
    legend.append('i').style('background', `linear-gradient(to right, ${color(0)}, ${color(50)}, ${color(100)}, ${color(150)})`);
    legend.append('span').text('高 ≥150 μg/m³');
    legend.append('b').text('无样本');
    legend.append('small').text('色阶固定为 0–150 μg/m³；高于上限使用最深色');

    function tooltip(event, item) {
      const subject = filters.getState().stationId === null ? '全部站点' : names.get(filters.getState().stationId);
      tip.text(`${item.month} · ${String(item.hour).padStart(2, '0')}:00 · ${subject} · `
        + (item.count ? `平均 ${valueText(item.value)} μg/m³ · ${item.count} 个有效小时记录` : '无样本'));
      tip.attr('hidden', null);
      const box = chart.node().getBoundingClientRect();
      const x = event.clientX ? event.clientX - box.left : 0;
      const y = event.clientY ? event.clientY - box.top : 0;
      tip.style('left', `${Math.min(Math.max(x + 8, 0), Math.max(box.width - 270, 0))}px`)
        .style('top', `${Math.max(y - 44, 0)}px`);
    }

    function render(state) {
      const months = monthKeys(state.startDate, state.endDate);
      const data = aggregate(rows, state, months);
      const total = d3.sum(data, item => item.count);
      const subject = state.stationId === null ? '全部站点' : names.get(state.stationId);
      status.text(rows.length === 0
        ? '缺少逐小时数据：请用 A 模块的 prepare_hourly.py 从原始 CSV 生成 hourly-data.js。'
        : `${subject} · ${state.startDate} 至 ${state.endDate} · ${total} 个有效小时记录`);
      const height = top + months.length * cell + 64;
      svg.attr('viewBox', `0 0 ${left + 24 * cell + 20} ${height}`);
      svg.selectAll('*').remove();
      const grid = svg.append('g').attr('transform', `translate(${left},${top})`);
      grid.selectAll('.heatmap-hour').data(d3.range(24)).join('text')
        .attr('class', 'heatmap-hour').attr('x', hour => hour * cell + cell / 2)
        .attr('y', -7).attr('text-anchor', 'middle')
        .text(hour => String(hour).padStart(2, '0'));
      grid.selectAll('.heatmap-month').data(months).join('text')
        .attr('class', 'heatmap-month').attr('x', -8)
        .attr('y', (_, index) => index * cell + cell / 2 + 5)
        .attr('text-anchor', 'end').text(month => month);
      grid.selectAll('.heatmap-cell').data(data).join('rect')
        .attr('class', 'heatmap-cell').attr('x', item => item.hour * cell + 1)
        .attr('y', item => months.indexOf(item.month) * cell + 1)
        .attr('width', cell - 2).attr('height', cell - 2)
        .attr('fill', item => item.count ? color(item.value) : missingColor)
        .attr('tabindex', 0)
        .attr('aria-label', item => `${item.month} ${item.hour}时，${item.count ? `平均${valueText(item.value)}微克每立方米，${item.count}条记录` : '无样本'}`)
        .on('mouseenter focus', tooltip)
        .on('mousemove', tooltip)
        .on('mouseleave blur', () => tip.attr('hidden', true));
      svg.append('text').attr('class', 'heatmap-axis-label')
        .attr('x', left + 12 * cell).attr('y', height - 10)
        .attr('text-anchor', 'middle').text('北京时间（小时）');
    }
    return filters.subscribe(render);
  }

  root.mountPm25Heatmap = mountHeatmap;
  root.pm25HeatmapData = {cleanHourly, aggregate, monthKeys};
})(window);
