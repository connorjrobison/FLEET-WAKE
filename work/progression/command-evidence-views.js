// Upload provenance, recorded activity, and command guidance for the standalone app.
let commandActivityFilters = { from:"", to:"", precision:"" };

function commandEvidenceHero(kicker, title, description, value, label) {
  return '<section class="command-hero"><div><span class="section-kicker">'+h(kicker)+'</span><h1 class="view-title">'+h(title)+'</h1><p>'+h(description)+'</p></div><div class="command-hero-stamp"><strong>'+h(value)+'</strong><span>'+h(label)+'</span></div></section>';
}

function commandDateTimeLabel(value) {
  const time = commandTimestamp(value);
  return time == null ? 'Not recorded' : new Date(time).toLocaleString();
}

function commandReportCount(report, field) {
  return report[field] == null ? 'Not recorded' : Number(report[field]).toLocaleString();
}

function commandSourceRows() {
  const rows = [];
  allShips().forEach(ship => {
    const timeline = commandTimeline(ship);
    (ship.snapshots || []).forEach((snapshot,index) => {
      if (!snapshot) return;
      const selected = timeline.snapshots.find(item => item.snapshot === snapshot);
      const superseded = timeline.conflicts.some(conflict => conflict.alternatives.some(item => item.snapshot === snapshot));
      const duplicate = timeline.duplicates.some(item => item.duplicate.snapshot === snapshot);
      const excluded = timeline.excluded.find(item => item.snapshot === snapshot);
      const dated = commandTimestamp(snapshot.sourceGeneratedAt) != null;
      let status = dated ? 'Dated observation' : 'Undated; excluded from calendar comparisons';
      if (selected && selected.corrected) status = 'Selected correction at this source time';
      if (superseded) status = 'Superseded version retained for audit';
      if (duplicate) status = 'Repeated observation; excluded from change totals';
      if (excluded) status = excluded.reason;
      rows.push({ ship, snapshot, index, dated, status, selected });
    });
  });
  return rows.sort((a,b) => (commandTimestamp(b.snapshot.sourceGeneratedAt) ?? -Infinity) - (commandTimestamp(a.snapshot.sourceGeneratedAt) ?? -Infinity) || (commandTimestamp(b.snapshot.importedAt) ?? 0) - (commandTimestamp(a.snapshot.importedAt) ?? 0) || a.ship.name.localeCompare(b.ship.name));
}

function commandFindReportSnapshot(report) {
  const ship = state.ships[keyFor(report.ship || '')];
  if (!ship || !report.snapshotId) return null;
  const index = (ship.snapshots || []).findIndex(snapshot => snapshot.snapshotId === report.snapshotId);
  return index < 0 ? null : { ship, snapshot:ship.snapshots[index], index };
}

function commandImportMeaning(report) {
  const notes = (report.notes || []).join(' ');
  if (report.status === 'Rejected' || ((report.errors || []).length && report.status !== 'Imported')) return { label:'Rejected', tone:'loss', detail:'This file did not create an accepted ship observation. Review its validation errors.' };
  const duplicate = report.duplicateSource === true || (!report.snapshotId && !!report.sourceFingerprint && /identical|already recorded|re-import|duplicate snapshot|replay/i.test(notes));
  if (duplicate) return { label:'Repeated source', tone:'unknown', detail:report.archivedOnly ? 'Already retained in history; replay did not replace the later accepted current evidence.' : 'No new observation was created. Repeated uploads do not add progress or movement.' };
  if (report.archivedOnly) return { label:'Historical backfill', tone:'progress', detail:'Earlier evidence was added to the timeline. The later current roster, logs, and phase remain in force.' };
  if (/MSA-only/i.test(notes) || (!report.snapshotId && !report.sourceFingerprint && (Number(report.msaRecordsAdded) || Number(report.msaRecordsUpdated)))) return { label:'Outcome overlay', tone:'progress', detail:'Assessment evidence was updated without creating a bridge roster snapshot.' };
  const match = commandFindReportSnapshot(report);
  if (match && commandTimeline(match.ship).conflicts.some(item => item.selected.snapshot === match.snapshot || item.alternatives.some(value => value.snapshot === match.snapshot))) return { label:'Source-time correction', tone:'need', detail:'Another export shares this source time. The selected version can correct status; the correction is not elapsed progress.' };
  if (report.snapshotId) return { label:report.sourceGeneratedAt ? 'Observation accepted' : 'Undated observation', tone:report.sourceGeneratedAt ? 'current' : 'need', detail:report.sourceGeneratedAt ? 'A distinct ship observation was retained. Its source date, rather than upload date, anchors calendar comparisons.' : 'The observation is retained, but a missing source date prevents a calendar trend claim.' };
  return { label:report.status || 'Recorded upload', tone:'unknown', detail:'Use the retained source register and report notes to establish what this upload changed.' };
}

function commandSnapshotMovement(ship, snapshot) {
  const timeline = commandTimeline(ship);
  const index = timeline.snapshots.findIndex(item => item.snapshot === snapshot);
  if (index < 0) return { text:'This retained version is not selected for calendar comparisons.', pair:null };
  if (timeline.snapshots[index].corrected) return { text:'Source-time correction; compare dated observations in Command Review for elapsed progression.', pair:null };
  if (index === 0) return { text:'First dated observation establishes the baseline. Earlier movement is unknown.', pair:null };
  const prior = timeline.snapshots[index-1], later = timeline.snapshots[index];
  const pair = commandPair(prior,later), c = pair.counts;
  return { text:commandDateLabel(prior.date)+' → '+commandDateLabel(later.date)+': '+c.lost+' losses, '+c.restored+' recoveries, '+c.requiresWatch+' new watch requirements, '+c.levelUp+' level increases; '+c.joined+' added and '+c.departed+' absent from the roster.', pair, prior, later };
}

function commandImportCard(report,index) {
  const meaning = commandImportMeaning(report);
  const match = commandFindReportSnapshot(report);
  const observed = match ? commandSnapshotMovement(match.ship,match.snapshot) : null;
  const imported = report.importedAt || (match && match.snapshot.importedAt) || '';
  const source = report.sourceGeneratedAt || (match && match.snapshot.sourceGeneratedAt) || '';
  const messages = [['Validation errors',report.errors],['Evidence warnings',report.warnings],['Import notes',report.notes]]
    .filter(([,items]) => items && items.length)
    .map(([title,items]) => '<div><strong>'+h(title)+'</strong><ul>'+Array.from(new Set(items)).map(item=>'<li>'+h(item)+'</li>').join('')+'</ul></div>').join('');
  return '<article class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Upload '+h(index+1)+' · '+h(report.sourceType || 'WAKE file')+'</span><h2>'+h(report.fileName || 'Unnamed file')+'</h2><p>'+h(report.ship || 'Ship not established')+' · '+h(report.phase || 'Phase not established')+'</p></div><span class="command-pill '+h(meaning.tone)+'">'+h(meaning.label)+'</span></div><p>'+h(meaning.detail)+'</p>'+
    '<p class="command-note"><strong>Source:</strong> '+h(source ? commandDateTimeLabel(source) : 'Not recorded — upload time is not the observation date')+' · <strong>Imported:</strong> '+h(commandDateTimeLabel(imported))+'</p>'+
    (observed ? '<p class="command-period-note"><strong>Evidence now supports:</strong> '+h(observed.text)+'</p>' : '')+
    commandTable(['Roster in report','Bridge rows read','Duplicate rows skipped','MSA added / corrected','Retained ship snapshots'],[[h(commandReportCount(report,'officers')),h(commandReportCount(report,'logsAdded')),h(commandReportCount(report,'duplicateLogs')),h(commandReportCount(report,'msaRecordsAdded')+' / '+commandReportCount(report,'msaRecordsUpdated')),h(commandReportCount(report,'snapshots'))]])+
    (match ? '<p class="command-note"><button class="btn secondary" type="button" data-command-source-ship="'+h(keyFor(match.ship.name))+'" data-command-source-index="'+match.index+'">Inspect this observation</button> <button class="btn secondary" type="button" data-command-ship="'+h(keyFor(match.ship.name))+'">Review ship progression</button></p>' : '')+
    (messages ? '<details class="command-sources"><summary>Validation details &amp; import notes</summary>'+messages+'</details>' : '')+'</article>';
}

function commandRenderImports() {
  const host = document.getElementById('view-imports');
  if (!host) return;
  const reports = state.importReports || [];
  const sources = commandSourceRows();
  const dated = sources.filter(item => item.dated).length;
  const sourceTable = commandTable(['Ship / source file','Source date','Upload date','Roster / logs at observation','Evidence use','Inspect'],sources.map(row => {
    const snapshot = row.snapshot;
    return ['<strong>'+h(row.ship.name)+'</strong><small>'+h(snapshot.fileName || 'Unnamed source')+'</small>',h(row.dated ? commandDateTimeLabel(snapshot.sourceGeneratedAt) : 'Source date unavailable'),h(commandDateTimeLabel(snapshot.importedAt)),h(Object.keys(snapshot.officerStates || {}).length+' people / '+(snapshot.metrics && snapshot.metrics.logCount != null ? snapshot.metrics.logCount+' logs' : 'log count unavailable')),h(row.status),'<button class="mini-btn" type="button" data-command-source-ship="'+h(keyFor(row.ship.name))+'" data-command-source-index="'+row.index+'">Source evidence</button>'];
  }));
  host.innerHTML = '<div class="command-workspace command-evidence-workspace">'+commandEvidenceHero('Upload history','What did the upload change?','See what was accepted, which observation it supports, and whether it changed current evidence or filled a historical gap.',reports.length,'upload reports')+
    '<div class="command-controls"><p>Continue the same ship export workflow. Repeated dated WAKE files build the command record.</p><div class="command-export-actions"><button class="btn" type="button" data-command-maintenance="import">Import WAKE data</button><button class="btn secondary" type="button" data-command-maintenance="backup">Export Fleet Backup</button></div></div>'+
    '<p class="command-period-note"><strong>'+h(sources.length)+' retained observations; '+h(dated)+' have a source date.</strong> Upload reports describe processing at that time. Observed changes are recomputed from the source chronology, so a historical backfill can improve earlier comparisons.</p>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Audit trail</span><h2>Which source supports each point in time?</h2><p>Sorted by source date, newest first. Undated records follow dated evidence; superseded versions remain visible.</p></div></div>'+(sources.length?sourceTable:emptyState('Upload the first ship export to establish a source observation.'))+'</section>'+
    (reports.length?reports.map((report,index)=>({report,index})).reverse().map(({report,index})=>commandImportCard(report,index)).join(''):'<section class="command-panel">'+emptyState('No upload reports recorded. Restored backups can still contain observations in the source register above.')+'</section>')+'</div>';
}

function commandOpenSource(shipKey,index) {
  const ship = state.ships[shipKey], snapshot = ship && (ship.snapshots || [])[Number(index)];
  if (!snapshot) return;
  const movement = commandSnapshotMovement(ship,snapshot);
  const rows = Object.entries(snapshot.officerStates || {}).sort((a,b)=>String(a[1].name||a[0]).localeCompare(String(b[1].name||b[0]))).map(([key,off]) => [h(off.name || key),h(officerLevelLabel(off.level)),commandPill(commandCategory(off)),h(commandNumber(off.daysSinceWatch) == null ? 'Unknown' : off.daysSinceWatch),h(fmt(off.cumulativeBridgeHours,1)),h(off.rorCurrent == null ? 'Unknown' : off.rorCurrent ? 'Current at observation' : 'Not current at observation')]);
  let changes = '';
  if (movement.pair) {
    const rows = Object.entries(COMMAND_CHANGE_LABELS).flatMap(([type,label]) => (movement.pair.rows[type] || []).map(person => [h(person.name),h(label),h(['lost','restored','requiresWatch','unknownCurrency'].includes(type)?currencyStatusLabel(person.from):String(person.from??'Unknown')),h(['lost','restored','requiresWatch','unknownCurrency'].includes(type)?currencyStatusLabel(person.to):String(person.to??'Unknown'))]));
    changes = '<section class="command-panel"><h3>Changes observed since the prior dated source</h3>'+(rows.length?commandTable(['Person','Change','Before','After'],rows):emptyState('No matched-person changes were observed.'))+'</section>';
  }
  showModal('Source evidence — '+ship.name,snapshot.fileName || 'Retained ship observation','<p class="command-period-note"><strong>Source:</strong> '+h(commandDateTimeLabel(snapshot.sourceGeneratedAt))+' · <strong>Uploaded:</strong> '+h(commandDateTimeLabel(snapshot.importedAt))+' · '+h(snapshot.phase || 'Phase unavailable')+'</p><p class="command-period-note">'+h(movement.text)+'</p>'+changes+'<section class="command-panel"><h3>Roster as recorded in this observation</h3>'+commandTable(['Person','Recorded level','Recorded currency','Days since watch','Cumulative bridge hours','ROR evidence'],rows)+'<p class="command-note">This is retained snapshot status. Historical logs are not reconstructed from the ship’s latest log collection. Names are matched within the ship; a corrected name may appear as a roster addition and absence.</p></section>');
}

function commandWatchDateInfo(log) {
  const month = String(log && log.month || '').trim();
  const year = month.match(/\b(19|20)\d{2}\b/);
  const candidates = [log && log.watchDate,log && log.dateLogged,log && log.meta && log.meta.watchDate,log && log.meta && log.meta.dateLabel];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    if (/^(?:\d{4}[-/]\d{1,2}|\d{1,2}[-/]\d{4})$/.test(raw)) continue;
    let value = raw;
    const compact = raw.match(/^((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[0-2]\d[0-5]\d){0,2}$/);
    if (compact) value = compact[1]+'-'+compact[2]+'-'+compact[3];
    else if (/^\d{1,2}$/.test(raw) && year) value = raw+' '+month;
    else if (!/\b(?:19|20)\d{2}\b/.test(raw) && year && /\d{1,2}/.test(raw)) value = raw+' '+year[0];
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if (iso) {
      const check = new Date(Date.UTC(Number(iso[1]),Number(iso[2])-1,Number(iso[3])));
      if (check.getUTCFullYear()!==Number(iso[1]) || check.getUTCMonth()+1!==Number(iso[2]) || check.getUTCDate()!==Number(iso[3])) continue;
      return { day:iso[1]+'-'+iso[2]+'-'+iso[3], precision:'day', month, raw };
    }
    // A month/year alone never establishes a day. Require a year plus a separate day number.
    const withoutYear = value.replace(/\b(?:19|20)\d{2}\b/g,'');
    if (!/\b(?:19|20)\d{2}\b/.test(value) || !/\b(?:0?[1-9]|[12]\d|3[01])\b/.test(withoutYear)) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      const date = new Date(parsed);
      const numericDay = /^\d{1,2}$/.test(raw) ? Number(raw) : null;
      const leadingDay = value.match(/^(\d{1,2})\s+[A-Za-z]/);
      const monthFirst = value.match(/^[A-Za-z]+\s+(\d{1,2})(?:,|\s)/);
      const slashDate = value.match(/^(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2})$/);
      const expectedDay = numericDay ?? (leadingDay ? Number(leadingDay[1]) : monthFirst ? Number(monthFirst[1]) : slashDate ? Number(slashDate[2]) : null);
      if (expectedDay != null && date.getDate() !== expectedDay) continue;
      if (slashDate && (date.getMonth()+1 !== Number(slashDate[1]) || date.getFullYear() !== Number(slashDate[3]))) continue;
      return { day:date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'), precision:'day', month, raw };
    }
  }
  return { day:'', precision:month && !/^unknown|^unspecified|^not recorded$/i.test(month) ? 'month' : 'unknown', month, raw:'' };
}

function commandFilteredActivityLogs() {
  return filteredLogs().filter(log => {
    const date = commandWatchDateInfo(log);
    if (commandActivityFilters.precision && date.precision !== commandActivityFilters.precision) return false;
    if (commandActivityFilters.from && (!date.day || date.day < commandActivityFilters.from)) return false;
    if (commandActivityFilters.to && (!date.day || date.day > commandActivityFilters.to)) return false;
    return true;
  });
}

function commandActivitySource(log) {
  const ship = state.ships[keyFor(log.ship || '')];
  if (!ship) return { file:'Source unavailable', date:'' };
  const selected = (ship.snapshots || []).filter(snapshot => snapshot.sourceFingerprint && snapshot.sourceFingerprint === ship.sourceFingerprint).sort((a,b)=>String(b.importedAt||'').localeCompare(String(a.importedAt||'')))[0];
  return { file:selected && selected.fileName || 'Current source file unavailable', date:ship.sourceGeneratedAt || '' };
}

function commandActivityTable(logs) {
  const visible = logs.slice(0,600);
  return (visible.length<logs.length?'<p class="command-note">Showing 600 of '+h(logs.length.toLocaleString())+' matching rows. Export contains every matching row.</p>':'')+commandTable(['Ship / watchstander','Watch date / precision','Recorded month','Watchstation / type','Recorded hours','Latest import level / currency','Activity evidence','Source'],visible.map(log => {
    const date = commandWatchDateInfo(log), source = commandActivitySource(log);
    const label = date.precision === 'day' ? commandDateLabel(date.day) : date.precision === 'month' ? 'Day not recorded' : 'Date unavailable';
    return ['<strong>'+h(log.officer || 'Name unavailable')+'</strong><small>'+h(log.ship)+' · '+h(log.phase)+'</small>',h(label)+'<small>'+h(date.precision==='day'?'Day recorded':date.precision==='month'?'Month only':'Unknown')+'</small>',h(date.month || 'Not recorded'),h(log.watchstation)+'<small>'+h(log.logType)+'</small>',h(fmt(log.hours,1)),h(officerLevelLabel(log.level))+'<small>'+h(currencyStatusLabel(log.currency))+'</small>',h(log.rawText || log.events || log.specialConditions || 'No descriptive text')+'<small>'+h([log.area,log.traffic].filter(Boolean).join(' · '))+'</small>','<small>'+h(source.file)+'<br>'+h(source.date?commandDateLabel(source.date):'Source date unavailable')+'</small>'];
  }));
}

function commandRenderExplorer() {
  const host = document.getElementById('view-explorer');
  if (!host) return;
  const focus = captureRerenderFocus(host), logs = commandFilteredActivityLogs(), all = allLogs();
  const dayCount = logs.filter(log=>commandWatchDateInfo(log).precision==='day').length;
  const monthCount = logs.filter(log=>commandWatchDateInfo(log).precision==='month').length;
  const hours = logs.reduce((sum,log)=>sum+asNumber(log.hours),0);
  const shipOpts = allShips().map(ship=>'<option value="'+h(ship.name)+'">'+h(ship.name)+'</option>').join('');
  const phaseOpts = sortPhaseNames(unique(allShipMetrics().map(m=>m.phase))).map(phase=>'<option value="'+h(phase)+'">'+h(phase)+'</option>').join('');
  const precisionOpts = [['','Any date precision'],['day','Recorded watch day'],['month','Month only'],['unknown','Date unavailable']].map(([value,label])=>'<option value="'+value+'"'+(commandActivityFilters.precision===value?' selected':'')+'>'+label+'</option>').join('');
  host.innerHTML = '<div class="command-workspace command-evidence-workspace">'+commandEvidenceHero('Recorded watch activity','What evidence supports the change?','Search the latest retained ship logs. Use dated snapshots in Command Review to establish status and movement over time.',logs.length.toLocaleString(),'matching rows')+
    '<section class="command-controls" aria-label="Recorded activity filters"><label>Ship'+selectFilter('ship','All ships',shipOpts)+'</label><label>Current reported phase'+selectFilter('phase','All phases',phaseOpts)+'</label><label>Recorded month'+selectFilter('month','All months',filterOptions('month'))+'</label><label>Watchstation'+selectFilter('watchstation','All watchstations',filterOptions('watchstation'))+'</label><label>Latest imported level'+selectFilter('level','All levels','<option value="Blank">Unclassified</option><option value="0">L0</option><option value="1">L1</option><option value="2">L2</option><option value="3">L3</option>')+'</label><label>Latest imported currency'+selectFilter('currency','All currency','<option value="Current">Current</option><option value="Need">Requires proficiency watch</option><option value="Loss">Lost currency</option><option value="Unknown">Unknown</option>')+'</label><label>Area'+selectFilter('area','All areas',filterOptions('area'))+'</label><label>Traffic density'+selectFilter('traffic','All traffic',filterOptions('traffic'))+'</label><label for="command-activity-from">Watch date from<input id="command-activity-from" type="date" data-command-activity-filter="from" value="'+h(commandActivityFilters.from)+'"></label><label for="command-activity-to">Watch date through<input id="command-activity-to" type="date" data-command-activity-filter="to" value="'+h(commandActivityFilters.to)+'"></label><label for="command-activity-precision">Date evidence<select id="command-activity-precision" data-command-activity-filter="precision">'+precisionOpts+'</select></label><label for="filter-search">Search evidence<input id="filter-search" type="search" placeholder="Name, ship, watch text" value="'+h(explorerFilters.search || '')+'"></label><div class="command-export-actions"><button class="btn secondary" type="button" data-command-activity-reset>Clear all filters</button><button class="btn" type="button" data-command-activity-export'+(logs.length?'':' disabled')+'>Export filtered evidence</button></div></section>'+
    '<p class="command-period-note" role="status" aria-live="polite">'+h(logs.length.toLocaleString())+' of '+h(all.length.toLocaleString())+' rows · '+h(fmt(hours,1))+' recorded hours · '+h(dayCount)+' with a watch day · '+h(monthCount)+' month only · '+h(logs.length-dayCount-monthCount)+' date unavailable.</p>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Activity, with provenance</span><h2>Which watches and events were recorded?</h2><p>Hours count base watches once; related events can carry zero additional hours. A row’s imported level and currency describe the imported person record, not their status on the watch date.</p></div><button class="btn secondary" type="button" data-view="dashboard">Open dated status comparisons</button></div>'+(logs.length?commandActivityTable(logs):emptyState(all.length?'No recorded activity matches these filters.':'Import WAKE ship evidence to search watch records.'))+'<p class="command-note">Date range filters include only rows with a recorded day; month-only and undated activity are excluded from that range. Watch dates use explicit source fields, never upload timestamps. These are the latest retained logs, not a complete historical log archive. Historical roster observations are available in Upload History.</p></section></div>';
  restoreRerenderFocus(host,focus);
}

function commandActivityCsv() {
  const headers = ['Ship','OFRP Phase','Officer','Rank','Latest Imported Level','Latest Imported Currency','Month','Watchstation','Date/Day Logged','Watch Date','Log Type','Raw Text Entry','Events','Special Conditions','Hours','Area','Fleet','Traffic Density','Sim','Score','Log ID','Resolved Watch Day','Date Precision','Current Ship Source File','Current Ship Source Date'];
  return headers.map(csvEscape).join(',')+'\n'+commandFilteredActivityLogs().map(log=>{
    const date=commandWatchDateInfo(log), source=commandActivitySource(log);
    return filteredLogCsvRow(log).concat([date.day,date.precision,source.file,source.date]).map(csvEscape).join(',');
  }).join('\n');
}

function commandRenderReferences() {
  const host = document.getElementById('view-references');
  if (!host) return;
  const quality = fleetDataQuality(allShipMetrics());
  const questions = [
    ['What changed since the last report?','Command Review compares each ship’s two latest dated observations through the selected end date. Named transitions show losses, recoveries, new proficiency-watch requirements, level changes, and roster movement.','dashboard'],
    ['Where were we three, six, or twelve months ago?','Choose a period or baseline date. The baseline is the latest observation on or before that date; the endpoint is the latest on or before the through date. Read the actual source dates beside each result.','dashboard'],
    ['What happened in a particular month?','The monthly record shows the last roster observed in each month and changes observed between reports. Missing months remain unknown. A loss observed in August may have occurred since an earlier report, rather than on a proven August date.','dashboard'],
    ['Who needs attention now?','Current currency ages from the latest dated evidence assuming no later qualifying watch. A fresh source confirms actual status. Use the named roster to find the evidence behind each requirement.','performance'],
    ['What did this upload establish?','Upload History distinguishes a new observation, older backfill, correction, repeated source, assessment overlay, or rejection. Open its preserved roster and source dates before drawing a trend conclusion.','imports'],
    ['Which activity supports the assessment?','Evidence Search filters retained watch rows by ship, person, month, watch date, watchstation, level, currency, area, and traffic. Activity alone does not establish proficiency gains or a completed advancement gate.','explorer']
  ];
  const cards = questions.map(([title,body,view])=>'<article class="command-panel"><h2>'+h(title)+'</h2><p>'+h(body)+'</p><p class="command-note"><button class="btn secondary" type="button" data-view="'+view+'">Open evidence</button></p></article>').join('');
  const rules = [
    ['Observation date','The ship export’s source timestamp anchors history. Comparison dates and months use UTC; displayed upload timestamps use browser-local time. An upload timestamp records when Fleet received the file; it does not prove the ship’s status on that date.'],
    ['Comparable people','Match within the same ship using normalized exported names. Roster additions and absences remain separate from currency losses and recoveries; a name correction may create apparent roster movement.'],
    ['Gross movement and endpoint change','A person can lose and regain currency during a period. Both observations remain visible even when endpoint totals are equal. Unknown currency is excluded from confirmed loss and recovery claims.'],
    ['Coverage and gaps','One observation establishes a baseline. Missing months, unknown currency, and ships without a usable baseline do not contribute fabricated zero-change evidence. Rates show their roster denominators.'],
    ['Corrections and repeated files','Repeated fingerprints do not add history. When different exports share a source time, the selected correction is flagged and earlier versions remain available. An older repeated file cannot rewind later accepted current evidence.'],
    ['Cumulative measures','A change in cumulative hours can include source corrections, roster movement, or prior experience. It is not automatically hours performed during the selected period.'],
    ['OFRP context','Supported phases are Basic, Advanced, Integrated, Sustainment, and Maintenance. Observations retain their recorded phase; latest logs grouped under the current phase do not establish an event-time phase.']
  ];
  host.innerHTML = '<div class="command-workspace command-evidence-workspace">'+commandEvidenceHero('Command guide','Ask a question. Follow the evidence.','Use the same WAKE ship inputs to build a dated, auditable picture of progression and current currency.','WAKE','bridge evidence')+
    '<div class="command-controls"><div class="command-export-actions"><button class="btn" type="button" data-command-maintenance="import">Import WAKE data</button><button class="btn secondary" type="button" data-view="dashboard">Start command review</button></div></div><p class="command-period-note">WAKE Fleet retains OOD, JOOD, and CONN bridge evidence from WAKE JSON working copies and ship CSV exports. It remains a personnel training decision aid; command decisions require review of the underlying evidence.</p>'+cards+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Interpretation</span><h2>What does each comparison prove?</h2><p>Use these rules when briefing a change, a gap, or a limitation.</p></div></div>'+commandTable(['Evidence rule','How to read the result'],rules.map(row=>row.map(h)))+'</section>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">WAKE fundamentals</span><h2>Which definitions remain in force?</h2></div></div>'+commandTable(['Measure','Meaning'],[
      ['Current','Fewer than 45 days since a qualifying watch, supported by recency evidence.'],['Requires proficiency watch','45 through 90 days since a qualifying watch.'],['Lost currency','More than 90 days since a qualifying watch. Unknown evidence is a separate category.'],['Levels and qualifications','WAKE levels, ship qualification, ROR evidence, hours, and exported requirements remain available. An approaching-level hours indicator does not approve advancement.'],['ROR coverage','A dated passing score of at least 90 within 365 days supports current ROR status. Undated or future-dated evidence requires review.'],['Hours and evolutions','Base watch hours count once. Related event and special-condition rows retain evidence without multiplying watch hours.'],['MSA outcomes','MSA 2 and MSA 5 results remain distinct from watch activity. Rates with fewer than 10 evaluated attempts are directional; opportunity normalization requires exported underway-hour evidence.']
    ].map(row=>row.map(h)))+'</section>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Storage and handoff</span><h2>Where is the command record saved?</h2><p>The approved SharePoint connection, local browser storage, IndexedDB copies, and live reconciliation remain part of the app.</p></div></div><p><strong>SharePoint:</strong> '+h(sharePointRuntime.status || 'Status unavailable')+'</p>'+(sharePointRuntime.lastError?'<p class="command-note">'+h(sharePointRuntime.lastError)+'</p>':'')+'<p class="command-note"><strong>Configured site:</strong> '+h(SHAREPOINT_CONFIG.configuredSiteUrl)+'<br><strong>Coverage:</strong> '+h(quality.coverageText)+' · '+h(quality.staleShips.length)+' stale or unverified ship exports. The visible save status reports whether remote synchronization succeeded; this guide does not certify authenticated-host access.</p><div class="command-onboarding"><article><h3>Preserve the working record</h3><p>Fleet Backup includes current ship state, retained observations, upload reports, and history.</p><button class="btn secondary" type="button" data-command-maintenance="backup">Export Fleet Backup</button></article><article><h3>Restore a Fleet Backup</h3><p>This is the separate whole-fleet replacement workflow. The app requests confirmation before replacing loaded fleet data.</p><button class="btn secondary" type="button" data-command-maintenance="restore">Import Fleet Backup</button></article><article><h3>Set reporting expectations</h3><p>Configure the expected ship count and freshness threshold so incomplete coverage stays visible.</p><button class="btn secondary" type="button" data-command-maintenance="coverage">Set coverage</button></article></div><p class="command-note">Use Command Review’s evidence CSV and printable CO brief for the selected comparison. <button class="mini-btn" type="button" data-command-maintenance="full-csv">Export full current fleet CSV</button> includes current ship, person, watch-log, and phase rows. Handle names and exported records under command data policy.</p></section></div>';
}

function attachCommandEvidenceEvents() {
  document.addEventListener('change',event=>{
    const field = event.target.dataset && event.target.dataset.commandActivityFilter;
    if (!field || !Object.prototype.hasOwnProperty.call(commandActivityFilters,field)) return;
    commandActivityFilters[field] = event.target.value;
    commandRenderExplorer();
  });
  document.addEventListener('click',event=>{
    const control = event.target.closest && event.target.closest('[data-command-source-ship],[data-command-activity-reset],[data-command-activity-export],[data-command-maintenance]');
    if (!control) return;
    event.preventDefault();
    if (control.hasAttribute('data-command-source-ship')) return commandOpenSource(control.dataset.commandSourceShip,control.dataset.commandSourceIndex);
    if (control.hasAttribute('data-command-activity-reset')) {
      commandActivityFilters = {from:'',to:'',precision:''};
      Object.keys(explorerFilters).forEach(key=>explorerFilters[key]='');
      commandRenderExplorer();
      document.querySelector('[data-command-activity-reset]')?.focus();
      return;
    }
    if (control.hasAttribute('data-command-activity-export')) {
      if (!commandFilteredActivityLogs().length) return showToast('No recorded activity matches these filters.');
      return downloadText('FLEET_WAKE_Recorded_Evidence_'+new Date().toISOString().slice(0,10)+'.csv',commandActivityCsv(),'text/csv;charset=utf-8');
    }
    const action = control.dataset.commandMaintenance;
    if (action==='import') { if(importInProgress)return showToast('An import is already in progress.'); if(els.fileInput)els.fileInput.click(); }
    else if(action==='backup') exportFleetBackup();
    else if(action==='restore') { if(els.backupInput)els.backupInput.click(); }
    else if(action==='coverage') configureDataExpectations();
    else if(action==='full-csv') exportFullFleetCsv();
  });
}
