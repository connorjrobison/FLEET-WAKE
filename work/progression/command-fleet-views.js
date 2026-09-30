let commandFleetFilters={phase:"",search:""};
const commandShipActivitySelections={};

function commandActivityMonth(log) {
  const candidates=[log&&log.month,log&&log.watchDate,log&&log.dateLogged,log&&log.meta&&log.meta.watchDate,log&&log.meta&&log.meta.dateLabel];
  for(const candidate of candidates){
    const raw=String(candidate||'').trim();
    if(!raw)continue;
    let time=NaN;
    if(/^\d{4}-\d{2}$/.test(raw)) time=Date.parse(raw+'-01T12:00:00Z');
    else if(/^\d{4}-\d{2}-\d{2}/.test(raw)) time=Date.parse(raw.slice(0,10)+'T12:00:00Z');
    else time=Date.parse('1 '+raw+' 12:00:00Z');
    if(!Number.isFinite(time))continue;
    const date=new Date(time);
    return {key:date.toISOString().slice(0,7),label:date.toLocaleDateString(undefined,{month:'short',year:'numeric',timeZone:'UTC'})};
  }
  return null;
}

function commandLatestWatch(ship) {
  const candidates=historicalActivityLogsForShip(ship).map(log=>{
    const evidence=commandWatchDateInfo(log);
    if(!evidence.day)return null;
    const raw=String(evidence.raw||'').trim();
    const sourceTime=Date.parse(raw);
    const hasTime=/(?:T|\s)\d{1,2}:\d{2}|\b\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4,6}\b/.test(raw);
    return {log,evidence,raw,hasTime,time:Number.isFinite(sourceTime)?sourceTime:Date.parse(evidence.day+'T12:00:00Z')};
  }).filter(Boolean).sort((a,b)=>b.time-a.time);
  if(!candidates.length)return {available:false,label:'No recorded watch date',detail:'No retained bridge-watch row has an exact calendar day.'};
  const latest=candidates[0];
  const label=latest.hasTime&&latest.raw?latest.raw:commandDateLabel(latest.evidence.day)+' · time not captured';
  return {available:true,label,detail:(latest.log.officer?latest.log.officer+' · ':'')+(latest.log.watchstation||'Watchstation not recorded')+' · '+(latest.hasTime?'recorded source time':'recorded day only'),day:latest.evidence.day,log:latest.log};
}

function commandShipActivityModel(ship) {
  const buckets=new Map();
  let excludedLogs=0;
  historicalActivityLogsForShip(ship).forEach(log=>{
    const month=commandActivityMonth(log);
    if(!month){excludedLogs++;return;}
    if(!buckets.has(month.key)) buckets.set(month.key,{key:month.key,label:month.label,logs:[],hours:0,people:new Set()});
    const row=buckets.get(month.key);
    row.logs.push(log);
    row.hours+=Math.max(0,Number(log&&log.hours)||0);
    const person=String(log&&log.officer||'').trim();
    if(person)row.people.add(keyFor(person));
  });
  const keys=Array.from(buckets.keys()).sort();
  const rows=[];
  if(keys.length){
    const cursor=new Date(keys[0]+'-01T12:00:00Z');
    const final=keys[keys.length-1];
    while(cursor.toISOString().slice(0,7)<=final){
      const key=cursor.toISOString().slice(0,7);
      const bucket=buckets.get(key);
      const label=cursor.toLocaleDateString(undefined,{month:'short',year:'numeric',timeZone:'UTC'});
      const summary=bucket?evolutionSummary(bucket.logs):{total:0,rows:[]};
      rows.push({key,label,hours:bucket?bucket.hours:0,logCount:bucket?bucket.logs.length:0,people:bucket?bucket.people.size:0,evolutions:summary.total||0,evolutionRows:(summary.rows||[]).filter(row=>row.count>0).sort((a,b)=>b.count-a.count||String(a.label).localeCompare(String(b.label))),hasRecordedActivity:!!bucket});
      cursor.setUTCMonth(cursor.getUTCMonth()+1);
    }
  }
  const shipKey=keyFor(ship&&ship.name);
  const requested=commandShipActivitySelections[shipKey];
  const selected=rows.find(row=>row.key===requested)||rows[rows.length-1]||null;
  return {rows,selected,excludedLogs,maxHours:Math.max(1,...rows.map(row=>row.hours)),totalHours:rows.reduce((sum,row)=>sum+row.hours,0),totalEvolutions:rows.reduce((sum,row)=>sum+row.evolutions,0),lastWatch:commandLatestWatch(ship)};
}

function commandShipActivityPanel(ship) {
  const model=commandShipActivityModel(ship);
  if(!model.rows.length) return '<section class="command-panel command-ship-activity"><div class="command-section-heading"><div><span class="section-kicker">Monthly activity history</span><h2>Hours and evolutions by month</h2><p>Each imported bridge-watch row needs a usable calendar month before it can appear here.</p></div></div>'+emptyState('No dated monthly bridge-watch activity is retained for this ship.')+'</section>';
  const selected=model.selected;
  const selection='<label class="command-activity-selector" for="command-activity-month-'+h(keyFor(ship.name))+'">Inspect a past month<select id="command-activity-month-'+h(keyFor(ship.name))+'" data-command-activity-select="'+h(keyFor(ship.name))+'">'+model.rows.map(row=>'<option value="'+h(row.key)+'"'+(selected&&selected.key===row.key?' selected':'')+'>'+h(row.label)+(row.hasRecordedActivity?'':' · no recorded activity')+'</option>').join('')+'</select></label>';
  const lastWatch='<article class="command-last-watch"><span>Last watch conducted</span><strong>'+h(model.lastWatch.label)+'</strong><small>'+h(model.lastWatch.detail)+'</small></article>';
  const chart='<div class="command-activity-chart" role="list" aria-label="Chronological recorded bridge hours and evolution occurrences">'+model.rows.map(row=>{
    const height=Math.max(row.hours?12:3,Math.round(row.hours/model.maxHours*100));
    const active=selected&&selected.key===row.key;
    const description=row.label+': '+fmt(row.hours,1)+' recorded bridge hours; '+row.evolutions+' evolution occurrence'+(row.evolutions===1?'':'s')+(row.hasRecordedActivity?'':' ; no recorded activity');
    return '<button type="button" class="command-activity-bar'+(active?' selected':'')+'" data-command-activity-month="'+h(row.key)+'" data-command-activity-ship="'+h(keyFor(ship.name))+'" aria-pressed="'+(active?'true':'false')+'" title="'+h(description)+'" aria-label="'+h(description)+'"><span class="command-activity-hours" style="height:'+height+'%"><strong>'+h(fmt(row.hours,1))+' h</strong></span><span class="command-activity-evolutions">'+(row.evolutions?'◆ '+h(row.evolutions):'—')+'</span><span class="command-activity-label">'+h(row.label)+'</span></button>';
  }).join('')+'</div>';
  const evolutionList=selected.evolutionRows.length?'<ul class="command-evolution-list">'+selected.evolutionRows.map(row=>'<li><span>'+h(row.label)+'</span><strong>'+h(row.count)+'</strong></li>').join('')+'</ul>':'<p class="command-note">No evolution occurrence is recorded for the selected month. That does not establish that no evolution was conducted.</p>';
  return '<section class="command-panel command-ship-activity"><div class="command-section-heading"><div><span class="section-kicker">Monthly activity history</span><h2>Hours logged and evolutions conducted</h2><p>Bars show retained bridge-watch hours in chronological order. The diamond count shows distinct recorded evolution occurrences for that month.</p></div>'+selection+'</div>'+lastWatch+chart+'<div class="command-activity-detail"><div><span class="section-kicker">Selected month · '+h(selected.label)+'</span><h3>'+h(fmt(selected.hours,1))+' recorded bridge hours</h3><p>'+h(selected.logCount)+' recorded watch row'+(selected.logCount===1?'':'s')+' · '+h(selected.people)+' person'+(selected.people===1?'':'s')+' represented · '+h(selected.evolutions)+' evolution occurrence'+(selected.evolutions===1?'':'s')+'.</p></div><div><h3>Evolutions recorded</h3>'+evolutionList+'</div></div>'+(model.excludedLogs?'<p class="command-note">'+h(model.excludedLogs)+' retained bridge-watch row'+(model.excludedLogs===1?' lacks':'s lack')+' a usable calendar month and '+(model.excludedLogs===1?'is':'are')+' excluded from the chart.</p>':'')+'<p class="command-note">Hours and evolution evidence come from retained bridge-watch records across accepted source imports. A zero, gap, or empty month means no matching retained row; it does not prove no underway activity or no training occurred.</p></section>';
}
function commandPageHeading(kicker,title,description,actions) {
  return '<div class="command-page-heading"><div><span class="section-kicker">'+h(kicker)+'</span><h1 class="view-title">'+h(title)+'</h1><p>'+h(description)+'</p></div><div class="toolbar">'+(actions||'')+'</div></div>';
}
function commandPeriodSummary() {
  const mode={previous:'Previous report','3m':'3 months ago','6m':'6 months ago','12m':'12 months ago',date:'Baseline '+commandDateLabel(commandFilters.from)}[commandFilters.mode];
  return '<div class="command-period-note"><strong>Review period:</strong> '+h(mode)+' through '+h(commandDateLabel(commandFilters.to||new Date().toISOString()))+'. <button class="ship-link" type="button" data-view="dashboard">Change period in Command Review</button></div>';
}
function commandRenderShipList() {
  const host=document.getElementById('view-heatmaps');
  let ships=allShips();
  const phases=Array.from(new Set(ships.map(ship=>ship.phase))).sort();
  const controls='<div class="command-controls"><label for="command-fleet-search">Find a ship<input type="search" id="command-fleet-search" placeholder="Ship name" value="'+h(commandFleetFilters.search)+'" data-command-fleet="search"></label><label for="command-fleet-phase">Current OFRP phase<select id="command-fleet-phase" data-command-fleet="phase"><option value="">All phases</option>'+phases.map(phase=>'<option'+(commandFleetFilters.phase===phase?' selected':'')+'>'+h(phase)+'</option>').join('')+'</select></label></div>';
  ships=ships.filter(ship=>(!commandFleetFilters.phase||ship.phase===commandFleetFilters.phase)&&(!commandFleetFilters.search||ship.name.toLowerCase().includes(commandFleetFilters.search.toLowerCase())));
  const rows=ships.map(ship=>{
    const c=commandCompare(ship,commandFilters), current=commandCurrent(ship);
    const metrics=c.after||commandMetrics(current.snapshot&&current.snapshot.snapshot);
    const levelCount=m=>(m.levels['2']||0)+(m.levels['3']||0);
    return ['<button class="ship-link" type="button" data-open-ship="'+h(keyFor(ship.name))+'">'+h(ship.name)+'</button><small>'+h(ship.phase)+'</small>',h(current.sourceDate?commandDateLabel(current.sourceDate)+' · '+current.ageDays+' days old':'Undated / unknown'),c.available?h(commandDateLabel(c.baseline.date)+' → '+commandDateLabel(c.end.date)):'<small>'+h(c.reason)+'</small>',c.available?h(c.observed.counts.lost+' / '+c.observed.counts.restored):'—',c.available?h(c.observed.counts.levelUp+' / '+c.observed.counts.levelDown):'—',c.available?h(levelCount(c.before)+' → '+levelCount(c.after)):h(levelCount(metrics)),h((current.counts.current??'—')+' / '+(current.counts.need??'—')+' / '+(current.counts.loss??'—')+' / '+(current.counts.unknown??'—')),c.available?h(c.counts.joined+' / '+c.counts.departed):'—','<button class="mini-btn" type="button" data-command-ship="'+h(keyFor(ship.name))+'">Review change</button>'];
  });
  host.innerHTML=commandPageHeading('Across the fleet','Which ships progressed, and which lost ground?','Compare observed losses, recoveries, and level changes. Read each ship’s actual source dates before comparing results.')+commandPeriodSummary()+controls+'<section class="command-panel" style="margin-top:18px">'+(ships.length?commandTable(['Ship / current phase','Latest source','Actual comparison','Losses / recoveries','Level up / down','L2+ before → after','Today: current / need / lost / unknown','Roster added / absent','Review'],rows):emptyState('No ships match. Import WAKE ship exports or adjust the filter.'))+'<p class="command-note">Today’s currency is aged from source evidence assuming no later watch. Counts have different roster sizes and source dates; this is not a readiness ranking. Level changes reflect recorded evidence and may include corrections.</p></section>';
}
function commandRenderShipDetail() {
  const host=document.getElementById('view-ships'), ships=allShips();
  if(!ships.length){host.innerHTML=commandPageHeading('Individual ship','How has this ship progressed?','Import a WAKE export to establish its first observation.')+emptyState('No ship evidence available.');return;}
  if(!selectedShipKey||!state.ships[selectedShipKey])selectedShipKey=keyFor(ships[0].name);
  const ship=state.ships[selectedShipKey], c=commandCompare(ship,commandFilters), current=commandCurrent(ship);
  const selector='<label class="command-inline-label" for="ship-select">Ship<select id="ship-select">'+ships.map(item=>'<option value="'+h(keyFor(item.name))+'"'+(item===ship?' selected':'')+'>'+h(item.name)+'</option>').join('')+'</select></label>';
  const entry={ship,comparison:c,current};
  const emptyCounts=Object.fromEntries(Object.keys(COMMAND_CHANGE_LABELS).map(key=>[key,0]));
  const from=c.requestedFrom||commandSubtractMonths(new Date().toISOString().slice(0,10),5), to=commandFilters.to||new Date().toISOString().slice(0,10);
  const model={entries:[entry],comparable:c.available?[entry]:[],counts:c.available?c.observed.counts:emptyCounts,monthly:[{ship,data:commandMonthly(ship,from,to)}],from,to,now:new Date().toISOString()};
  const lastThirty=commandLastThirtyModel([ship]);
  host.innerHTML=commandPageHeading('Ship evidence review',ship.name,'See the direct last-30-day answer, recorded watch activity over time, and the evidence behind both.',selector)+commandLastThirtyPanel(lastThirty)+commandShipActivityPanel(ship)+commandCurrentPanel(model)+'<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Other historical comparison</span><h2>Explore a different comparison period</h2><p>Use this only for questions outside the direct last-30-day answer. It may span more than 30 days.</p></div></div>'+commandPeriodSummary()+commandSummaryCards(model)+commandComparisonTable(model)+commandMonthlyPanel(model)+'</section>'+'<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">People behind the change</span><h2>Recorded transitions</h2><p>Roster differences remain separate from proficiency and currency movement.</p></div></div>'+commandEvidenceTable(model,'all')+'</section>'+commandSourcesPanel(model)+'<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">WAKE evidence</span><h2>Inspect the source records</h2><p>Open the current imported roster, bridge watch evidence, or ROR evidence.</p></div></div><div class="command-link-grid">'+quickBtn(selectedShipKey,'roster','Current imported roster')+quickBtn(selectedShipKey,'logs','Bridge watch evidence')+quickBtn(selectedShipKey,'ror','ROR evidence')+'</div></section>';
}
function commandRenderOfrp() {
  const host=document.getElementById('view-ofrp');
  const ships=allShips(), groups=new Map(), unavailable=[];
  ships.forEach(ship=>{
    const c=commandCompare(ship,commandFilters);
    if(!c.available){unavailable.push([h(ship.name),h(ship.phase),h(c.reason)]);return;}
    const phase=c.baseline.snapshot.phase||'Unspecified';
    if(!groups.has(phase))groups.set(phase,{phase,ships:[],before:0,after:0,beforeRoster:0,afterRoster:0,lost:0,restored:0,levelUp:0});
    const g=groups.get(phase);g.ships.push({ship,c});g.before+=c.before.current;g.after+=c.after.current;g.beforeRoster+=c.before.officerCount;g.afterRoster+=c.after.officerCount;g.lost+=c.observed.counts.lost;g.restored+=c.observed.counts.restored;g.levelUp+=c.observed.counts.levelUp;
  });
  const rows=Array.from(groups.values()).map(g=>[h(g.phase),h(g.ships.length),h(g.before+' / '+g.beforeRoster),h(g.after+' / '+g.afterRoster),h(g.lost),h(g.restored),h(g.levelUp),'<small>'+g.ships.map(({ship,c})=>h(ship.name+': '+commandDateLabel(c.baseline.date)+' → '+commandDateLabel(c.end.date))).join('<br>')+'</small>']);
  const moves=[];groups.forEach(g=>g.ships.forEach(({ship,c})=>{if(c.baseline.snapshot.phase!==c.end.snapshot.phase)moves.push([h(ship.name),h(c.baseline.snapshot.phase),h(c.end.snapshot.phase),h(commandDateLabel(c.baseline.date)+' → '+commandDateLabel(c.end.date)),'<button class="mini-btn" type="button" data-command-ship="'+h(keyFor(ship.name))+'">Ship review</button>']);}));
  host.innerHTML=commandPageHeading('OFRP progression','Did proficiency improve through the phase?','Compare the same ships across observations. Groups are anchored to baseline phase so phase changes do not silently change the cohort.')+commandPeriodSummary()+'<section class="command-panel"><div class="command-section-heading"><div><h2>Ships grouped by baseline phase</h2><p>Currency counts use the roster at each endpoint; roster movement is visible in individual ship reviews.</p></div></div>'+(rows.length?commandTable(['Baseline phase','Matched ships','Current / roster: before','Current / roster: after','Losses observed','Recoveries observed','Level increases','Ship source intervals'],rows):emptyState('No comparable dated ship exports for this period.'))+'</section><section class="command-panel"><h2>Which ships changed phase?</h2>'+(moves.length?commandTable(['Ship','Baseline phase','End phase','Source interval','Review'],moves):emptyState('No phase change observed in the comparable ships.'))+'</section><section class="command-panel"><h2>Where is comparison evidence missing?</h2>'+(unavailable.length?commandTable(['Ship','Current phase','Evidence gap'],unavailable):'<p>Every imported ship has a dated comparison for this period.</p>')+'</section><p class="command-note">These are recorded changes, not proof that OFRP phase caused a result. Different ships may have different reporting intervals.</p>';
}
function attachCommandFleetEvents() {
  document.addEventListener('change',event=>{
    const field=event.target.dataset&&event.target.dataset.commandFleet;if(!field)return;
    const host=document.getElementById('view-heatmaps'), focus=captureRerenderFocus(host);
    commandFleetFilters[field]=event.target.value;commandRenderShipList();restoreRerenderFocus(host,focus);
  });
  document.addEventListener('change',event=>{
    const shipKey=event.target.dataset&&event.target.dataset.commandActivitySelect;if(!shipKey)return;
    const host=document.getElementById('view-ships'), focus=captureRerenderFocus(host);
    commandShipActivitySelections[shipKey]=event.target.value;commandRenderShipDetail();restoreRerenderFocus(host,focus);
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest&&event.target.closest('[data-command-activity-month][data-command-activity-ship]');if(!button)return;
    event.preventDefault();
    const host=document.getElementById('view-ships'), focus=captureRerenderFocus(host);
    commandShipActivitySelections[button.dataset.commandActivityShip]=button.dataset.commandActivityMonth;commandRenderShipDetail();restoreRerenderFocus(host,focus);
  });
}
