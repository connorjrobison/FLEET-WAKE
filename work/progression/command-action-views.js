// Command action views, embedded in the standalone Fleet WAKE app.
let commandActionFilters = { recoveryShip:"", recoveryStatus:"attention", trainingShip:"", trainingMonth:"latest" };

function commandActionShipOptions(selected) {
  return '<option value="">All imported ships</option>' + allShips().map(ship => '<option value="'+h(keyFor(ship.name))+'"'+(keyFor(ship.name)===selected?' selected':'')+'>'+h(ship.name)+'</option>').join('');
}

function commandActionStat(label, value, detail, tone, attributes) {
  return '<button type="button" class="command-stat '+h(tone||'')+'" '+attributes+'><span>'+h(label)+'</span><strong>'+h(value)+'</strong><small>'+h(detail)+'</small><em>View supporting evidence &rarr;</em></button>';
}

function commandRecoveryModel(ships, nowISO) {
  const now = nowISO || new Date().toISOString();
  const entries = (ships || allShips()).map(ship => ({ship,current:commandCurrent(ship,now)}));
  const counts = { current:0, need:0, loss:0, unknown:0, officerCount:0, nextNeed:0, nextLoss:0 };
  const people = [];
  entries.forEach(entry => {
    ['current','need','loss','unknown','officerCount'].forEach(key => counts[key] += entry.current.counts[key] || 0);
    entry.current.roster.forEach(person => {
      const daysToNeed = person.category==='Current' && person.days!=null ? Math.ceil(45-person.days) : null;
      const daysToLoss = ['Current','Need'].includes(person.category) && person.days!=null ? Math.floor(90-person.days)+1 : null;
      const nextNeed = daysToNeed!=null && daysToNeed>0 && daysToNeed<=30;
      const nextLoss = daysToLoss!=null && daysToLoss>0 && daysToLoss<=30;
      if(nextNeed) counts.nextNeed++;
      if(nextLoss) counts.nextLoss++;
      people.push(Object.assign({ship:entry.ship,current:entry.current,daysToNeed,daysToLoss,nextNeed,nextLoss},person));
    });
  });
  const order={Loss:0,Need:1,Unknown:2,Current:3};
  people.sort((a,b)=>order[a.category]-order[b.category] || (b.days??-1)-(a.days??-1) || a.ship.name.localeCompare(b.ship.name) || a.name.localeCompare(b.name));
  return {now,entries,counts,people,horizon:people.filter(person=>person.nextNeed||person.nextLoss)};
}

function commandRecoverySource(current) {
  const label=current.sourceAt ? commandDateLabel(current.sourceDate)+' · '+current.ageDays+' day'+(current.ageDays===1?'':'s')+' old' : 'No dated source — current currency unverified';
  return label+(current.undatedConflict?' · Newer undated roster differs; membership and intervening status unverified':'');
}

function commandRecoveryRoster(rows) {
  if(!rows.length) return emptyState('No people match this selection in the available source rosters.');
  return commandTable(['Watchstander / ship','Currency today','Days since qualifying watch','Latest source / age','Evidence'],rows.map(row=>[
    '<button class="ship-link" type="button" data-command-action-person="'+h(row.officerKey)+'" data-ship-key="'+h(keyFor(row.ship.name))+'">'+h(row.name)+'</button><small>'+h(row.rank+' · '+row.ship.name)+'</small>',
    commandPill(row.category),h(row.days??'Unknown'),h(commandRecoverySource(row.current)),
    '<small>'+h(row.evidence)+'</small><button class="mini-btn" type="button" data-command-current="'+h(keyFor(row.ship.name))+'">Named source roster</button>'
  ]));
}

function commandRenderRecovery() {
  const host=document.getElementById('view-performance'); if(!host)return;
  const ships=allShips().filter(ship=>!commandActionFilters.recoveryShip||keyFor(ship.name)===commandActionFilters.recoveryShip);
  const model=commandRecoveryModel(ships), c=model.counts, status=commandActionFilters.recoveryStatus;
  const conflicts=model.entries.filter(entry=>entry.current.undatedConflict).length;
  const rows=model.people.filter(row=>status==='all'||(status==='attention'?row.category!=='Current':status==='horizon'?(row.nextNeed||row.nextLoss):row.category===status));
  const options=[['attention','Needs attention + unknown'],['all','Every watchstander'],['Loss','Lost currency'],['Need','Requires proficiency watch'],['Unknown','Unknown evidence'],['Current','Current today'],['horizon','Next 30 days']];
  const sourceRows=model.entries.map(({ship,current})=>[
    '<button class="ship-link" type="button" data-open-ship="'+h(keyFor(ship.name))+'">'+h(ship.name)+'</button>',
    h(commandRecoverySource(current)),h(current.counts.current),h(current.counts.need),h(current.counts.loss),h(current.counts.unknown),
    '<button class="mini-btn" type="button" data-command-current="'+h(keyFor(ship.name))+'">Named roster</button>'
  ]);
  const horizonRows=model.horizon.map(row=>[
    '<button class="ship-link" type="button" data-command-action-person="'+h(row.officerKey)+'" data-ship-key="'+h(keyFor(row.ship.name))+'">'+h(row.name)+'</button><small>'+h(row.ship.name)+'</small>',commandPill(row.category),
    row.nextNeed?h('Requires watch in '+row.daysToNeed+' days'):'—',row.nextLoss?h('Lost currency in '+row.daysToLoss+' days'):'—',h(commandRecoverySource(row.current))
  ]);
  host.innerHTML='<div class="command-workspace"><section class="command-hero"><div><span class="section-kicker">Currency &amp; recovery · '+h(commandDateLabel(model.now))+'</span><h1 class="view-title">Who needs a proficiency watch now?</h1><p>Identify the people, check the age of their evidence, and protect the next 30 days.</p></div><div class="command-hero-stamp"><strong>'+h(c.officerCount)+'</strong><span>source-roster people</span></div></section>'+
    '<section class="command-controls" aria-label="Currency attention filters"><label for="command-recovery-ship">Ship<select id="command-recovery-ship" data-command-action-filter="recoveryShip">'+commandActionShipOptions(commandActionFilters.recoveryShip)+'</select></label><label for="command-recovery-status">People to review<select id="command-recovery-status" data-command-action-filter="recoveryStatus">'+options.map(([value,label])=>'<option value="'+value+'"'+(status===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label></section>'+
    '<p class="command-period-note"><strong>Today is a calculated projection from the latest dated roster.</strong> Aging assumes no later qualifying watch. Upload fresh WAKE evidence to confirm actual currency; these counts do not prove new losses since the last report.'+(conflicts?' <strong>'+h(conflicts)+' ship(s) have a newer undated roster that differs.</strong> Their projected counts use the older dated roster; current membership and intervening status need a dated export to resolve.':'')+'</p>'+
    '<div class="command-kpis">'+commandActionStat('Lost currency',c.loss,'More than 90 days under the aging assumption','loss','data-command-recovery-status="Loss"')+commandActionStat('Requires proficiency watch',c.need,'45–90 days under the aging assumption','need','data-command-recovery-status="Need"')+commandActionStat('Current today',c.current,'Fewer than 45 days; dated numeric evidence','current','data-command-recovery-status="Current"')+commandActionStat('Unknown currency',c.unknown,'Missing dated source or qualifying-watch recency','unknown','data-command-recovery-status="Unknown"')+'</div>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Named attention queue</span><h2>Who is behind these counts?</h2><p>'+h(rows.length)+' people match this selection. Unknown evidence requires verification and is shown separately from lost currency.</p></div></div>'+commandRecoveryRoster(rows)+'</section>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Next 30 days · same no-new-watch assumption</span><h2>Who could cross a currency threshold next?</h2><p>'+h(c.nextNeed)+' could begin requiring a proficiency watch; '+h(c.nextLoss)+' could cross into lost currency. These are threshold calculations, not scheduled events or confirmed future outcomes.</p></div></div>'+(horizonRows.length?commandTable(['Watchstander / ship','Today','45-day threshold','Over-90-day threshold','Source / age'],horizonRows):emptyState('No additional threshold crossings can be calculated within 30 days from the known evidence. Unknown currency is excluded.'))+'</section>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Verify the evidence first</span><h2>Which ships need a fresh report?</h2><p>The age is shown for every source. A newer upload is needed to verify watches completed after that date.</p></div></div>'+commandTable(['Ship','Source date / age','Current','Requires watch','Lost','Unknown','Evidence'],sourceRows)+'</section></div>';
}

function commandTrainingMonth(log) {
  const candidates=[log&&log.watchDate,log&&log.meta&&log.meta.watchDate,log&&log.dateLogged,log&&log.meta&&log.meta.dateLabel];
  for(const candidate of candidates){
    const date=commandTrainingDate(candidate); if(date)return date.slice(0,7);
  }
  const month=String(log&&log.month||'').trim();
  const iso=month.match(/^(\d{4})-(0[1-9]|1[0-2])$/); if(iso)return iso[0];
  const year=month.match(/\b((?:19|20)\d{2})\b/);
  const name=month.toUpperCase().match(/\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\b/);
  if(!year||!name)return '';
  const index=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(name[1].slice(0,3))+1;
  return year[1]+'-'+String(index).padStart(2,'0');
}

function commandTrainingDate(value) {
  const raw=String(value||'').trim();
  const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  const compact=raw.match(/^((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[0-2]\d[0-5]\d){0,2}$/);
  const us=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-]((?:19|20)\d{2})$/);
  const words=raw.match(/^(?:(\d{1,2})\s+([A-Za-z]+)|([A-Za-z]+)\s+(\d{1,2}),?)\s+((?:19|20)\d{2})$/);
  const monthNames=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  let parts=iso?iso.slice(1):compact?compact.slice(1):us?[us[3],us[1],us[2]]:null;
  if(words){const month=monthNames.indexOf((words[2]||words[3]).toUpperCase().slice(0,3))+1;if(month)parts=[words[5],month,words[1]||words[4]];}
  if(!parts)return '';
  return commandDay(String(parts[0])+'-'+String(parts[1]).padStart(2,'0')+'-'+String(parts[2]).padStart(2,'0'));
}

function commandTrainingModel(ships, monthSelection, nowISO) {
  const now=nowISO||new Date().toISOString(), today=now.slice(0,10);
  const entries=(ships||allShips()).map(ship=>({ship,logs:bridgeLogsForShip(ship)}));
  const rawLogs=entries.flatMap(entry=>entry.logs);
  const datedLogs=rawLogs.filter(log=>{
    const value=commandTrainingMonth(log);
    const exact=[log.watchDate,log.dateLogged,log.meta&&log.meta.watchDate,log.meta&&log.meta.dateLabel].map(commandTrainingDate).find(Boolean);
    return value&&value<=today.slice(0,7)&&(!exact||exact<=today);
  });
  const eligibleOutcomes=[], excludedOutcomes=[];
  entries.forEach(({ship})=>msaRecordsForShip(ship).forEach(record=>{
    const date=commandTrainingDate(record.date);
    if(!date||date>today){excludedOutcomes.push({ship,record});return;}
    eligibleOutcomes.push({ship,record,date});
  }));
  const months=Array.from(new Set(datedLogs.map(commandTrainingMonth)
    .concat(eligibleOutcomes.map(item=>item.date.slice(0,7)))
    .concat(entries.flatMap(({ship})=>commandTimeline(ship,now).snapshots.map(item=>item.date.slice(0,7)))))).sort();
  const month=monthSelection==='latest'?(months[months.length-1]||''):String(monthSelection||'');
  const logs=datedLogs.filter(log=>!month||commandTrainingMonth(log)===month);
  const datedOutcomes=eligibleOutcomes.filter(item=>!month||item.date.slice(0,7)===month);
  const summary=evolutionSummary(logs,entries.length,true);
  const periods=month?[month]:months;
  const observations=[];
  entries.forEach(({ship})=>{
    if(!periods.length)return;
    const from=periods[0]+'-01';
    const last=periods[periods.length-1];
    const end=new Date(Date.UTC(Number(last.slice(0,4)),Number(last.slice(5,7)),0)).toISOString().slice(0,10);
    commandMonthly(ship,from,end<today?end:today,now).months.forEach(row=>{
      if(periods.includes(row.month)&&row.hasObservation)observations.push({ship,row});
    });
  });
  return {now,today,entries,months,month,logs,rawLogs,summary,datedOutcomes,excludedOutcomes,observations,
    comparisons:observations.filter(({row})=>row.hasComparison).length,
    excludedLogs:rawLogs.length-datedLogs.length,hours:logs.reduce((sum,log)=>sum+asNumber(log.hours),0),
    people:new Set(logs.map(log=>keyFor(log.ship)+'|'+keyFor(log.officer))).size,
    lost:observations.reduce((sum,{row})=>sum+(row.counts.lost||0),0),restored:observations.reduce((sum,{row})=>sum+(row.counts.restored||0),0),
    levelUp:observations.reduce((sum,{row})=>sum+(row.counts.levelUp||0),0)};
}

function commandTrainingScopeModel() {
  const ships=allShips().filter(ship=>!commandActionFilters.trainingShip||keyFor(ship.name)===commandActionFilters.trainingShip);
  return commandTrainingModel(ships,commandActionFilters.trainingMonth);
}

function commandScopedEvolutionMarkup(markup) {
  return markup.replace(/data-open-evolution=/g,'data-command-training-evolution=');
}

function commandRenderTraining() {
  const host=document.getElementById('view-evolutions'); if(!host)return;
  const model=commandTrainingScopeModel(), summary=model.summary;
  const period=model.month?new Date(model.month+'-01T12:00:00Z').toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'}):'All retained dated months';
  const contribution=model.entries.map(({ship,logs:raw})=>{
    const logs=model.logs.filter(log=>keyFor(log.ship)===keyFor(ship.name));
    const evolutions=evolutionSummary(logs,1,false);
    const source=commandCurrent(ship,model.now);
    return ['<button class="ship-link" type="button" data-open-ship="'+h(keyFor(ship.name))+'">'+h(ship.name)+'</button>',h(logs.length),h(fmt(logs.reduce((sum,log)=>sum+asNumber(log.hours),0),1)),h(evolutions.total),h(commandRecoverySource(source)),'<button class="mini-btn" type="button" data-command-training-logs="'+h(keyFor(ship.name))+'">Period logs</button>'];
  });
  const observedRows=model.observations.map(({ship,row})=>[h(ship.name),h(row.label),row.hasComparison?h(row.counts.lost||0):'—',row.hasComparison?h(row.counts.restored||0):'—',row.hasComparison?h(row.counts.levelUp||0):'—',h(commandDateLabel(row.snapshot.date)),'<small>'+h(row.caveat||'Changes were observed between source reports; the precise change day is unverified.')+'</small>']);
  const outcomeRows=model.datedOutcomes.map(({ship,record,date})=>[h(ship.name),h(record.officer),h(record.type),h(commandDateLabel(date)),h(record.result),h(record.score||'Not recorded'),h(record.sourceFile||'Not recorded')]);
  host.innerHTML='<div class="command-workspace"><section class="command-hero"><div><span class="section-kicker">Training evidence</span><h1 class="view-title">Is training rebuilding proficiency?</h1><p>Review recorded activity alongside observed recovery and assessment evidence.</p></div><div class="command-hero-stamp"><strong>'+h(model.entries.length)+'</strong><span>ships in scope</span></div></section>'+
    '<section class="command-controls" aria-label="Training evidence filters"><label for="command-training-ship">Ship<select id="command-training-ship" data-command-action-filter="trainingShip">'+commandActionShipOptions(commandActionFilters.trainingShip)+'</select></label><label for="command-training-month">Calendar month<select id="command-training-month" data-command-action-filter="trainingMonth"><option value="latest"'+(commandActionFilters.trainingMonth==='latest'?' selected':'')+'>Latest recorded month</option><option value=""'+(commandActionFilters.trainingMonth===''?' selected':'')+'>All retained dated months</option>'+model.months.map(month=>'<option value="'+month+'"'+(commandActionFilters.trainingMonth===month?' selected':'')+'>'+h(month)+'</option>').join('')+'</select></label></section>'+
    '<p class="command-period-note"><strong>'+h(period)+'.</strong> Activity uses the currently retained authoritative bridge logs. It is not a complete archive of every prior upload. '+h(model.excludedLogs)+' logs lack a usable past/current calendar month and are excluded from period totals. Recorded activity alone does not prove proficiency recovery or cause an observed improvement.</p>'+
    '<div class="command-kpis">'+commandActionStat('Bridge watch rows',model.logs.length,'Deduplicated retained rows in this period','progress','data-command-training-logs=""')+commandActionStat('Recorded bridge hours',fmt(model.hours,1),'Sum of imported row hours; not ship underway hours','progress','data-command-training-logs=""')+commandActionStat('People represented',model.people,'Distinct exported names, matched within each ship','progress','data-command-training-logs=""')+commandActionStat('Evolution occurrences',summary.total,'One count per evolution, ship, day and watch period','progress','data-command-training-show="evolutions"')+'</div>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Activity and source coverage</span><h2>Where was the training recorded?</h2><p>Zero means no matching retained rows, not proof that the ship did no training. Source ages show where a fresh upload may change the picture.</p></div></div>'+commandTable(['Ship','Watch rows','Recorded hours','Evolution occurrences','Latest source / age','Evidence'],contribution)+'</section>'+
    '<section class="command-panel" id="command-training-evolutions"><div class="command-section-heading"><div><span class="section-kicker">Counted evolution evidence</span><h2>What did watchstanders practice?</h2><p>Participants on the same ship, day and watch period count together for each evolution. Separate same-day periods remain separate. One watch can include multiple evolutions; missing session detail limits separation.</p></div></div>'+evolutionCoverageLegend(summary)+commandScopedEvolutionMarkup(evolutionChart(summary.rows,summary.shipCount))+commandScopedEvolutionMarkup(evolutionTable(summary.rows,true,summary.shipCount,commandActionFilters.trainingShip))+'</section>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Observed progression · separate from activity</span><h2>Did the later reports show recovery?</h2><p>'+(model.comparisons?h(model.restored)+' recoveries, '+h(model.lost)+' losses, and '+h(model.levelUp)+' level increases were observed at reports in the selected months.':'No comparable report intervals establish changes in the selected months.')+' These intervals may begin before the selected month and cannot establish when, or why, the change occurred. A first report establishes a baseline.</p></div></div>'+(observedRows.length?commandTable(['Ship','Observed-at month','Losses','Recoveries','Level increases','Last source','Observation limits'],observedRows):emptyState('No dated source observations in this period. Training rows cannot fill this evidence gap.'))+'</section>'+
    '<section class="command-panel"><div class="command-section-heading"><div><span class="section-kicker">Dated assessment outcomes · separate evidence</span><h2>What do the recorded assessments show?</h2><p>MSA 2 and MSA 5 results are shown only with a usable assessment date in this period. '+h(model.excludedOutcomes.length)+' undated or future-dated outcomes are excluded. Assessment outcomes do not establish a causal link to these training rows.</p></div></div>'+(outcomeRows.length?commandTable(['Ship','Watchstander','Assessment','Assessment date','Recorded result','Score','Source'],outcomeRows):emptyState('No dated MSA 2 or MSA 5 outcomes are available for this period.'))+'</section></div>';
}

function commandOpenRecoveryPerson(shipKey,officerKey) {
  const ship=state.ships[shipKey]; if(!ship)return;
  const current=commandCurrent(ship,new Date().toISOString()), row=current.roster.find(person=>person.officerKey===officerKey); if(!row)return;
  const imported=ship.officers&&ship.officers[officerKey];
  showModal(row.name+' — currency evidence',ship.name+' · '+commandRecoverySource(current),commandTable(['Measure','Evidence'],[
    ['Currency at source',commandPill(row.sourceCategory)],['Days at source',h(row.sourceDays??'Unknown')],['Calculated days today',h(row.days??'Unknown')],['Calculated currency today',commandPill(row.category)],['Source file',h(current.snapshot?current.snapshot.snapshot.fileName||'Unnamed source':'No dated source')]
  ])+'<p class="command-note">'+h(row.evidence)+' '+h(current.caveats.join(' '))+'</p>'+(imported?'<p><button class="btn secondary" type="button" data-open-officer="'+h(officerKey)+'" data-ship-key="'+h(shipKey)+'">Open imported profile and logs</button></p>':'<p class="command-note">This source-roster name is absent from the current imported officer profiles.</p>'));
}

function commandOpenTrainingEvolution(key) {
  const model=commandTrainingScopeModel(), normalized=evolutionKey(key);
  const row=model.summary.rows.find(item=>item.key===normalized); if(!row)return;
  showModal(row.label+' — period evidence',(model.month||'All retained dated months')+' · '+model.entries.length+' ships in scope','<p class="plain-explain"><strong>'+h(row.count)+' counted occurrences</strong> in the selected ship and month scope. Watch participants share one evolution count for the same ship, day and period. Separate same-day periods remain separate.</p>'+evolutionEvidenceTable(model.logs,normalized));
}

function attachCommandActionEvents() {
  document.addEventListener('change',event=>{
    const field=event.target.dataset&&event.target.dataset.commandActionFilter;
    if(!field||!Object.prototype.hasOwnProperty.call(commandActionFilters,field))return;
    commandActionFilters[field]=event.target.value;
    const recovery=field.startsWith('recovery'), host=document.getElementById(recovery?'view-performance':'view-evolutions');
    const focus=captureRerenderFocus(host);
    if(recovery)commandRenderRecovery();else commandRenderTraining();
    restoreRerenderFocus(host,focus);
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest&&event.target.closest('[data-command-recovery-status],[data-command-action-person],[data-command-training-evolution],[data-command-training-logs],[data-command-training-show]');
    if(!button)return;
    event.preventDefault();
    if(button.hasAttribute('data-command-recovery-status')){commandActionFilters.recoveryStatus=button.dataset.commandRecoveryStatus;commandRenderRecovery();document.getElementById('command-recovery-status')?.focus({preventScroll:true});}
    else if(button.hasAttribute('data-command-action-person'))commandOpenRecoveryPerson(button.dataset.shipKey,button.dataset.commandActionPerson);
    else if(button.hasAttribute('data-command-training-evolution'))commandOpenTrainingEvolution(button.dataset.commandTrainingEvolution);
    else if(button.hasAttribute('data-command-training-logs')){
      const model=commandTrainingScopeModel(), shipKey=button.dataset.commandTrainingLogs;
      const logs=model.logs.filter(log=>!shipKey||keyFor(log.ship)===shipKey);
      showModal('Training rows — '+(shipKey||'selected fleet'),model.month||'All retained dated months',activityEvidenceTable(logs)+'<p class="command-note">These rows are the same retained evidence used in this period’s activity totals.</p>');
    }else document.getElementById('command-training-evolutions')?.scrollIntoView({block:'start',behavior:'smooth'});
  });
}
