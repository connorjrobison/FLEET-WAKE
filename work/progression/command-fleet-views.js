let commandFleetFilters={phase:"",search:""};
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
  host.innerHTML=commandPageHeading('Ship evidence review',ship.name,'Trace recorded progression, review today’s currency, and inspect the underlying WAKE evidence.',selector)+commandPeriodSummary()+commandShipCallout(ship)+commandSummaryCards(model)+commandComparisonTable(model)+commandMonthlyPanel(model)+commandCurrentPanel(model)+'<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">People behind the change</span><h2>Recorded transitions</h2><p>Roster differences remain separate from proficiency and currency movement.</p></div></div>'+commandEvidenceTable(model,'all')+'</section>'+commandSourcesPanel(model)+'<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">WAKE fundamentals</span><h2>Inspect the source evidence</h2><p>Current imported roster, bridge watches, ROR, and evolution evidence remain available.</p></div></div><div class="command-link-grid">'+quickBtn(selectedShipKey,'roster','Current imported roster')+quickBtn(selectedShipKey,'logs','Bridge watch evidence')+quickBtn(selectedShipKey,'ror','ROR evidence')+quickBtn(selectedShipKey,'months','Recorded bridge hours')+'</div></section>'+shipEvolutionPanel(ship);
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
}
