// Embedded into the standalone application by build-command-progress.cjs.
let commandFilters = { ship:"", mode:"previous", from:"", to:"", evidence:"all" };
const COMMAND_CHANGE_LABELS = { lost:"Lost currency", restored:"Restored to current", requiresWatch:"Now requires proficiency watch", levelUp:"Level increased", levelDown:"Level decreased", joined:"Added to roster", departed:"Absent from later roster", unknownCurrency:"Currency comparison unverified", unknownLevel:"Level comparison unverified" };

function commandDateLabel(value) {
  if (!value) return "Unavailable";
  const date = new Date(String(value).slice(0,10) + "T12:00:00Z");
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}) : "Unavailable";
}

function commandSigned(value) { return (value > 0 ? "+" : "") + fmt(value,1); }
function commandTable(headers, rows, cls) {
  return '<div class="table-wrap command-table ' + h(cls || "") + '"><table><thead><tr>' + headers.map(label=>'<th scope="col">'+h(label)+'</th>').join("") + '</tr></thead><tbody>' + rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
}
function commandPill(category) {
  const cls = category === "Current" ? "current" : category === "Need" ? "need" : category === "Loss" ? "loss" : "unknown";
  return '<span class="command-pill '+cls+'">'+h(currencyStatusLabel(category))+'</span>';
}
function commandScopedShips() { return allShips().filter(ship=>!commandFilters.ship || keyFor(ship.name) === commandFilters.ship); }
function commandReviewModel() {
  const now = new Date().toISOString();
  const to = commandFilters.to || now.slice(0,10);
  const entries = commandScopedShips().map(ship=>({ship, comparison:commandCompare(ship,Object.assign({},commandFilters,{to,nowISO:now})), current:commandCurrent(ship,now)}));
  const comparable = entries.filter(entry=>entry.comparison.available);
  const counts = Object.fromEntries(Object.keys(COMMAND_CHANGE_LABELS).map(key=>[key,comparable.reduce((sum,entry)=>sum+Number(entry.comparison.observed.counts[key] || 0),0)]));
  let from = commandFilters.from;
  if (commandFilters.mode !== "date" || !from) {
    const dates = entries.map(entry=>entry.comparison.requestedFrom || (entry.comparison.baseline && entry.comparison.baseline.date)).filter(Boolean).sort();
    from = dates[0];
  }
  if (!from) { const start = new Date(to+"T12:00:00Z"); start.setUTCMonth(start.getUTCMonth()-5,1); from=start.toISOString().slice(0,10); }
  const monthly = entries.map(entry=>({ship:entry.ship, data:commandMonthly(entry.ship,from,to,now)}));
  return {now,to,from,entries,comparable,counts,monthly};
}
function commandControls() {
  const options = allShips().map(ship=>'<option value="'+h(keyFor(ship.name))+'"'+(keyFor(ship.name)===commandFilters.ship?' selected':'')+'>'+h(ship.name)+'</option>').join("");
  return '<section class="command-controls" aria-label="Comparison period (UTC dates)"><label for="command-ship">Command / ship<select id="command-ship" data-command-filter="ship"><option value="">All imported ships</option>'+options+'</select></label>'+
    '<label for="command-mode">Compare with<select id="command-mode" data-command-filter="mode">'+[['previous','Previous report'],['3m','3 months ago'],['6m','6 months ago'],['12m','12 months ago'],['date','A chosen date']].map(([value,label])=>'<option value="'+value+'"'+(commandFilters.mode===value?' selected':'')+'>'+label+'</option>').join("")+'</select></label>'+
    (commandFilters.mode==='date'?'<label for="command-from">Baseline date<input id="command-from" type="date" data-command-filter="from" max="'+h(commandFilters.to||new Date().toISOString().slice(0,10))+'" value="'+h(commandFilters.from)+'"></label>':'')+
    '<label for="command-to">Through date (UTC)<input id="command-to" type="date" data-command-filter="to" max="'+new Date().toISOString().slice(0,10)+'" value="'+h(commandFilters.to||new Date().toISOString().slice(0,10))+'"></label><div class="command-export-actions"><button class="btn secondary" type="button" data-command-export="csv">Evidence CSV</button><button class="btn" type="button" data-command-export="brief">Print CO brief</button></div></section>';
}
function commandStat(label,value,detail,tone,key) {
  return '<button type="button" class="command-stat '+h(tone||'')+'" data-command-evidence="'+h(key||'all')+'"><span>'+h(label)+'</span><strong>'+h(value)+'</strong><small>'+h(detail)+'</small><em>View named evidence &rarr;</em></button>';
}
function commandSummaryCards(model) {
  const c=model.counts, known=model.comparable.length>0;
  const cards='<div class="command-kpis">'+commandStat('Lost currency',known?c.lost:'—','Observed losses during this period','loss','lost')+
    commandStat('Restored to current',known?c.restored:'—','Recoveries shown separately','current','restored')+
    commandStat('Requires proficiency watch',known?c.requiresWatch:'—','Newly observed need','need','requiresWatch')+
    commandStat('Level increased',known?c.levelUp:'—','Observed progression','progress','levelUp')+'</div>';
  return model.entries.length===1?cards.replaceAll('data-command-evidence=', 'data-command-evidence-ship="'+h(keyFor(model.entries[0].ship.name))+'" data-command-evidence='):cards;
}
function commandComparisonTable(model) {
  const rows=model.entries.map(({ship,comparison:c})=>{
    const title='<button class="ship-link" type="button" data-command-ship="'+h(keyFor(ship.name))+'">'+h(ship.name)+'</button>';
    if (!c.available) return [title,h(c.reason),'—','—','—','—','—'];
    const rate=m=>m.officerCount?Math.round(m.current/m.officerCount*100)+'% ('+m.current+'/'+m.officerCount+')':'No roster';
    return [title,'<strong>'+h(commandDateLabel(c.baseline.date))+' → '+h(commandDateLabel(c.end.date))+'</strong><small>'+h(c.baseline.snapshot.fileName)+' → '+h(c.end.snapshot.fileName)+'</small>',h(rate(c.before)+' → '+rate(c.after)),h(c.before.loss+' → '+c.after.loss),h(c.before.need+' → '+c.after.need),h(c.counts.joined+' added / '+c.counts.departed+' absent'),'<button class="mini-btn" type="button" data-command-detail="'+h(keyFor(ship.name))+'">Before / after</button>'];
  });
  return '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Baseline → latest evidence</span><h2>Where did we start, and where are we now?</h2><p>Endpoint totals include roster changes. Losses and recoveries above count matched-person transitions between reports.</p></div><span class="command-coverage">'+h(model.comparable.length)+' / '+h(model.entries.length)+' ships comparable</span></div>'+commandTable(['Ship','Actual source dates / files','Current / roster','Lost currency','Requires watch','Roster movement','Evidence'],rows)+'</section>';
}
function commandMonthRows(model) {
  const months=new Map();
  model.monthly.forEach(({ship,data})=>data.months.forEach(item=>{
    if(!months.has(item.month)) months.set(item.month,{month:item.month,label:item.label,ships:0,compared:0,total:0,current:0,need:0,loss:0,unknown:0,lost:0,restored:0,levelUp:0,requiresWatch:0,intervals:[],observations:0});
    const row=months.get(item.month);
    if(!item.hasObservation) return;
    row.ships++; row.observations+=(item.observations || []).length;
    if(item.hasComparison)row.compared++;
    row.total+=item.metrics.officerCount;
    ['current','need','loss','unknown'].forEach(key=>row[key]+=item.metrics[key]||0);
    ['lost','restored','levelUp','requiresWatch'].forEach(key=>row[key]+=item.counts[key]||0);
    row.intervals.push(ship.name+': '+commandDateLabel(item.snapshot.date)+(item.baselineOnly?' (first observation; changes unknown)':item.gap?' (gap since prior report)':''));
  }));
  return Array.from(months.values()).sort((a,b)=>a.month.localeCompare(b.month));
}
function commandMonthlyPanel(model) {
  const months=commandMonthRows(model);
  if(!months.length) return '<section class="command-panel"><h2>Monthly progression</h2>'+emptyState(model.monthly.map(item=>item.data.reason).filter(Boolean).join(' ')||'Choose a valid comparison period to show monthly evidence.')+'</section>';
  const bars=months.map(row=>{
    const desc=row.ships?row.current+' current, '+row.need+' require a proficiency watch, '+row.loss+' lost, '+row.unknown+' unknown; '+row.ships+' reporting ships':'No dated report this month';
    const stack=row.ships?['current','need','loss','unknown'].map(key=>row[key]?'<span class="'+key+'" style="width:'+(100*row[key]/Math.max(1,row.total))+'%" title="'+h(key+': '+row[key])+'"></span>':'').join(''):'<span class="no-report">No report</span>';
    return '<div class="command-trend-row"><strong>'+h(row.label)+'</strong><div class="command-stack" role="img" aria-label="'+h(desc)+'">'+stack+'</div><span>'+h(row.ships+'/'+model.entries.length)+' ships · '+h(row.total)+' people</span></div>';
  }).join('');
  const rows=months.map(row=>[h(row.label),row.ships?h(row.ships+'/'+model.entries.length)+'<small>'+h(row.compared)+' with a prior report</small>':'<span class="command-muted">No report</span>',row.compared?h(row.lost):'—',row.compared?h(row.restored):'—',row.compared?h(row.requiresWatch):'—',row.compared?h(row.levelUp):'—',row.ships?h(row.current+' / '+row.total):'—',row.ships?h(row.loss):'—','<small>'+h(row.intervals.join('; ')||'No observation. Status and movement unknown.')+'</small>']);
  return '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Observed progression</span><h2>What happened month by month?</h2><p>Bars show the last reported roster in each month. Missing months stay blank; changing reporting coverage changes the denominator.</p></div></div><div class="command-legend"><span class="current">Current</span><span class="need">Requires watch</span><span class="loss">Lost currency</span><span class="unknown">Unknown</span></div><div class="command-trend">'+bars+'</div>'+commandTable(['Month','Reporting ships','Losses observed','Recoveries observed','New watch need','Level increases','Current / roster','Lost at last report','Source coverage'],rows)+'<p class="command-note">Movements are assigned to the month of the later report. They occurred sometime between observations; they are not proven to have happened in that calendar month. A first report establishes a baseline and cannot prove zero changes.</p></section>';
}
function commandCurrentPanel(model) {
  const rows=model.entries.map(({ship,current:c})=>{
    const counts=c.counts||{};
    return ['<button class="ship-link" type="button" data-command-current="'+h(keyFor(ship.name))+'">'+h(ship.name)+'</button>',(c.sourceAt?h(commandDateLabel(c.sourceDate)+' · '+c.ageDays+' days old'):h(c.reason||'Source date unavailable'))+(c.undatedConflict?'<small>Newer undated roster differs — verify with a dated export.</small>':''),h(counts.current??'—'),h(counts.need??'—'),h(counts.loss??'—'),h(counts.unknown??'—'),'<button class="mini-btn" type="button" data-command-current="'+h(keyFor(ship.name))+'">Named roster</button>'];
  });
  return '<section class="command-panel command-current-panel"><div class="command-section-heading"><div><span class="section-kicker">Currency now · '+h(commandDateLabel(model.now))+' UTC</span><h2>What needs attention now?</h2><p>Currency aged from the latest dated evidence, assuming no later qualifying watch. A fresh upload confirms actual status; the historical period above remains frozen.</p></div></div>'+commandTable(['Ship','Latest source / age','Current','Requires watch','Lost currency','Unknown','Evidence'],rows)+'</section>';
}
function commandEvidenceRows(model,filter) {
  const result=[];
  model.comparable.forEach(({ship,comparison:c})=>Object.keys(COMMAND_CHANGE_LABELS).filter(key=>!filter||filter==='all'||filter===key).forEach(key=>(c.observed.rows[key]||[]).forEach(row=>result.push({ship,type:key,row}))));
  return result.sort((a,b)=>String(b.row.observedAt).localeCompare(String(a.row.observedAt))||a.ship.name.localeCompare(b.ship.name)||a.row.name.localeCompare(b.row.name));
}
function commandEvidenceTable(model,filter) {
  const rows=commandEvidenceRows(model,filter);
  if(!rows.length) return emptyState(model.comparable.length?'No matching transitions were observed between the available reports. Unobserved activity remains unknown.':'At least two dated exports for a ship are needed to show changes.');
  return commandTable(['Ship / watchstander','Observed change','Before → after','Observation interval','Source files'],rows.map(({ship,type,row})=>{
    const currency=['lost','restored','requiresWatch','unknownCurrency'].includes(type);
    const from=currency?currencyStatusLabel(row.from):String(row.from??'—'), to=currency?currencyStatusLabel(row.to):String(row.to??'—');
    const c=model.entries.find(entry=>entry.ship===ship).comparison;
    const fileAt=date=>{const match=c.timeline.snapshots.find(item=>item.at===date||item.date===String(date).slice(0,10));return match?match.snapshot.fileName:'';};
    return ['<strong>'+h(row.name)+'</strong><small>'+h(ship.name)+'</small>',h(COMMAND_CHANGE_LABELS[type]),h(from+' → '+to),h(commandDateLabel(row.observedFrom)+' → '+commandDateLabel(row.observedAt)),'<small>'+h(fileAt(row.observedFrom)+' → '+fileAt(row.observedAt))+'</small>'];
  }));
}
function commandEvidencePanel(model) {
  return '<section class="command-panel" id="command-evidence"><div class="command-section-heading"><div><span class="section-kicker">Trace every count</span><h2>Who changed?</h2><p>Matched by ship and normalized exported name. Name corrections can appear as roster movement. Repeated losses or recoveries count as separate observations.</p></div><label for="command-evidence-filter">Change type<select id="command-evidence-filter" data-command-filter="evidence"><option value="all">All observed changes</option>'+Object.entries(COMMAND_CHANGE_LABELS).map(([key,label])=>'<option value="'+key+'"'+(commandFilters.evidence===key?' selected':'')+'>'+h(label)+'</option>').join('')+'</select></label></div>'+commandEvidenceTable(model,commandFilters.evidence)+'</section>';
}
function commandSourcesPanel(model) {
  const rows=[];
  model.entries.forEach(({ship,comparison:c})=>{
    const timeline=c.timeline;
    [...timeline.snapshots,...timeline.undated].forEach(item=>rows.push([h(ship.name),h(item.snapshot.fileName||'Unnamed source'),item.dated?h(commandDateLabel(item.date)):'Undated — excluded from periods',h(item.snapshot.importedAt?new Date(item.snapshot.importedAt).toLocaleString():'Unavailable'),h(Object.keys(item.snapshot.officerStates||{}).length),h(item.corrected?'Corrected at same source time':(item.dated?'Dated observation':'Upload time is not a source date'))]));
    timeline.excluded.forEach(item=>{const snapshot=item.snapshot||{};rows.push([h(ship.name),h(snapshot.fileName||'Unnamed source'),h(snapshot.sourceGeneratedAt||'Unavailable'),h(snapshot.importedAt||''),'—',h(item.reason)]);});
    timeline.conflicts.forEach(conflict=>conflict.alternatives.forEach(item=>rows.push([h(ship.name),h(item.snapshot.fileName||'Unnamed source'),h(commandDateLabel(item.date)),h(item.snapshot.importedAt||''),h(Object.keys(item.snapshot.officerStates||{}).length),'Earlier version at same source time — retained, not counted twice'])));
  });
  const warnings=model.entries.flatMap(({ship,comparison:c})=>[...c.caveats,...c.timeline.warnings].map(value=>ship.name+': '+value));
  return '<details class="command-panel command-sources"><summary>Source register &amp; comparison rules <span>'+rows.length+' records</span></summary><p>Baseline uses the latest available report on or before the requested date. End uses the latest on or before the through date. Actual source dates may be earlier than requested. Undated uploads are retained, but cannot establish a calendar trend.</p>'+commandTable(['Ship','File','Source date','Imported','Roster','Evidence status'],rows)+(warnings.length?'<ul>'+Array.from(new Set(warnings)).map(value=>'<li>'+h(value)+'</li>').join('')+'</ul>':'')+'<p class="command-note">Current: fewer than 45 days since qualifying watch. Requires proficiency watch: 45–90 days. Lost currency: more than 90 days. Unknown evidence is never counted as a confirmed loss or recovery. Roster additions and absences are not proof of arrival or transfer dates. Changes in cumulative hours can include corrections and are not automatically hours performed during the period.</p></details>';
}
function commandWorkspace() {
  if(!allShips().length) return '<section class="command-empty command-panel"><span class="section-kicker">Command evidence</span><h1>What changed since last time?</h1><p>Build a dated record of ship proficiency, progression, and currency from the WAKE exports you already use.</p><div class="command-onboarding"><article><b>01</b><h2>Establish the baseline</h2><p>Upload a ship’s WAKE JSON or CSV. Its source date anchors the first observation.</p></article><article><b>02</b><h2>Add the next report</h2><p>Upload later exports. Earlier rosters and recorded status remain available.</p></article><article><b>03</b><h2>See the change</h2><p>Choose a date or period. Review losses, recoveries, level changes, and the people behind them.</p></article></div></section>';
  if(commandFilters.ship&&!state.ships[commandFilters.ship]) commandFilters.ship='';
  const model=commandReviewModel();
  return '<div class="command-workspace"><section class="command-hero"><div><span class="section-kicker">CO command review</span><h1 class="view-title">What changed since last time?</h1><p>Progress over time. Currency today. Every change tied to imported evidence.</p></div><div class="command-hero-stamp"><strong>'+h(model.entries.length)+'</strong><span>ships in review</span></div></section>'+commandControls()+'<div class="command-period-note" role="status"><strong>'+h(model.comparable.length)+' of '+h(model.entries.length)+' ships have comparable reports.</strong> '+(commandFilters.mode==='previous'?'Comparing each ship’s two latest dated reports through '+h(commandDateLabel(model.to))+'.':'Requested baseline '+h(commandDateLabel(model.from))+' through '+h(commandDateLabel(model.to))+'.')+' Counts below are observed transitions; multiple changes for one person remain visible.</div>'+commandSummaryCards(model)+commandComparisonTable(model)+commandMonthlyPanel(model)+commandCurrentPanel(model)+commandEvidencePanel(model)+commandSourcesPanel(model)+'</div>';
}
function commandOpenShipReview(shipKey) { commandFilters.ship=shipKey; renderDashboard(); switchView('dashboard'); document.getElementById('view-dashboard')?.scrollIntoView({block:'start'}); }
function commandShipCallout(ship) {
  const c=commandCompare(ship,commandFilters);
  return '<section class="command-ship-callout"><div><span class="section-kicker">Ship progression</span><h2>What changed for '+h(ship.name)+'?</h2><p>'+h(c.available?commandDateLabel(c.baseline.date)+' → '+commandDateLabel(c.end.date)+': '+c.observed.counts.lost+' losses, '+c.observed.counts.restored+' recoveries, '+c.observed.counts.levelUp+' level increases.':c.reason)+'</p></div><button class="btn" type="button" data-command-ship="'+h(keyFor(ship.name))+'">Open command review</button></section>';
}
function commandOpenComparison(shipKey) {
  const ship=state.ships[shipKey]; if(!ship)return;
  const c=commandCompare(ship,Object.assign({},commandFilters));
  if(!c.available) { showModal('Comparison — '+ship.name,c.reason,emptyState(c.reason)); return; }
  const fields=[['Roster','officerCount'],['Current','current'],['Requires proficiency watch','need'],['Lost currency','loss'],['Unknown currency','unknown'],['Ship qualified','shipQual'],['Approaching next level','approaching'],['Cumulative bridge hours','totalHours']];
  const rows=fields.map(([label,key])=>[h(label),h(fmt(c.before[key],1)),h(fmt(c.after[key],1)),h(commandSigned(c.after[key]-c.before[key]))]);
  ['0','1','2','3','Blank'].forEach(level=>rows.push([h(level==='Blank'?'Unclassified':'Level '+level),h(c.before.levels[level]||0),h(c.after.levels[level]||0),h(commandSigned((c.after.levels[level]||0)-(c.before.levels[level]||0)))]));
  showModal('Before / after — '+ship.name,commandDateLabel(c.baseline.date)+' → '+commandDateLabel(c.end.date),'<p>'+h(c.baseline.snapshot.fileName)+' → '+h(c.end.snapshot.fileName)+'</p>'+commandTable(['Measure','Baseline','End report','Net change'],rows)+'<p class="command-note">Net totals include roster movement. Observed losses and recoveries use matched names and remain separate. Cumulative hour changes may include corrections.</p>');
}
function commandOpenCurrent(shipKey) {
  const ship=state.ships[shipKey]; if(!ship)return;
  const c=commandCurrent(ship,new Date().toISOString());
  showModal('Currency today — '+ship.name,'Aged from '+commandDateLabel(c.sourceDate)+'; no later qualifying watch assumed.',commandTable(['Watchstander','At source','Days at source','Days today','Currency today','Evidence'],c.roster.map(row=>[h(row.name),commandPill(row.sourceCategory),h(row.sourceDays??'Unknown'),h(row.days??'Unknown'),commandPill(row.category),h(row.evidence||'')]))+'<p class="command-note">'+h(c.caveats.join(' '))+'</p>');
}
function commandExportCsv() {
  const model=commandReviewModel();
  const rows=[['Record','Ship','Person / measure','Change type','Before','After','Baseline source date','End source date','Baseline file','End file','Note']];
  rows.push(['REVIEW','','Requested period',commandFilters.mode,model.from,model.to,'','','','','Observed intervals, not exact occurrence dates. Currency today assumes no later qualifying watch.']);
  model.entries.forEach(({ship,comparison:c,current})=>{
    Array.from(new Set([...c.caveats,...current.caveats])).forEach(note=>rows.push(['EVIDENCE_NOTE',ship.name,'','','','','','','','',note]));
    if(c.available) ['officerCount','current','need','loss','unknown','totalHours','shipQual'].forEach(field=>rows.push(['ENDPOINT',ship.name,field,'net',c.before[field],c.after[field],c.baseline.at,c.end.at,c.baseline.snapshot.fileName,c.end.snapshot.fileName,'Includes roster changes; cumulative hours may include corrections.']));
    else rows.push(['COVERAGE',ship.name,'','','','','','','','',c.reason]);
    current.roster.forEach(row=>rows.push(['CURRENCY_TODAY',ship.name,row.name,'aged currency',row.sourceCategory,row.category,current.sourceAt,model.now,current.snapshot?current.snapshot.snapshot.fileName:'','','No later qualifying watch assumed. Days today: '+(row.days??'Unknown')+'. '+current.caveats.join(' ')]));
    [...c.timeline.snapshots,...c.timeline.undated].forEach(item=>rows.push(['SOURCE',ship.name,'','','','',item.dated?item.at:'',item.snapshot.importedAt,item.snapshot.fileName,'',item.dated?'Source dated':'Undated; excluded from calendar comparison']));
  });
  commandEvidenceRows(model,'all').forEach(({ship,type,row})=>{
    const timeline=model.entries.find(entry=>entry.ship===ship).comparison.timeline.snapshots;
    const fileAt=date=>timeline.find(item=>item.at===date)?.snapshot.fileName||'';
    rows.push(['TRANSITION',ship.name,row.name,COMMAND_CHANGE_LABELS[type],row.from,row.to,row.observedFrom,row.observedAt,fileAt(row.observedFrom),fileAt(row.observedAt),'Observed between reports; not an exact occurrence date']);
  });
  model.monthly.forEach(({ship,data})=>data.months.forEach(row=>rows.push(['MONTH',ship.name,row.month,'observed losses / recoveries',row.hasComparison?row.counts.lost:'',row.hasComparison?row.counts.restored:'','',row.snapshot?row.snapshot.at:'','',row.snapshot?row.snapshot.snapshot.fileName:'',row.hasObservation?(row.caveat||'Observed-at month; first report does not establish zero changes'):'No report; unknown'])));
  downloadText('FLEET_WAKE_Command_Evidence_'+model.to+'.csv',rows.map(row=>row.map(csvEscape).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function commandBriefHtml() {
  const model=commandReviewModel();
  const scope=commandFilters.ship?state.ships[commandFilters.ship].name:'All imported ships';
  return '<!doctype html><html><head><meta charset="utf-8"><title>WAKE Fleet — CO Progress Brief</title><style>@page{size:landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#142b42}h1{font-size:26px}h2{font-size:18px;margin-top:24px}p{line-height:1.5}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#edf3f8}small{display:block}button{font:inherit;border:0;background:transparent;color:inherit;padding:0;text-align:left}.command-kpis{display:flex;gap:12px}.command-stat{flex:1;border:1px solid #bccbd8;padding:12px}.command-stat strong{display:block;font-size:28px}.command-stat em{display:none}.command-stat span,.command-stat small{display:block}.command-panel{margin:16px 0}.section-kicker{font-size:10px;text-transform:uppercase}.command-coverage{font-weight:bold}.command-trend,.command-legend{display:none}.command-note{font-size:10px}tr{break-inside:avoid}.command-pill{font-weight:bold}.command-sources summary{font-size:18px;font-weight:bold}a{color:inherit}</style></head><body><header><p>WAKE FLEET / COMMAND EVIDENCE</p><h1>What changed since last time?</h1><p>'+h(scope)+' · Generated '+h(new Date(model.now).toLocaleString())+'</p><p>'+h(commandFilters.mode==='previous'?'Previous report comparison through '+commandDateLabel(model.to):'Requested baseline '+commandDateLabel(model.from)+' through '+commandDateLabel(model.to))+' · '+model.comparable.length+' of '+model.entries.length+' ships comparable.</p></header>'+commandSummaryCards(model)+commandComparisonTable(model)+commandMonthlyPanel(model)+commandCurrentPanel(model)+'<section><h2>Named transition evidence</h2>'+commandEvidenceTable(model,'all')+'</section>'+commandSourcesPanel(model).replace('<details','<details open')+'<p>Observed transitions are not exact event dates. Retain a Fleet Backup with this brief to preserve the underlying snapshots.</p></body></html>';
}
function commandPrintBrief() {
  const content=commandBriefHtml();
  const win=window.open('','_blank');
  if(!win||!win.document){downloadText('FLEET_WAKE_CO_Progress_Brief.html',content,'text/html;charset=utf-8');return;}
  win.document.open();win.document.write(content);win.document.close();
  setTimeout(()=>{try{win.focus();win.print();}catch(error){showToast('Use Print in the report window to save PDF.');}},350);
}
function attachCommandEvents() {
  document.addEventListener('change',event=>{
    const field=event.target.dataset&&event.target.dataset.commandFilter;
    if(!field)return;
    const host=document.getElementById('view-dashboard');
    const focus=captureRerenderFocus(host);
    commandFilters[field]=event.target.value;
    render();restoreRerenderFocus(host,focus);
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest&&event.target.closest('[data-command-ship],[data-command-detail],[data-command-current],[data-command-evidence],[data-command-export],[data-command-import]');
    if(!button)return;
    event.preventDefault();
    if(button.hasAttribute('data-command-import')){if(!importInProgress)els.fileInput?.click();}
    else if(button.hasAttribute('data-command-ship'))commandOpenShipReview(button.dataset.commandShip);
    else if(button.hasAttribute('data-command-detail'))commandOpenComparison(button.dataset.commandDetail);
    else if(button.hasAttribute('data-command-current'))commandOpenCurrent(button.dataset.commandCurrent);
    else if(button.hasAttribute('data-command-evidence')){commandFilters.evidence=button.dataset.commandEvidence;if(button.dataset.commandEvidenceShip)commandFilters.ship=button.dataset.commandEvidenceShip;render();switchView('dashboard');document.getElementById('command-evidence')?.scrollIntoView({block:'start',behavior:'smooth'});document.getElementById('command-evidence-filter')?.focus({preventScroll:true});}
    else if(button.dataset.commandExport==='csv')commandExportCsv();
    else if(button.dataset.commandExport==='brief')commandPrintBrief();
  });
}
