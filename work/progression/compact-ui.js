// Calendar comparisons and charts inside the familiar Fleet WAKE screens.
let fleetCalendarSelection={month:'',baselineMonth:''};
let fleetChartMetric='hours';

function fleetCalendarOptions() {
  const month=fleetCalendarSelection.month||new Date().toISOString().slice(0,7);
  return {month,baselineMonth:fleetCalendarSelection.baselineMonth||commandCalendarPreviousMonth(month)};
}
function fleetMonthChoices() {
  const keys=new Set([new Date().toISOString().slice(0,7)]);
  allShips().forEach(ship=>{
    commandCalendarMonths(ship).forEach(month=>keys.add(month));
    commandShipActivityModel(ship).rows.forEach(row=>keys.add(row.key));
  });
  const options=fleetCalendarOptions();keys.add(options.month);keys.add(options.baselineMonth);
  const first=Array.from(keys).sort()[0], last=new Date().toISOString().slice(0,7);
  if(first){const cursor=new Date(first+'-01T12:00:00Z');while(cursor.toISOString().slice(0,7)<=last){keys.add(cursor.toISOString().slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1);}}
  return Array.from(keys).sort().reverse();
}
function fleetCalendarControls(mode) {
  const options=fleetCalendarOptions(), months=fleetMonthChoices();
  return '<div class="fleet-month-controls">'+[['month','Month'],['baselineMonth','Compare with']].filter(([field])=>mode!=='baseline'||field==='baselineMonth').map(([field,label])=>'<label>'+label+'<select data-fleet-calendar="'+field+'">'+months.filter(month=>field!=="baselineMonth"||month<options.month).map(month=>'<option value="'+h(month)+'"'+(options[field]===month?' selected':'')+'>'+h(commandCalendarMonthLabel(month))+'</option>').join('')+'</select></label>').join('')+'</div>';
}
function fleetCalendarPanel(ships,controls) {
  const options=fleetCalendarOptions();
  const entries=ships.map(ship=>({ship,c:commandCalendarCompare(ship,options)}));
  const comparable=entries.filter(entry=>entry.c.available);
  const counts={lost:0,restored:0,levelUp:0,levelDown:0};
  comparable.forEach(({c})=>Object.keys(counts).forEach(key=>counts[key]+=c.counts[key]||0));
  const stats=[['New currency losses','lost','bad'],['Restored','restored','good'],['Level up','levelUp','good'],['Level down','levelDown','warn']];
  const table=entries.map(({ship,c})=>[
    '<button class="ship-link" type="button" data-open-ship="'+h(keyFor(ship.name))+'">'+h(ship.name)+'</button>',
    c.available?h(c.before.current+' → '+c.after.current):'—',
    c.available?h(c.counts.lost):'—',c.available?h(c.counts.restored):'—',
    c.available?h(c.counts.levelUp+' / '+c.counts.levelDown):'—',
    c.available?h(c.counts.joined+' / '+c.counts.departed):'—',
    c.available?h(commandDateLabel(c.baseline.date)+' → '+commandDateLabel(c.end.date)):'<small>'+h(c.reason)+'</small>'
  ]);
  const people=comparable.flatMap(({ship,c})=>Object.values(c.rows||{}).flat().map(row=>({ship,row})));
  return '<section class="card fleet-calendar-panel"><div class="section-title"><h3>'+h(commandCalendarMonthLabel(options.month))+' vs '+h(commandCalendarMonthLabel(options.baselineMonth))+'</h3>'+(controls===false?'':fleetCalendarControls(controls))+'</div><div class="fleet-month-stats">'+stats.map(([label,key,tone])=>'<article class="fleet-month-stat '+tone+'"><span>'+h(label)+'</span><strong>'+h(comparable.length?counts[key]:'—')+'</strong></article>').join('')+'</div><p class="fleet-chart-note">'+comparable.length+' of '+ships.length+' ships have both months. Latest dated status in each month; changes are between those statuses.</p><details class="fleet-month-evidence"><summary>View changes &amp; source dates</summary>'+commandTable(['Ship','Current before → after','Lost','Restored','Levels up / down','Roster added / absent','Source dates'],table)+(people.length?commandTable(['Ship','Watchstander','Change'],people.map(({ship,row})=>[h(ship.name),h(row.name||row.officer||''),h(COMMAND_CHANGE_LABELS[row.type]||row.type||row.change||'')])):'')+'</details></section>';
}
function fleetOverviewChart() {
  const options=fleetCalendarOptions();
  const metricValue=m=>!m?null:fleetChartMetric==='loss'?m.loss:m.officerCount?(fleetChartMetric==='current'?m.current:(m.levels['2']||0)+(m.levels['3']||0))/m.officerCount*100:null;
  const rows=allShips().map(ship=>{
    const c=commandCalendarCompare(ship,options), activity=commandShipActivityModel(ship).rows;
    const a=activity.find(row=>row.key===options.month),b=activity.find(row=>row.key===options.baselineMonth);
    const after=fleetChartMetric==='hours'?(a&&a.hasRecordedActivity?a.hours:null):metricValue(c.after);
    const before=fleetChartMetric==='hours'?(b&&b.hasRecordedActivity?b.hours:null):metricValue(c.before);
    const detail=fleetChartMetric==='hours'?(a?a.evolutions+' evolutions':'No recorded activity'):c.after?c.after.officerCount+' watchstanders':'No month status';
    return {ship,after,before,detail};
  });
  const max=['hours','loss'].includes(fleetChartMetric)?Math.max(1,...rows.flatMap(row=>[row.after||0,row.before||0])):100;
  const valueLabel=value=>value==null?'—':fmt(value,1)+(fleetChartMetric==='hours'?' h':fleetChartMetric==='loss'?'':'%');
  return '<section class="card fleet-overview-chart"><div class="section-title"><h3>Fleet by ship</h3><label class="fleet-chart-choice">Show<select data-fleet-chart-metric>'+[['hours','Hours logged'],['current','Current at report %'],['levels','Level 2+ %'],['loss','Lost at report']].map(([value,label])=>'<option value="'+value+'"'+(fleetChartMetric===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label></div><div class="fleet-chart-legend"><span class="before">'+h(commandCalendarMonthLabel(options.baselineMonth))+'</span><span class="after">'+h(commandCalendarMonthLabel(options.month))+'</span></div><div class="fleet-ship-chart">'+rows.map(({ship,after,before,detail})=>'<button type="button" class="fleet-ship-bar" data-fleet-chart-ship="'+h(keyFor(ship.name))+'"><span class="fleet-ship-bar-label">'+h(ship.name)+'</span><span class="fleet-ship-tracks"><span class="fleet-ship-track before" title="'+h(valueLabel(before))+'"><span style="width:'+Math.max(0,(before||0)/max*100)+'%"></span></span><span class="fleet-ship-track after" title="'+h(valueLabel(after))+'"><span style="width:'+Math.max(0,(after||0)/max*100)+'%"></span></span></span><span class="fleet-ship-value">'+h(valueLabel(before))+' → '+h(valueLabel(after))+'<small>'+h(detail)+'</small></span></button>').join('')+'</div><p class="fleet-chart-note">Select a ship to open its monthly chart. — means no evidence for that month.</p></section>';
}
function compactRenderDashboard() {
  const host=document.getElementById('view-dashboard');
  const rows=categorizedShipMetrics(allShipMetrics()), aggregate=fleetAggregateMetrics(rows);
  host.innerHTML=topbar('Fleet Overview','', '')+homeCommandRibbon()+(rows.length?fleetCalendarPanel(allShips())+fleetOverviewChart()+'<div class="fleet-overview-stack"><section class="analytics-panel"><h3>Latest fleet levels</h3><p class="fleet-chart-note">Supporting currency below is aged to today, assuming no later watch.</p>'+levelDistributionPanel(rows)+'</section>'+fleetOverviewFigures(rows,aggregate)+assessmentOutcomePanel(aggregate,rows)+'</div>':emptyState('Import WAKE ship data to begin.'));
}
function compactRenderShips() {
  const host=document.getElementById('view-ships'),ships=allShips();
  if(!ships.length){host.innerHTML=topbar('Ship View','')+emptyState('No ships imported.');return;}
  if(!selectedShipKey||!state.ships[selectedShipKey])selectedShipKey=keyFor(ships[0].name);
  const ship=state.ships[selectedShipKey],m=shipMetrics(ship);
  if(!commandShipActivitySelections[selectedShipKey])commandShipActivitySelections[selectedShipKey]=fleetCalendarOptions().month;
  const controls='<select id="ship-select" aria-label="Ship">'+ships.map(item=>'<option value="'+h(keyFor(item.name))+'"'+(item===ship?' selected':'')+'>'+h(item.name)+'</option>').join('')+'</select>';
  host.innerHTML=topbar('Ship View','',controls)+shipProfileHero(m)+fleetCalendarPanel([ship],'baseline')+commandShipActivityPanel(ship)+shipProfileSummary(m)+'<div class="card"><div class="section-title"><h3>Watchstation Activity</h3><span>Select a bar for logs</span></div>'+barsHtml(m.byWatchstation,{shipKey:keyFor(ship.name),type:'watchstation'})+'</div>';
}
function attachCompactFleetEvents() {
  document.addEventListener('change',event=>{
    const field=event.target.dataset&&event.target.dataset.fleetCalendar;
    if(field){
      fleetCalendarSelection[field]=event.target.value;
      if(field==='month')fleetCalendarSelection.baselineMonth=commandCalendarPreviousMonth(event.target.value);
      if(currentView==='ships')commandShipActivitySelections[selectedShipKey]=fleetCalendarOptions().month;
      render();switchView(currentView);return;
    }
    if(event.target.hasAttribute&&event.target.hasAttribute('data-fleet-chart-metric')){fleetChartMetric=event.target.value;renderDashboard();}
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest&&event.target.closest('[data-fleet-chart-ship]');if(!button)return;
    selectedShipKey=button.dataset.fleetChartShip;
    commandShipActivitySelections[selectedShipKey]=fleetCalendarOptions().month;
    renderShips();switchView('ships');
  });
}
