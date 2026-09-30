// Daily activity charts share the retained-record model with their drilldowns.
const dailyActivityChartModels = new Map();
const DAILY_ACTIVITY_COLORS = ['#1579aa','#a955ca','#d47816','#269778','#d55471','#626ccc','#56802c','#b76135','#267f89','#b24588'];

function dailyActivityChart(ships, options) {
  const opts = options || {}, scope = opts.scope || 'fleet';
  const model = dailyActivityModel(ships, opts.month);
  const context = scope+'|'+ships.map(ship => keyFor(ship.name)).join('|');
  for (const key of dailyActivityChartModels.keys()) if (key.startsWith(scope+'|') && key!==context) dailyActivityChartModels.delete(key);
  dailyActivityChartModels.set(context, model);
  const headings = {fleet:'Fleet daily activity',ship:'Ship daily activity',list:'Ship comparison'};
  const choices = model.availableMonths.slice().reverse();
  if (!choices.includes(model.monthKey)) choices.unshift(model.monthKey);
  const selector = '<label class="daily-month-select">Month<select data-daily-month="'+h(scope)+'">'+choices.map(month => '<option value="'+h(month)+'"'+(month === model.monthKey ? ' selected' : '')+'>'+h(commandCalendarMonthLabel(month))+'</option>').join('')+'</select></label>';
  const stats = '<div class="daily-activity-stats"><span><strong>'+h(fmt(model.totalHours,1))+'</strong> dated hours</span><span><strong>'+h(model.totalEvolutions)+'</strong> dated evolutions</span>'+(scope==='fleet'?'':'<span><strong>'+h(model.logCount)+'</strong> dated logs</span>')+'</div>';
  const dated = model.days.some(day => day.hasRecords);
  const empty = '<div class="daily-chart-empty">No dated watch logs for '+h(model.label)+'.</div>';
  const monthOnly = model.monthOnlyLogs.length ? '<button type="button" class="mini-btn" data-daily-month-only="true">Month-only logs: '+h(model.monthOnlyLogs.length)+' · '+h(fmt(model.monthOnlyHours,1))+' h</button>' : '';
  const monthOnlyEvolutions = model.monthOnlyEvolutionRows.length ? '<div class="daily-month-only-evolutions"><small>Day not recorded</small>'+model.monthOnlyEvolutionRows.map(row => '<button type="button" class="mini-btn" data-daily-month-only="'+h(row.key)+'">'+h(row.label)+' · '+h(row.count)+'</button>').join('')+'</div>' : '';
  const series = scope === 'list' ? model.perShip : [{key:scope === 'ship' && model.perShip.length ? model.perShip[0].key : '',name:scope === 'ship' && model.perShip.length ? model.perShip[0].name : 'Fleet',days:model.days,totalHours:model.totalHours}];
  const legend = (scope === 'list' || scope === 'fleet') && model.perShip.length ? '<div class="daily-ship-legend'+(scope==='fleet'?' fleet-ship-chips':'')+'" aria-label="Ships">'+model.perShip.map((ship,index) => '<button type="button" data-daily-ship="'+h(ship.key)+'" style="--daily-series:'+DAILY_ACTIVITY_COLORS[(scope==='fleet'?0:index) % DAILY_ACTIVITY_COLORS.length]+'">'+(scope==='list'?'<i aria-hidden="true"></i>':'')+h(ship.name)+'<small>'+h(ship.hasRecords===false?'No dated logs':fmt(ship.totalHours,1)+' h')+'</small></button>').join('')+'</div>' : '';
  const drilldownHint=scope==='fleet'?'Select a day, ship or evolution for fleet details.':'Select a day or evolution for logs.';
  return '<section class="card daily-activity-panel" data-daily-context="'+h(context)+'" data-daily-month-value="'+h(model.monthKey)+'" data-daily-scope="'+h(scope)+'"><div class="section-title"><h3>'+h(headings[scope] || headings.fleet)+'</h3>'+selector+'</div>'+stats+(dated ? dailyActivityHoursSvg(model,series,scope) : empty)+legend+(dated ? dailyActivityEvolutionDiagram(model,scope) : '')+monthOnlyEvolutions+'<div class="daily-chart-footer"><small>Recorded hours; days without dated logs plot at 0. '+drilldownHint+' Month-only logs stay separate.</small>'+monthOnly+'</div></section>';
}

function dailyActivityHoursSvg(model, series, scope) {
  const width=1120,height=365,left=60,right=28,top=24,bottom=58,plotW=width-left-right,plotH=height-top-bottom;
  const max=Math.max(1,...series.flatMap(ship => ship.days.map(day => Number(day.hours) || 0)));
  const ceiling=Math.ceil(max/5)*5 || 5;
  const x=day => left+(day-1)*plotW/Math.max(1,model.days.length-1), y=value => top+plotH-(Number(value)||0)/ceiling*plotH;
  const grid=Array.from({length:5},(_,i) => {
    const value=ceiling*i/4,py=y(value);
    return '<line class="daily-grid-line" x1="'+left+'" y1="'+py+'" x2="'+(width-right)+'" y2="'+py+'"/><text class="daily-axis-label" x="'+(left-10)+'" y="'+(py+4)+'" text-anchor="end">'+h(fmt(value,Number.isInteger(value)?0:2))+'</text>';
  }).join('');
  const paths=series.map((ship,index) => {
    if (!ship.days.some(day => day.hasRecords)) return '';
    const color=DAILY_ACTIVITY_COLORS[index % DAILY_ACTIVITY_COLORS.length];
    let path='',drawing=false;
    ship.days.forEach(day => {
      if (!day.available || day.hours == null) { drawing=false;return; }
      path+=(drawing?' L ':' M ')+x(day.day)+','+y(day.hours);drawing=true;
    });
    const line='<path class="daily-hours-line" d="'+path+'" stroke="'+color+'"'+(scope === 'list' ? ' data-daily-ship="'+h(ship.key)+'"' : '')+'><title>'+h(ship.name)+' · '+h(fmt(ship.totalHours,1))+' recorded hours</title></path>';
    const points=ship.days.filter(day => day.available && (day.hasRecords || scope !== 'list')).map(day => {
      const evolutions=day.evolutionRows || [];
      const title=commandDateLabel(day.key)+' · '+(scope === 'list' ? ship.name+' · ' : '')+fmt(day.hours,1)+' h · '+(day.evolutions||0)+' evolutions'+(evolutions.length ? '\n'+evolutions.map(row => row.label+': '+row.count).join('\n') : '')+(day.hasRecords ? '' : '\nNo retained dated log');
      const pointColor=evolutions.length?'var(--daily-evolution)':color;
      return '<g class="daily-day-point" role="button" tabindex="0" data-daily-day="'+h(day.key)+'"'+(scope === 'list' ? ' data-daily-filter-ship="'+h(ship.key)+'"' : '')+' aria-label="'+h(title.replace(/\n/g,'; '))+'"><title>'+h(title)+'</title><circle class="daily-point-hit" cx="'+x(day.day)+'" cy="'+y(day.hours)+'" r="13"/><circle class="daily-point-dot" cx="'+x(day.day)+'" cy="'+y(day.hours)+'" r="'+(evolutions.length?5.5:3.8)+'" fill="'+pointColor+'"/>'+(evolutions.length?'<circle class="daily-point-ring" cx="'+x(day.day)+'" cy="'+y(day.hours)+'" r="9"/>':'')+'</g>';
    }).join('');
    return line+points;
  }).join('');
  const labels=model.days.map(day => '<text class="daily-axis-label'+(!day.available?' future':'')+'" x="'+x(day.day)+'" y="'+(height-bottom+23)+'" text-anchor="middle">'+day.day+'</text>').join('');
  const evolutionDays=model.days.filter(day => day.available && day.evolutions>0).map(day => '<g role="button" tabindex="0" class="daily-evolution-day" data-daily-day="'+h(day.key)+'" aria-label="'+h(commandDateLabel(day.key)+': '+day.evolutions+' evolutions')+'"><title>'+h(day.evolutionRows.map(row => row.label+': '+row.count).join('\n'))+'</title><circle cx="'+x(day.day)+'" cy="'+(height-15)+'" r="9"/><text x="'+x(day.day)+'" y="'+(height-12)+'" text-anchor="middle">'+h(day.evolutions)+'</text></g>').join('');
  return '<div class="daily-chart-key"><span>Hours per day</span><span class="daily-evolution-key">● Evolutions</span></div><div class="daily-hours-scroll"><svg class="daily-hours-chart" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="'+h(model.label+' daily recorded hours line graph')+'"><text class="daily-axis-title" x="8" y="15">Hours</text>'+grid+paths+labels+evolutionDays+'</svg></div>';
}

function dailyActivityEvolutionDiagram(model, scope) {
  if (!model.lanes.length) return '<div class="daily-evolution-empty">No dated evolutions recorded this month.</div>';
  const columns='minmax(180px, 230px) repeat('+model.days.length+', minmax(26px, 1fr)) 48px';
  const header='<div class="daily-evolution-header" style="grid-template-columns:'+columns+'"><span>Evolution</span>'+model.days.map(day => '<button type="button" data-daily-day="'+h(day.key)+'"'+(!day.available?' disabled':'')+' aria-label="'+h('Logs for '+commandDateLabel(day.key))+'">'+day.day+'</button>').join('')+'<span>Total</span></div>';
  const rows=model.lanes.map(lane => '<div class="daily-evolution-lane" style="grid-template-columns:'+columns+'"><button class="daily-evolution-label" type="button" data-daily-evolution="'+h(lane.key)+'" title="'+h(lane.label)+'">'+h(lane.label)+'</button>'+model.days.map(day => {
    const cell=lane.days.find(item => item.key===day.key),count=cell?cell.count:0;
    return '<span class="daily-evolution-cell'+(!day.available?' future':'')+'">'+(count?'<button type="button" data-daily-evolution="'+h(lane.key)+'" data-daily-day="'+h(day.key)+'" aria-label="'+h(lane.label+' · '+commandDateLabel(day.key)+' · '+count+' sessions')+'" title="'+h(lane.label+' · '+commandDateLabel(day.key)+' · '+count+' sessions')+'" style="--daily-dot:'+Math.min(24,13+count*2)+'px">'+h(count)+'</button>':'<span aria-hidden="true">·</span>')+'</span>';
  }).join('')+'<button type="button" class="daily-evolution-total" data-daily-evolution="'+h(lane.key)+'" aria-label="'+h(lane.label+' · all '+lane.count+' sessions')+'">'+h(lane.count)+'</button></div>').join('');
  return '<div class="daily-evolution-title"><h4>Evolutions by day</h4><small>'+(scope==='fleet'?'Select an evolution for ship totals.':'Select a name for all its logs.')+'</small></div><div class="daily-evolution-scroll" role="region" aria-label="Daily evolution diagram" tabindex="0">'+header+rows+'</div>';
}

function dailyActivityFleetSummaryRows(model, records, selectedEvolution) {
  const recordKey=record => record.shipKey+'|'+record.index;
  const unique=new Map();
  records.forEach(record => unique.set(recordKey(record),record));
  const recordedDays=new Map();
  model.days.forEach(day => day.logs.forEach(record => recordedDays.set(recordKey(record),day.key)));
  const groups=new Map();
  unique.forEach(record => {
    const day=recordedDays.get(recordKey(record)) || '';
    const key=record.shipKey+'|'+day;
    if (!groups.has(key)) groups.set(key,{shipKey:record.shipKey,shipName:record.ship.name,day,hours:0,records:new Set()});
    const row=groups.get(key);
    row.hours+=Math.max(0,Number(record.log.hours)||0);
    row.records.add(recordKey(record));
  });
  return Array.from(groups.values(),group => {
    const evolutionRows=group.day?model.evolutionRows:model.monthOnlyEvolutionRows;
    const evolutions=evolutionRows.filter(row => !selectedEvolution || row.key===selectedEvolution).map(row => {
      // Reuse the model's session identity; multiple watchstanders do not add sessions.
      const count=row.sessions.filter(session => session.records.some(record => group.records.has(recordKey(record)))).length;
      return {key:row.key,label:row.label,count};
    }).filter(row => row.count>0);
    return {shipKey:group.shipKey,shipName:group.shipName,day:group.day,hours:group.hours,evolutions};
  }).sort((a,b) => a.shipName.localeCompare(b.shipName) || (a.day || '9999').localeCompare(b.day || '9999'));
}

function dailyActivityOpenFleetRecords(model, records, title, selectedEvolution) {
  const summaries=dailyActivityFleetSummaryRows(model,records,selectedEvolution);
  const hours=summaries.reduce((sum,row) => sum+row.hours,0);
  const evolutions=summaries.reduce((sum,row) => sum+row.evolutions.reduce((total,item) => total+item.count,0),0);
  const rows=summaries.map(row => [
    h(row.shipName),h(row.day?commandDateLabel(row.day):'Day not recorded'),h(fmt(row.hours,1)),
    row.evolutions.length?row.evolutions.map(item => h(item.label)+' <strong>'+h(item.count)+'</strong>').join('<br>'):'No recorded evolutions'
  ]);
  const body='<div class="daily-fleet-summary">'+(rows.length?commandTable(['Ship','Date','Recorded hours','Evolutions'],rows):emptyState('No recorded activity for this selection.'))+
    '<small>Each selected record contributes hours once. Evolution counts are sessions; hours are not allocated to evolutions.</small></div>';
  showModal(title,fmt(hours,1)+' recorded hours · '+evolutions+' evolution sessions',body);
}

function dailyActivityOpenRecords(panel, selection) {
  const model=dailyActivityChartModels.get(panel.dataset.dailyContext);
  if (!model || model.monthKey!==panel.dataset.dailyMonthValue) return;
  const day=selection.dataset.dailyDay,evolution=selection.dataset.dailyEvolution,shipKey=selection.dataset.dailyFilterShip;
  let records=[],title=model.label,selectedEvolution=evolution;
  if (selection.hasAttribute('data-daily-ship')) {
    const ship=model.perShip.find(item => item.key===selection.dataset.dailyShip);
    if (!ship) return;
    records=ship.records;title=ship.name+' · '+model.label;
  } else if (selection.hasAttribute('data-daily-month-only')) {
    records=model.monthOnlyLogs;title+=' · day not recorded';
    if (selection.dataset.dailyMonthOnly!=='true') {
      const row=model.monthOnlyEvolutionRows.find(item => item.key===selection.dataset.dailyMonthOnly);
      if (!row) return;
      records=row.records;title=row.label+' · day not recorded';selectedEvolution=row.key;
    }
  } else if (evolution) {
    const lane=model.lanes.find(item => item.key===evolution);
    if (!lane) return;
    records=lane.days.filter(item => !day || item.key===day).flatMap(item => item.records);
    title=lane.label+' · '+(day?commandDateLabel(day):model.label);
  } else if (day) {
    const entry=model.days.find(item => item.key===day);
    records=entry?entry.logs:[];title=commandDateLabel(day);
  }
  if (shipKey) records=records.filter(record => record.shipKey===shipKey);
  const unique=new Map();records.forEach(record => unique.set(record.shipKey+'|'+record.index,record));records=Array.from(unique.values());
  if (panel.dataset.dailyScope==='fleet') {
    dailyActivityOpenFleetRecords(model,records,title,selectedEvolution);
    return;
  }
  const grouped=new Map();records.forEach(record => {
    if (!grouped.has(record.shipKey)) grouped.set(record.shipKey,{ship:record.ship,records:[]});
    grouped.get(record.shipKey).records.push({log:record.log,index:record.index});
  });
  const body=grouped.size ? Array.from(grouped.values()).map(group => '<section class="daily-record-group"><h3>'+h(group.ship.name)+'</h3>'+commandActivityDrilldownLogTable({ship:group.ship,monthKey:model.monthKey},group.records)+'</section>').join('') : emptyState('No retained dated logs for this selection.');
  const hours=records.reduce((sum,record) => sum+Math.max(0,Number(record.log.hours)||0),0);
  showModal(title,records.length+' records · '+fmt(hours,1)+' recorded hours',body);
}

function attachDailyActivityEvents() {
  const activate=event => {
    const selection=event.target.closest && event.target.closest('[data-daily-day],[data-daily-evolution],[data-daily-month-only],[data-daily-ship]');
    if (!selection) return;
    const panel=selection.closest('[data-daily-context]');
    if (!panel) return;
    event.preventDefault();
    if (panel.dataset.dailyScope==='fleet' || selection.hasAttribute('data-daily-day') || selection.hasAttribute('data-daily-evolution') || selection.hasAttribute('data-daily-month-only')) dailyActivityOpenRecords(panel,selection);
    else {
      selectedShipKey=selection.dataset.dailyShip;
      commandShipActivitySelections[selectedShipKey]=panel.dataset.dailyMonthValue;
      fleetCalendarSelection.month=panel.dataset.dailyMonthValue;
      fleetCalendarSelection.baselineMonth=commandCalendarPreviousMonth(panel.dataset.dailyMonthValue);
      renderShips();switchView('ships');
    }
  };
  document.addEventListener('click',activate);
  document.addEventListener('keydown',event => {
    if ((event.key==='Enter' || event.key===' ') && event.target.matches && event.target.matches('svg [role="button"][data-daily-day]')) activate(event);
  });
}
