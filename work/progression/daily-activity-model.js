/* Recorded daily bridge hours and evolution sessions. An empty day is not coverage evidence. */
function dailyActivityMonths(ships) {
  const today = new Date(Date.now()).toISOString().slice(0, 10);
  const months = new Set([today.slice(0, 7)]);
  (ships || []).forEach(ship => commandRecordedActivityLogs(ship).forEach(log => {
    const month = commandActivityMonth(log);
    if (month && commandCalendarMonth(month.key) && month.key <= today.slice(0, 7)) months.add(month.key);
  }));
  const first = Array.from(months).sort()[0];
  const cursor = new Date(first + '-01T12:00:00Z');
  const available = [];
  while (cursor.toISOString().slice(0, 7) <= today.slice(0, 7)) {
    available.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return available;
}

function dailyActivityModel(ships, requestedMonth) {
  const today = new Date(Date.now()).toISOString().slice(0, 10);
  const monthKey = commandCalendarMonth(requestedMonth) || today.slice(0, 7);
  const label = commandCalendarMonthLabel(monthKey);
  const availableMonths = dailyActivityMonths(ships);
  if (!availableMonths.includes(monthKey)) availableMonths.push(monthKey);
  availableMonths.sort();
  // Construct with the ISO string so years below 100 retain their calendar meaning.
  const end = new Date(monthKey + '-01T12:00:00Z');
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const dayCount = end.getUTCDate();
  const blankDays = () => Array.from({ length:dayCount }, (_, index) => {
    const day = index + 1;
    const key = monthKey + '-' + String(day).padStart(2, '0');
    return {
      key, day, label:commandDateLabel(key), available:key <= today,
      hours:key <= today ? 0 : null, hasRecords:false, logCount:0,
      logs:[], ships:[], evolutions:0, evolutionRows:[]
    };
  });
  const summarizeEvolutions = records => {
    const groups = new Map();
    records.forEach(record => {
      const log = record.log;
      const perLog = new Map();
      [['Event', log.events], ['Special Condition', log.specialConditions]].forEach(([source, raw]) => {
        splitEvolutionValues(raw).forEach(evolution => {
          const key = evolutionKey(evolution);
          if (!key) return;
          if (!perLog.has(key)) perLog.set(key, { label:evolution, sources:new Set() });
          perLog.get(key).sources.add(source);
        });
      });
      // The owning ship remains part of a session even when an old row omitted its ship field.
      const recordedDay = commandWatchDateInfo(log).day;
      const occurrenceLog = Object.assign({}, log, { ship:record.ship.name });
      if (recordedDay) occurrenceLog.watchDate = recordedDay + 'T12:00:00Z';
      const occurrence = evolutionOccurrenceKey(occurrenceLog, record.index);
      const session = evolutionSessionDescriptor(log);
      perLog.forEach((evolution, key) => {
        if (!groups.has(key)) groups.set(key, { key, label:evolution.label, records:[], sessions:new Map(), sources:new Set() });
        const row = groups.get(key);
        row.records.push(record);
        evolution.sources.forEach(source => row.sources.add(source));
        if (!row.sessions.has(occurrence)) row.sessions.set(occurrence, {
          key:occurrence, ship:record.ship, shipKey:record.shipKey,
          day:commandWatchDateInfo(log).day || '', label:session.label, records:[]
        });
        row.sessions.get(occurrence).records.push(record);
      });
    });
    return Array.from(groups.values(), row => ({
      key:row.key, label:row.label, count:row.sessions.size,
      records:row.records, sessions:Array.from(row.sessions.values()), sources:Array.from(row.sources).sort()
    })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const finalizeDays = days => {
    days.forEach(day => {
      day.logCount = day.logs.length;
      day.hasRecords = day.logCount > 0;
      day.ships = Array.from(new Set(day.logs.map(record => record.shipKey)));
      day.evolutionRows = summarizeEvolutions(day.logs);
      day.evolutions = day.evolutionRows.reduce((sum, row) => sum + row.count, 0);
    });
    return days;
  };
  const days = blankDays();
  const monthOnlyLogs = [];
  const records = [];
  const perShip = (ships || []).map(ship => {
    const shipKey = keyFor(ship.name);
    const shipDays = blankDays();
    const selectedLogs = commandRecordedActivityLogs(ship).filter(log => {
      const month = commandActivityMonth(log);
      return month && month.key === monthKey;
    });
    const ownMonthOnly = [];
    selectedLogs.forEach((log, index) => {
      const record = { ship, shipKey, log, index };
      records.push(record);
      const date = commandWatchDateInfo(log);
      const dayNumber = date.day && date.day.slice(0, 7) === monthKey ? Number(date.day.slice(8, 10)) : 0;
      const day = dayNumber && days[dayNumber - 1];
      if (!day || !day.available) {
        monthOnlyLogs.push(record);
        ownMonthOnly.push(record);
        return;
      }
      const hours = Math.max(0, Number(log.hours) || 0);
      day.hours += hours;
      day.logs.push(record);
      shipDays[dayNumber - 1].hours += hours;
      shipDays[dayNumber - 1].logs.push(record);
    });
    finalizeDays(shipDays);
    const exactRecords = shipDays.flatMap(day => day.logs);
    const evolutionRows = summarizeEvolutions(exactRecords);
    return {
      ship, key:shipKey, name:ship.name, days:shipDays,
      totalHours:shipDays.reduce((sum, day) => sum + (day.hours || 0), 0),
      totalEvolutions:evolutionRows.reduce((sum, row) => sum + row.count, 0),
      evolutionRows, logCount:exactRecords.length, hasRecords:exactRecords.length > 0,
      records:selectedLogs.map((log, index) => ({ ship, shipKey, log, index })),
      monthOnlyLogs:ownMonthOnly,
      monthOnlyHours:ownMonthOnly.reduce((sum, record) => sum + Math.max(0, Number(record.log.hours) || 0), 0)
    };
  });
  finalizeDays(days);
  const exactRecords = days.flatMap(day => day.logs);
  const evolutionRows = summarizeEvolutions(exactRecords);
  const lanes = evolutionRows.map(row => ({
    key:row.key, label:row.label, count:row.count, records:row.records, sessions:row.sessions,
    days:days.map(day => {
      const entry = day.evolutionRows.find(item => item.key === row.key);
      return { key:day.key, day:day.day, available:day.available, count:entry ? entry.count : 0,
        records:entry ? entry.records : [], sessions:entry ? entry.sessions : [] };
    })
  }));
  return {
    monthKey, label, days, perShip, lanes, evolutionRows, records, monthOnlyLogs,
    monthOnlyHours:monthOnlyLogs.reduce((sum, record) => sum + Math.max(0, Number(record.log.hours) || 0), 0),
    monthOnlyEvolutionRows:summarizeEvolutions(monthOnlyLogs),
    totalHours:days.reduce((sum, day) => sum + (day.hours || 0), 0),
    totalEvolutions:evolutionRows.reduce((sum, row) => sum + row.count, 0),
    logCount:exactRecords.length, hasRecords:exactRecords.length > 0,
    today, throughDay:days.filter(day => day.available).length, availableMonths,
    coverage:'Recorded logs only; an empty day does not establish no watch activity.'
  };
}
