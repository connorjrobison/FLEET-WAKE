function commandActivityDrilldownModel(ship, monthKey) {
  const logs = commandRecordedActivityLogs(ship).filter(log => {
    const month = commandActivityMonth(log);
    return month && month.key === monthKey;
  });
  const groups = new Map();
  logs.forEach((log, index) => {
    const labels = new Map();
    [['Event', log.events], ['Special Condition', log.specialConditions]].forEach(([source, raw]) => {
      splitEvolutionValues(raw).forEach(label => {
        const key = evolutionKey(label);
        if (!key) return;
        if (!labels.has(key)) labels.set(key, { label, sources:new Set() });
        labels.get(key).sources.add(source);
      });
    });
    const date = commandWatchDateInfo(log);
    const occurrence = evolutionOccurrenceKey(log, index);
    const session = evolutionSessionDescriptor(log);
    labels.forEach((item, evolution) => {
      const key = occurrence + '|' + evolution;
      if (!groups.has(key)) groups.set(key, {
        key, evolution, label:item.label, day:date.day || '',
        dateLabel:date.day ? commandDateLabel(date.day) : 'Day not recorded',
        sessionLabel:session.label, records:[], people:new Set(), sources:new Set()
      });
      const group = groups.get(key);
      group.records.push({ log, index });
      const person = keyFor(log.officer || '');
      if (person) group.people.add(person);
      item.sources.forEach(source => group.sources.add(source));
    });
  });
  const rows = Array.from(groups.values()).sort((a, b) =>
    (a.day || '9999').localeCompare(b.day || '9999') ||
    a.sessionLabel.localeCompare(b.sessionLabel) || a.label.localeCompare(b.label)
  );
  return { ship, monthKey, logs, rows, hours:logs.reduce((sum, log) => sum + Math.max(0, Number(log.hours) || 0), 0) };
}

function commandActivityDrilldownButton(ship, monthKey, attribute, value, label, cls) {
  return '<button type="button" class="'+(cls || 'ship-link')+'" data-command-activity-'+attribute+'="'+h(value)+'" data-activity-ship="'+h(keyFor(ship.name))+'" data-activity-month="'+h(monthKey)+'">'+h(label)+'</button>';
}

function commandActivityDrilldownPanel(ship, monthKey) {
  const model = commandActivityDrilldownModel(ship, monthKey);
  const monthButton = commandActivityDrilldownButton(ship, monthKey, 'records', 'month', 'All month logs ('+model.logs.length+')', 'mini-btn');
  const rows = model.rows.map((row, index) => [
    commandActivityDrilldownButton(ship, monthKey, 'records', 'day:'+row.day, row.dateLabel),
    commandActivityDrilldownButton(ship, monthKey, 'records', 'evolution:'+index, row.label)+'<small>'+h(row.sessionLabel)+'</small>',
    h(row.people.size)+' / '+h(row.records.length)
  ]);
  return '<div class="command-activity-drilldown"><div class="command-section-heading"><h3>Dates &amp; evolutions</h3>'+monthButton+'</div>'+
    (rows.length ? commandTable(['Date', 'Evolution / watch period', 'Watchstanders / records'], rows) : '<p class="command-note">No recorded evolutions for this month.</p>')+
    '<small class="command-note">Select a date or evolution to open its logs.</small></div>';
}

function commandActivityDrilldownSource(ship, log) {
  const fingerprint = log.activitySourceFingerprint || log.sourceFingerprint || '';
  const snapshot = fingerprint && (ship.snapshots || []).filter(item => item.sourceFingerprint === fingerprint)
    .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')))[0];
  return {
    file:log.activitySourceFile || log.sourceFile || snapshot && snapshot.fileName || 'Not retained',
    date:log.activitySourceGeneratedAt || log.sourceGeneratedAt || snapshot && snapshot.sourceGeneratedAt || 'Not retained',
    importedAt:log.activityImportedAt || snapshot && snapshot.importedAt || 'Not retained'
  };
}

function commandActivityDrilldownLogTable(model, records) {
  const rows = records.map(({ log, index }) => {
    const date = commandWatchDateInfo(log);
    const source = commandActivityDrilldownSource(model.ship, log);
    return [
      h(date.day ? commandDateLabel(date.day) : 'Day not recorded'),
      h(log.officer || 'Not named'), h(log.watchstation || 'Not recorded'),
      h(fmt(Math.max(0, Number(log.hours) || 0), 1)),
      h([log.events, log.specialConditions].filter(Boolean).join('; ') || 'No evolution recorded'),
      commandActivityDrilldownButton(model.ship, model.monthKey, 'log', index, 'Open log', 'mini-btn')+(source.file !== 'Not retained' ? '<small>'+h(source.file)+'</small>' : '')
    ];
  });
  return rows.length ? commandTable(['Date', 'Watchstander', 'Watchstation', 'Hours', 'Evolutions', 'Record'], rows) : emptyState('No retained logs match.');
}

function commandOpenActivityDrilldown(shipKey, monthKey, selection) {
  const ship = state.ships[shipKey];
  if (!ship) return;
  const model = commandActivityDrilldownModel(ship, monthKey);
  let records = model.logs.map((log, index) => ({ log, index }));
  let title = 'Watch logs';
  if (selection.startsWith('day:')) {
    const day = selection.slice(4);
    records = records.filter(({ log }) => (commandWatchDateInfo(log).day || '') === day);
    title = day ? commandDateLabel(day) : 'Day not recorded';
  } else if (selection.startsWith('evolution:')) {
    const index = Number(selection.slice(10));
    const row = Number.isInteger(index) && model.rows[index];
    if (!row) return;
    records = row.records;
    title = row.label+' · '+row.dateLabel;
  }
  const hours = records.reduce((sum, { log }) => sum + Math.max(0, Number(log.hours) || 0), 0);
  showModal(title+' — '+ship.name, monthKey+' · '+records.length+' records · '+fmt(hours, 1)+' recorded hours', commandActivityDrilldownLogTable(model, records));
}

function commandOpenActivityLog(shipKey, monthKey, logIndex) {
  const ship = state.ships[shipKey];
  const index = Number(logIndex);
  if (!ship || !Number.isInteger(index)) return;
  const model = commandActivityDrilldownModel(ship, monthKey);
  const log = model.logs[index];
  if (!log) return;
  const date = commandWatchDateInfo(log);
  const source = commandActivityDrilldownSource(ship, log);
  const evidenceRows = [
    ['Watch date', date.day ? commandDateLabel(date.day) : 'Day not recorded'],
    ['Recorded date', log.watchDate || log.dateLogged || log.meta && (log.meta.watchDate || log.meta.dateLabel) || 'Not recorded'],
    ['Recorded month', log.month || monthKey], ['Watchstander', log.officer || 'Not named'],
    ['Watchstation', log.watchstation || 'Not recorded'], ['Watch period', evolutionSessionDescriptor(log).label],
    ['Hours', fmt(Math.max(0, Number(log.hours) || 0), 1)], ['Events', log.events || 'Not recorded'],
    ['Special conditions', log.specialConditions || 'Not recorded'], ['Evidence', log.rawText || log.comments || 'Not recorded'],
    ['Log ID', log.logId || log.key || 'Not recorded'],
    ['Source file', source.file], ['Source date', source.date], ['Uploaded', source.importedAt]
  ];
  const raw = log.rawRowData && typeof log.rawRowData === 'object' ? JSON.stringify(log.rawRowData, null, 2) : '';
  const body = commandTable(['Field', 'Recorded value'], evidenceRows.map(row => row.map(h)))+
    (raw ? '<details><summary>Source record</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+h(raw)+'</pre></details>' : '')+
    '<p>'+commandActivityDrilldownButton(ship, monthKey, 'records', 'day:'+(date.day || ''), 'Back to date logs', 'mini-btn')+' '+commandActivityDrilldownButton(ship, monthKey, 'records', 'month', 'All month logs', 'mini-btn')+'</p>';
  showModal('Watch log — '+ship.name, log.officer || 'Watchstander not named', body);
}

function attachActivityDrilldownEvents() {
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('[data-command-activity-records],[data-command-activity-log]');
    if (!button) return;
    event.preventDefault();
    if (button.hasAttribute('data-command-activity-log')) commandOpenActivityLog(button.dataset.activityShip, button.dataset.activityMonth, button.dataset.commandActivityLog);
    else commandOpenActivityDrilldown(button.dataset.activityShip, button.dataset.activityMonth, button.dataset.commandActivityRecords);
  });
}
