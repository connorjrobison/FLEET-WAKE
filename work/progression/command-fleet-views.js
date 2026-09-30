let commandFleetFilters={phase:"",search:""};
const commandShipActivitySelections={};

function commandActivityMonth(log) {
  const day=commandWatchDateInfo(log).day;
  if(day){const key=day.slice(0,7);return {key,label:new Date(key+"-01T12:00:00Z").toLocaleDateString(undefined,{month:"short",year:"numeric",timeZone:"UTC"})};}
  const candidates=[log&&log.month,log&&log.watchDate,log&&log.dateLogged,log&&log.meta&&log.meta.watchDate,log&&log.meta&&log.meta.dateLabel];
  for(const candidate of candidates){
    const raw=String(candidate||'').trim();
    if(!raw)continue;
    let time=NaN;
    if(/^\d{4}-\d{2}$/.test(raw)) time=Date.parse(raw+'-01T12:00:00Z');
    else if(/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      if(commandTimestamp(raw.slice(0,10))==null)continue;
      time=Date.parse(raw.slice(0,10)+'T12:00:00Z');
    }
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
    return {log,evidence,raw,hasTime,time:hasTime&&Number.isFinite(sourceTime)?sourceTime:Date.parse(evidence.day+'T00:00:00Z')};
  }).filter(item=>item&&item.time<=Date.now()).sort((a,b)=>b.time-a.time);
  if(!candidates.length)return {available:false,label:'No recorded watch date',detail:'No retained bridge-watch row has an exact calendar day.'};
  const latest=candidates[0];
  const label=latest.hasTime&&latest.raw?latest.raw:commandDateLabel(latest.evidence.day)+' · time not captured';
  return {available:true,label,detail:(latest.log.officer?latest.log.officer+' · ':'')+(latest.log.watchstation||'Watchstation not recorded')+' · '+(latest.hasTime?'recorded source time':'recorded day only'),day:latest.evidence.day,log:latest.log};
}

function commandRecordedActivityLogs(ship) {
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7);
  return historicalActivityLogsForShip(ship).filter(log=>{
    const evidence=commandWatchDateInfo(log),period=commandActivityMonth(log);
    if(evidence.day&&evidence.day>day)return false;
    if(!evidence.day&&period&&period.key>month)return false;
    const timed=/(?:T|\s)\d{1,2}:\d{2}/.test(evidence.raw||'');
    const timestamp=timed?Date.parse(evidence.raw):NaN;
    return !Number.isFinite(timestamp)||timestamp<=now;
  });
}

function commandShipActivityModel(ship) {
  const buckets=new Map();
  const activity=commandRecordedActivityLogs(ship);
  let excludedLogs=historicalActivityLogsForShip(ship).length-activity.length;
  activity.forEach(log=>{
    const month=commandActivityMonth(log);
    if(!month){excludedLogs++;return;}
    if(!buckets.has(month.key)) buckets.set(month.key,{key:month.key,label:month.label,logs:[],hours:0,people:new Set()});
    const row=buckets.get(month.key);
    row.logs.push(log);
    row.hours+=Math.max(0,Number(log&&log.hours)||0);
    const person=String(log&&log.officer||'').trim();
    if(person)row.people.add(keyFor(person));
  });
  const requestedMonth=commandShipActivitySelections[keyFor(ship&&ship.name)];
  const keys=Array.from(new Set([...buckets.keys(),...(/^\d{4}-\d{2}$/.test(requestedMonth||'')?[requestedMonth]:[])])).sort();
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
  const lastWatchLabel=model.lastWatch.available&&model.lastWatch.log&&/(?:T|\s)\d{1,2}:\d{2}/.test(model.lastWatch.label)?new Date(model.lastWatch.label).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC',timeZoneName:'short'}):model.lastWatch.label;
  const lastWatch='<article class="command-last-watch"><span>Last watch conducted</span><strong title="'+h(model.lastWatch.label)+'">'+h(lastWatchLabel)+'</strong><small>'+h(model.lastWatch.detail)+'</small></article>';
  const month=commandShipActivitySelections[keyFor(ship.name)]||fleetCalendarOptions().month;
  return '<div class="daily-ship-activity">'+lastWatch+dailyActivityChart([ship],{month,scope:'ship'})+'<details class="card daily-month-records"><summary>Month records</summary>'+commandActivityDrilldownPanel(ship,month)+'</details></div>';
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
  compactRenderShips();
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
    commandShipActivitySelections[shipKey]=event.target.value;fleetCalendarSelection={month:event.target.value,baselineMonth:commandCalendarPreviousMonth(event.target.value)};commandRenderShipDetail();restoreRerenderFocus(host,focus);
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest&&event.target.closest('[data-command-activity-month][data-command-activity-ship]');if(!button)return;
    event.preventDefault();
    const host=document.getElementById('view-ships'), focus=captureRerenderFocus(host);
    commandShipActivitySelections[button.dataset.commandActivityShip]=button.dataset.commandActivityMonth;fleetCalendarSelection={month:button.dataset.commandActivityMonth,baselineMonth:commandCalendarPreviousMonth(button.dataset.commandActivityMonth)};commandRenderShipDetail();restoreRerenderFocus(host,focus);
  });
}
