const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
  window: {},
  d3: {
    format: () => value => value.toFixed(1),
    interpolateYlOrRd: () => '#123',
    scaleSequential: () => ({domain() { return this; }, clamp() { return this; }}),
    range: count => Array.from({length: count}, (_, index) => index),
  },
};
vm.runInNewContext(fs.readFileSync('heatmap.js', 'utf8'), context);
const {cleanHourly, aggregate, monthKeys} = context.window.pm25HeatmapData;
const rows = cleanHourly([
  {date: '2024-01-05', stationId: '1027A', hour: 8, pm25: 10},
  {date: '2024-01-05', stationId: '2922A', hour: 8, pm25: 30},
  {date: '2024-01-05', stationId: '1027A', hour: 8, pm25: 99},
  {date: '2024-01-06', stationId: '1027A', hour: 8, pm25: null},
  {date: '2024-02-01', stationId: '1027A', hour: 8, pm25: 50},
], ['1027A', '2922A']);
assert.equal(rows.length, 3);
const months = monthKeys('2024-01-05', '2024-02-01');
assert.equal(months.join(','), '2024-01,2024-02');
const all = aggregate(rows, {startDate: '2024-01-05', endDate: '2024-01-05', stationId: null}, months);
assert.equal(all.find(item => item.month === '2024-01' && item.hour === 8).value, 20);
assert.equal(all.find(item => item.month === '2024-01' && item.hour === 8).count, 2);
assert.equal(all.find(item => item.month === '2024-02' && item.hour === 8).count, 0);
const station = aggregate(rows, {startDate: '2024-01-05', endDate: '2024-02-01', stationId: '1027A'}, months);
assert.equal(station.find(item => item.month === '2024-01' && item.hour === 8).value, 10);
assert.equal(station.find(item => item.month === '2024-02' && item.hour === 8).value, 50);
console.log('heatmap aggregation passed');
