(function (root) {
  'use strict';

  const parseDate = d3.utcParse('%Y-%m-%d');
  const dateKey = d3.utcFormat('%Y-%m-%d');
  const valueText = d3.format('.1f');
  const DAY = 86400000;
  const MIN_HOURS = 20;
  const MAX_HOURS = 24;
  const VIEW_WIDTH = 900;
  const LEFT = 57;
  const RIGHT = 875;
  const TOP = 32;
  const BASELINE = 236;
  const OVERVIEW_TOP = 9;
  const OVERVIEW_BOTTOM = 62;

  function dayIndex(rows) {
    const byStation = d3.group(rows, row => row.stationId, row => row.date);
    return (stationId, date) => {
      const row = byStation.get(stationId)?.get(date)?.[0];
      return row && Number.isInteger(row.validHours) && row.validHours >= MIN_HOURS && row.validHours <= MAX_HOURS
        && Number.isFinite(row.pm25) && row.pm25 >= 0 ? row : null;
    };
  }

  function createTimeline(container, {filters, daily, stations}) {
    const {startDate: first, endDate: last} = filters.bounds;
    const stationNames = new Map(stations.map(({id, name}) => [id, name]));
    const origin = parseDate(first);
    const length = d3.utcDay.count(origin, parseDate(last)) + 1;
    const dateAt = day => d3.utcDay.offset(origin, day);
    const dayAt = value => Math.round((value - origin) / DAY);
    const readDay = dayIndex(daily);
    function valuesFor(stationId) {
      const ids = stationId === null ? [...stationNames.keys()] : [stationId];
      return d3.range(length).map(i => {
        const date = dateAt(i);
        const key = dateKey(date);
        const valid = ids.map(id => readDay(id, key)).filter(Boolean);
        return {date, value: d3.mean(valid, x => x.pm25), count: valid.length, hours: valid[0]?.validHours};
      });
    }
    const network = valuesFor(null);
    const chartHeight = 277;
    const panel = d3.select(container).classed('pm25-timeline', true);
    const status = panel.append('p').attr('class', 'trend-status').attr('aria-live', 'polite');
    const shell = panel.append('div').attr('class', 'trend-chart');
    const main = shell.append('svg').attr('viewBox', `0 0 ${VIEW_WIDTH} ${chartHeight}`)
      .attr('role', 'img').attr('aria-label', '所选范围的 PM2.5 日均折线图');
    const tip = shell.append('div').attr('class', 'trend-tooltip').attr('role', 'tooltip').attr('hidden', true);
    const overview = panel.append('svg').attr('viewBox', `0 0 ${VIEW_WIDTH} 90`)
      .attr('role', 'img').attr('aria-label', '拖选日期范围的 PM2.5 概览');
    const dateForm = panel.append('form').attr('class', 'trend-dates');
    function dateInput(label) {
      const field = dateForm.append('label').text(label);
      return field.append('input').attr('type', 'date').attr('required', true).attr('min', first).attr('max', last).node();
    }
    const startInput = dateInput('开始日期');
    const endInput = dateInput('结束日期');
    dateForm.append('button').attr('type', 'submit').text('应用');
    const dateError = dateForm.append('span').attr('class', 'trend-error').attr('role', 'status');
    dateForm.on('submit', event => {
      event.preventDefault();
      try {
        filters.setDateRange(startInput.value, endInput.value);
        dateError.text('');
      } catch (error) {
        dateError.text(error.message);
      }
    });

    function line(projectionX, projectionY) {
      return d3.line().defined(point => point.value !== undefined)
        .x(point => projectionX(point.date)).y(point => projectionY(point.value));
    }

    function dateAxis(x, start, end) {
      const count = d3.utcDay.count(start, end) + 1;
      const axis = d3.axisBottom(x).tickSizeOuter(0);
      if (count <= 7) return axis.tickValues(d3.utcDay.range(start, d3.utcDay.offset(end, 1))).tickFormat(d3.utcFormat('%m-%d'));
      return axis.ticks(6).tickFormat(d3.utcFormat(count > 150 ? '%Y-%m' : '%m-%d'));
    }

    function drawMain(selection, series) {
      main.selectAll('*').remove();
      tip.attr('hidden', true);
      const firstIndex = dayAt(parseDate(selection.startDate));
      const lastIndex = dayAt(parseDate(selection.endDate));
      const selected = series.slice(firstIndex, lastIndex + 1);
      const start = selected[0].date;
      const end = selected[selected.length - 1].date;
      const domain = firstIndex === lastIndex ? [new Date(+start - DAY / 2), new Date(+end + DAY / 2)] : [start, end];
      const x = d3.scaleUtc().domain(domain).range([LEFT, RIGHT]);
      const y = d3.scaleLinear().domain([0, Math.max(10, d3.max(network, d => d.value) ?? 0, d3.max(series, d => d.value) ?? 0)])
        .nice().range([BASELINE, TOP]);
      main.append('text').attr('class', 'trend-unit').attr('x', LEFT).attr('y', 19).text('浓度/μg/m³');
      main.append('g').attr('class', 'trend-grid').attr('transform', `translate(${LEFT},0)`)
        .call(d3.axisLeft(y).ticks(5).tickSize(LEFT - RIGHT));
      main.append('g').attr('class', 'trend-axis').attr('transform', `translate(0,${BASELINE})`).call(dateAxis(x, start, end));
      const valid = selected.filter(d => d.value !== undefined);
      if (valid.length) {
        main.append('path').datum(selected).attr('class', 'trend-line').attr('d', line(x, y));
        main.selectAll('.trend-point').data(valid.filter((point) => {
          if (selected.length < 50) return true;
          const i = dayAt(point.date) - firstIndex;
          return selected[i - 1]?.value === undefined && selected[i + 1]?.value === undefined;
        })).join('circle').attr('class', 'trend-point').attr('cx', d => x(d.date)).attr('cy', d => y(d.value)).attr('r', 3);
      } else {
        main.append('text').attr('class', 'trend-empty').attr('x', (LEFT + RIGHT) / 2).attr('y', 130)
          .attr('text-anchor', 'middle').text('所选范围无有效日均值');
      }
      const marker = main.append('circle').attr('class', 'trend-marker').attr('r', 5).attr('visibility', 'hidden');
      main.append('rect').attr('class', 'trend-surface').attr('x', LEFT).attr('y', TOP)
        .attr('width', RIGHT - LEFT).attr('height', BASELINE - TOP).attr('fill', 'transparent')
        .on('pointermove', event => {
          const candidate = dayAt(x.invert(d3.pointer(event, main.node())[0])) - firstIndex;
          const point = selected[Math.max(0, Math.min(selected.length - 1, candidate))];
          const extra = selection.stationId === null ? `${point.count}/${stationNames.size} 个站点` : `${point.hours} 个有效小时`;
          const detail = point.value === undefined ? '无有效日均值' : `${valueText(point.value)}μg/m³ · ${extra}`;
          marker.attr('visibility', point.value === undefined ? 'hidden' : 'visible');
          if (point.value !== undefined) marker.attr('cx', x(point.date)).attr('cy', y(point.value));
          const [px, py] = d3.pointer(event, shell.node());
          tip.text(`${dateKey(point.date)} · ${detail}`).attr('hidden', null);
          tip.style('left', `${Math.max(0, Math.min(px + 12, shell.node().clientWidth - tip.node().offsetWidth))}px`)
            .style('top', `${Math.max(0, py - tip.node().offsetHeight - 9)}px`);
        }).on('pointerleave', () => {
          marker.attr('visibility', 'hidden');
          tip.attr('hidden', true);
        });
    }

    const overviewX = d3.scaleUtc().domain([origin, dateAt(length)]).range([LEFT, RIGHT]);
    const overviewY = d3.scaleLinear().domain([0, Math.max(10, d3.max(network, d => d.value) ?? 0)])
      .range([OVERVIEW_BOTTOM, OVERVIEW_TOP]);
    overview.append('rect').attr('class', 'trend-overview-background').attr('x', LEFT).attr('y', OVERVIEW_TOP)
      .attr('width', RIGHT - LEFT).attr('height', OVERVIEW_BOTTOM - OVERVIEW_TOP);
    const overviewLine = overview.append('path').attr('class', 'trend-line');
    const overviewPoints = overview.append('g');
    const overviewMarkX = date => overviewX(new Date(+date + DAY / 2));
    const overviewAxisX = overviewX.copy().domain([new Date(+origin - DAY / 2), new Date(+dateAt(length) - DAY / 2)]);
    overview.append('g').attr('class', 'trend-axis').attr('transform', `translate(0,${OVERVIEW_BOTTOM})`)
      .call(dateAxis(overviewAxisX, origin, dateAt(length - 1)));
    const brush = d3.brushX().extent([[LEFT, OVERVIEW_TOP], [RIGHT, OVERVIEW_BOTTOM]]).on('end', event => {
      if (!event.sourceEvent) return;
      if (!event.selection) {
        filters.setDateRange(first, last);
      } else {
        const [start, end] = event.selection.map(px => dayAt(overviewX.invert(px)));
        const from = Math.max(0, Math.min(length - 1, start));
        const to = Math.max(from, Math.min(length - 1, end - 1));
        filters.setDateRange(dateKey(dateAt(from)), dateKey(dateAt(to)));
      }
      syncBrush(filters.getState());
    });
    const brushLayer = overview.append('g').attr('class', 'trend-brush').call(brush);

    function syncBrush(selection) {
      const active = d3.brushSelection(brushLayer.node());
      if (selection.startDate === first && selection.endDate === last) {
        if (active) brushLayer.call(brush.move, null);
        return;
      }
      const ends = [parseDate(selection.startDate), d3.utcDay.offset(parseDate(selection.endDate), 1)].map(overviewX);
      if (!active || active.some((px, i) => Math.abs(px - ends[i]) > .01)) brushLayer.call(brush.move, ends);
    }

    let previousStation;
    let series;
    const unsubscribe = filters.subscribe(selection => {
      if (previousStation !== selection.stationId) {
        previousStation = selection.stationId;
        series = selection.stationId === null ? network : valuesFor(selection.stationId);
        overviewY.domain([0, Math.max(10, d3.max(network, d => d.value) ?? 0, d3.max(series, d => d.value) ?? 0)]);
        overviewLine.datum(series).attr('d', line(overviewMarkX, overviewY));
        overviewPoints.selectAll('circle').data(series.filter((point, i) => point.value !== undefined
          && series[i - 1]?.value === undefined && series[i + 1]?.value === undefined))
          .join('circle').attr('class', 'trend-point').attr('r', 2)
          .attr('cx', point => overviewMarkX(point.date)).attr('cy', point => overviewY(point.value));
      }
      const station = selection.stationId === null ? '全部样本站点' : stationNames.get(selection.stationId);
      status.text(`${station} · ${selection.startDate} 至 ${selection.endDate}`);
      startInput.value = selection.startDate;
      endInput.value = selection.endDate;
      dateError.text('');
      syncBrush(selection);
      drawMain(selection, series);
    });
    return () => {
      unsubscribe();
      panel.selectAll('*').remove();
    };
  }

  root.mountPm25Timeline = createTimeline;
})(window);
