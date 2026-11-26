(function (root) {
  'use strict';

  function createFilters({startDate, endDate, stationIds}) {
    const stations = new Set(stationIds);
    const listeners = new Set();
    const initial = Object.freeze({startDate, endDate, stationId: null});
    let current = initial;

    function validDate(value) {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
    }

    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
      throw new RangeError('数据日期范围无效');
    }

    function update(next) {
      if (Object.keys(initial).every(key => current[key] === next[key])) return;
      current = Object.freeze(next);
      const snapshot = current;
      for (const listener of listeners) listener(snapshot);
    }

    return {
      bounds: Object.freeze({startDate, endDate}),
      getState: () => current,
      subscribe(listener) {
        listeners.add(listener);
        listener(current);
        return () => listeners.delete(listener);
      },
      setDateRange(first, last) {
        if (!validDate(first) || !validDate(last) || first > last || first < startDate || last > endDate) {
          throw new RangeError('请选择数据范围内的有效起止日期');
        }
        update({...current, startDate: first, endDate: last});
      },
      setStation(stationId) {
        if (stationId !== null && !stations.has(stationId)) throw new RangeError('未知站点');
        update({...current, stationId});
      },
      reset() {
        update(initial);
      },
    };
  }

  root.createPm25Filters = createFilters;
})(window);
