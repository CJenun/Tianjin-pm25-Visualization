(function (root) {
  'use strict';

  const width = 420;
  const height = 390;
  const minHours = 20;
  const missingColor = '#bdbdbd';
  const number = d3.format('.1f');
  const labelLeft = new Set(['3326A', '3327A']);
  const labelY = new Map([['2922A', 9]]);

  function normalizeBoundary(feature) {
    const {geometry} = feature;
    const multi = geometry.type === 'MultiPolygon';
    const polygons = multi ? geometry.coordinates : [geometry.coordinates];
    function orient(ring, index) {
      let area = 0;
      for (let i = 1; i < ring.length; i++) {
        area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      }
      const clockwise = area < 0;
      return clockwise === (index === 0) ? ring : ring.slice().reverse();
    }
    const converted = polygons.map(rings => rings.map(orient));
    return {...feature, geometry: {...geometry, coordinates: multi ? converted : converted[0]}};
  }

  function summaries(stations, validRows, startDate, endDate) {
    const period = validRows.filter(row => row.date >= startDate && row.date <= endDate);
    const byStation = d3.group(period, row => row.stationId);
    const byDate = d3.rollup(period, rows => new Set(rows.map(row => row.stationId)).size, row => row.date);
    const available = stations.filter(station => byStation.has(station.id));
    const common = new Set([...byDate].filter(([, count]) => count === available.length).map(([date]) => date));
    return stations.map(station => {
      const rows = (byStation.get(station.id) ?? []).filter(row => common.has(row.date));
      return {...station, value: d3.mean(rows, row => row.pm25) ?? null, days: rows.length};
    });
  }

  function mountStationMap(container, {filters, stations, daily, boundary}) {
    const ids = new Set(stations.map(station => station.id));
    const validRows = daily.filter(row => ids.has(row.stationId) && row.validHours >= minHours && row.validHours <= 24
      && Number.isFinite(row.pm25) && row.pm25 >= 0);
    const max = d3.scaleLinear().domain([0, Math.max(10, d3.max(validRows, row => row.pm25) ?? 0)]).nice(4).domain()[1];
    const color = d3.scaleSequential(t => d3.interpolateBlues(.30 + t * .66)).domain([0, max]).clamp(true);
    const outline = normalizeBoundary(boundary);
    const projection = d3.geoMercator().fitExtent([[37, 16], [width - 44, height - 16]], outline);

    const panel = d3.select(container).classed('tianjin-map', true);
    const period = panel.append('p').attr('class', 'map-period').attr('aria-live', 'polite');
    const frame = panel.append('div').attr('class', 'map-frame');
    const svg = frame.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'group')
      .attr('aria-label', '天津监测站点地图，点击站点切换折线');
    const shape = svg.append('path').datum(outline).attr('class', 'map-area').attr('d', d3.geoPath(projection));
    const points = svg.append('g');
    const buttons = frame.append('div').attr('class', 'map-zoom').attr('aria-label', '地图缩放');
    const tip = frame.append('div').attr('class', 'map-tip').attr('role', 'tooltip').attr('hidden', true);
    const tipName = tip.append('strong');
    const tipDetail = tip.append('span');
    const key = panel.append('div').attr('class', 'map-key').attr('aria-label', '地图图例');
    key.append('span').text('0');
    key.append('i').attr('class', 'map-gradient').style('background', `linear-gradient(to right, ${color(0)}, ${color(max / 2)}, ${color(max)})`);
    key.append('span').text(`${max}μg/m³`);
    key.append('i').attr('class', 'map-missing');
    key.append('span').text('无可比数据');

    let transform = d3.zoomIdentity;
    function updatePositions() {
      points.selectAll('.map-station').attr('transform', item => `translate(${transform.apply(projection(item.coordinates))})`);
    }

    function hideTip() {
      tip.attr('hidden', true);
    }

    function showTip(event, item) {
      tipName.text(item.name);
      tipDetail.text(item.value === null ? '所选日期无可比数据' : `平均浓度${number(item.value)}μg/m³ · ${item.days}个有效日`);
      tip.attr('hidden', null);
      const box = frame.node().getBoundingClientRect();
      const mark = event.currentTarget.getBoundingClientRect();
      const left = (event.clientX ?? mark.left + mark.width / 2) - box.left;
      const top = (event.clientY ?? mark.top) - box.top;
      tip.style('left', `${Math.max(0, Math.min(left + 10, box.width - tip.node().offsetWidth))}px`)
        .style('top', `${Math.max(0, top - 10 - tip.node().offsetHeight)}px`);
    }

    const zoom = d3.zoom().extent([[0, 0], [width, height]]).scaleExtent([1, 5])
      .translateExtent([[0, 0], [width, height]])
      .filter(event => event.type === 'wheel' ? event.ctrlKey : !event.button)
      .on('zoom', event => {
        transform = event.transform;
        shape.attr('transform', transform);
        updatePositions();
        hideTip();
      });
    svg.call(zoom);
    buttons.append('button').attr('type', 'button').attr('aria-label', '放大地图').text('+')
      .on('click', () => svg.call(zoom.scaleBy, 1.5));
    buttons.append('button').attr('type', 'button').attr('aria-label', '缩小地图').text('−')
      .on('click', () => svg.call(zoom.scaleBy, 1 / 1.5));
    buttons.append('button').attr('type', 'button').text('复位地图')
      .on('click', () => svg.call(zoom.transform, d3.zoomIdentity));

    function choose(item) {
      const selected = filters.getState().stationId;
      filters.setStation(selected === item.id ? null : item.id);
    }

    const unsubscribe = filters.subscribe(selection => {
      const data = summaries(stations, validRows, selection.startDate, selection.endDate);
      const commonDays = d3.max(data, item => item.days) ?? 0;
      period.text(`${selection.startDate}至${selection.endDate} · ${commonDays}个共同有效日`);
      hideTip();
      const visible = data.filter(item => item.coordinates?.length === 2 && item.coordinates.every(Number.isFinite));
      const mapPoints = points.selectAll('.map-station').data(visible, item => item.id).join(enter => {
        const mark = enter.append('g').attr('class', 'map-station').attr('tabindex', 0).attr('role', 'button');
        mark.append('circle').attr('r', 16).attr('fill', 'transparent');
        mark.append('line').attr('class', 'map-leader');
        mark.append('circle').attr('class', 'map-dot').attr('r', 6.5);
        mark.append('text').attr('class', 'map-label').attr('dominant-baseline', 'central');
        return mark;
      });
      mapPoints.attr('data-station', item => item.id).attr('data-value', item => item.value)
        .attr('aria-pressed', item => item.id === selection.stationId)
        .attr('aria-label', item => item.value === null ? `${item.name}，无可比数据` : `${item.name}，${number(item.value)}微克每立方米`)
        .on('click', (_, item) => choose(item))
        .on('keydown', (event, item) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(item);
          }
        })
        .on('pointerenter pointermove focus', showTip).on('pointerleave blur', hideTip);
      mapPoints.select('.map-dot').attr('fill', item => item.value === null ? missingColor : color(item.value));
      mapPoints.select('.map-leader').attr('x1', item => labelLeft.has(item.id) ? -7 : 7)
        .attr('x2', item => labelLeft.has(item.id) ? -11 : 11)
        .attr('y2', item => labelY.get(item.id) ?? 0);
      mapPoints.select('.map-label').attr('x', item => labelLeft.has(item.id) ? -14 : 14)
        .attr('y', item => labelY.get(item.id) ?? 0)
        .attr('text-anchor', item => labelLeft.has(item.id) ? 'end' : 'start').text(item => item.name);
      updatePositions();
    });

    return () => {
      unsubscribe();
      panel.selectAll('*').remove();
    };
  }

  root.mountTianjinStationMap = mountStationMap;
})(window);
