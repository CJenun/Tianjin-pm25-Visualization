'use strict';

const sample = window.tianjinPm25;
const filters = window.createPm25Filters({
  startDate: sample.domain[0], endDate: sample.domain[1], stationIds: sample.stations.map(station => station.id),
});
const selector = document.querySelector('#station');
selector.append(new Option('全部样本站点', ''));
for (const station of sample.stations) selector.append(new Option(station.name, station.id));
selector.addEventListener('change', () => filters.setStation(selector.value || null));
document.querySelector('#reset').addEventListener('click', () => filters.reset());
filters.subscribe(state => { selector.value = state.stationId ?? ''; });
window.mountPm25Timeline(document.querySelector('#timeline'), {filters, daily: sample.daily, stations: sample.stations});
