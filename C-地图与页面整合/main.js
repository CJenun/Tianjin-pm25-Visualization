'use strict';

const sample = window.tianjinPm25;
const stations = sample.stations.map(station => ({...station, coordinates: window.tianjinStationLocations[station.id]}));
const filters = window.createPm25Filters({
  startDate: sample.domain[0], endDate: sample.domain[1], stationIds: stations.map(station => station.id),
});

window.mountTianjinStationMap(document.querySelector('#station-map'), {
  filters, stations, daily: sample.daily, boundary: window.tianjinBoundary,
});
window.mountPm25Timeline(document.querySelector('#timeline'), {filters, stations, daily: sample.daily});
window.mountPm25Heatmap(document.querySelector('#heatmap'), {
  filters, stations, hourly: window.tianjinPm25Hourly || [],
});
document.querySelector('#reset').addEventListener('click', () => filters.reset());
