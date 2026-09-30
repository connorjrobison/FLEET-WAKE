const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');

function loadApi(){
  const html=fs.readFileSync(path.join(root,'WAKE FLEET - Only Secure in FS Sharepoint-current.html'),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
  let script=scripts.at(-1);
  // Exercise the authored modules while another worker may be rebuilding the standalone bundle.
  script=script.replace(/^\/\/ BEGIN CO PROGRESSION BUNDLE[\s\S]*?^\/\/ END CO PROGRESSION BUNDLE\r?\n/m,'');
  const modules=[['function commandCurrent(', 'command-progress-engine.js'],['let commandFilters', 'command-progress-ui.js'],['let commandActionFilters','command-action-views.js']]
    .filter(([marker])=>!script.includes(marker)).map(([,file])=>fs.readFileSync(path.join(root,'work/progression',file),'utf8')).join('\n');
  script=script.replace(/\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/, '\n'+modules+`\n
    globalThis.api={commandRecoveryModel,commandTrainingModel,commandTrainingDate,commandTrainingMonth,commandRenderRecovery,commandRenderTraining,commandOpenTrainingEvolution,
      setShips:ships=>{state.ships=Object.fromEntries(ships.map(ship=>[keyFor(ship.name),ship]));},
      setFilters:value=>Object.assign(commandActionFilters,value),
      captureModal:()=>{showModal=(title,subtitle,body)=>{globalThis.modal={title,subtitle,body};};}
    };\n})();`);
  const hosts={'view-performance':{innerHTML:''},'view-evolutions':{innerHTML:''}};
  class TestDate extends Date{constructor(...args){super(...(args.length?args:['2026-07-30T12:00:00Z']));}static now(){return Date.parse('2026-07-30T12:00:00Z');}}
  const context={console,Date:TestDate,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Map,Set,Promise,Intl,URL,setTimeout,clearTimeout,
    document:{getElementById:id=>hosts[id]||null,querySelector:()=>null,querySelectorAll:()=>[],referrer:'',hidden:false,activeElement:null,body:{},documentElement:{getAttribute:()=> 'light',setAttribute:()=>{}},addEventListener:()=>{}},
    navigator:{},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
  context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(script,context);
  return {api:context.api,hosts,context};
}

function person(name,days,category){return {name,rank:'LT',level:'1',daysSinceWatch:days,currencyCategory:category,bridgeEvidence:true,cumulativeBridgeHours:20};}
function ship(name,people,date='2026-07-30T12:00:00Z'){
  return {name,phase:'Basic Phase',officers:people,logs:[],msaRecords:[],sourceGeneratedAt:date,snapshots:[{snapshotId:name+'-'+date,sourceGeneratedAt:date,importedAt:date||'2026-07-30T12:00:00Z',fileName:name+'.json',sourceFingerprint:name+'-'+date,authoritativeBridge:true,officerStates:people,metrics:{}}]};
}
function log(name,officer,date,time,id){return {ship:name,officer,watchstation:'OOD UW',watchDate:date,month:date?date.slice(0,7):'',logId:id,rawText:'Bridge watch '+time,meta:{comments:'Bridge watch '+time},events:'Anchoring',hours:4};}

test('recovery model separates unknown currency and calculates only additional 30-day threshold crossings',()=>{
  const {api}=loadApi();
  const alpha=ship('ALPHA',{A:person('A',44,'Current'),B:person('B',61,'Need'),C:person('C',90,'Need'),D:person('D',91,'Loss'),E:person('E',null,'Current')});
  const undated=ship('UNDATED',{F:person('F',2,'Current')},'');
  const model=api.commandRecoveryModel([alpha,undated],'2026-07-30T12:00:00Z');
  assert.equal(model.counts.current,1);assert.equal(model.counts.need,2);assert.equal(model.counts.loss,1);assert.equal(model.counts.unknown,2);
  assert.equal(model.counts.nextNeed,1);assert.equal(model.counts.nextLoss,2);assert.equal(model.horizon.length,3);
  assert.equal(model.people.find(row=>row.name==='C').daysToLoss,1);
  assert.equal(model.people.find(row=>row.name==='D').daysToLoss,null);
});

test('recovery source age changes today currency without changing source observations',()=>{
  const {api}=loadApi(), alpha=ship('ALPHA',{A:person('A',14,'Current')},'2026-07-01T12:00:00Z');
  const model=api.commandRecoveryModel([alpha],'2026-08-01T12:00:00Z');
  assert.equal(model.people[0].category,'Need');assert.equal(model.people[0].days,45);assert.equal(model.people[0].sourceCategory,'Current');
  assert.equal(alpha.snapshots[0].officerStates.A.daysSinceWatch,14);
});

test('recovery explicitly flags a newer undated roster conflict instead of silently presenting the dated projection as current membership',()=>{
  const {api,hosts}=loadApi(), alpha=ship('ALPHA',{A:person('A',4,'Current')},'2026-07-29T12:00:00Z');
  alpha.snapshots.push({snapshotId:'undated',sourceGeneratedAt:'',importedAt:'2026-07-30T08:00:00Z',fileName:'undated.json',sourceFingerprint:'undated',authoritativeBridge:true,officerStates:{B:person('B',1,'Current')},metrics:{}});
  api.setShips([alpha]);api.commandRenderRecovery();
  assert.match(hosts['view-performance'].innerHTML,/Newer undated roster differs/);
  assert.match(hosts['view-performance'].innerHTML,/current membership and intervening status need a dated export/);
});

test('training period parsing rejects incomplete and invalid assessment dates',()=>{
  const {api}=loadApi();
  for(const raw of ['2026','JUL 2026','2026-07','2/30/2026','2026-02-30','July'])assert.equal(api.commandTrainingDate(raw),'',raw);
  for(const raw of ['2026-07-04','7/4/2026','4 JUL 2026','July 4, 2026'])assert.equal(api.commandTrainingDate(raw),'2026-07-04',raw);
  assert.equal(api.commandTrainingMonth({month:'JUL 2026'}),'2026-07');assert.equal(api.commandTrainingMonth({month:'July'}),'');
  assert.equal(api.commandTrainingMonth({watchDate:'2026-08-02',month:'JUL 2026'}),'2026-08');
});

test('training month scope preserves distinct evolution occurrence counting and excludes future or undated rows',()=>{
  const {api}=loadApi(), alpha=ship('ALPHA',{A:person('A',4,'Current')});
  alpha.logs=[log('ALPHA','A','2026-07-20','0800-1200','a'),log('ALPHA','B','2026-07-20','0800-1200','b'),log('ALPHA','A','2026-07-20','1200-1600','c'),log('ALPHA','A','2026-08-02','0800-1200','future'),log('ALPHA','A','','0800-1200','undated')];
  const model=api.commandTrainingModel([alpha],'2026-07','2026-07-30T12:00:00Z');
  assert.equal(model.logs.length,3);assert.equal(model.hours,12);assert.equal(model.people,2);assert.equal(model.excludedLogs,2);
  assert.equal(model.summary.rows.find(row=>row.label==='Anchoring').count,2);assert.equal(model.comparisons,0);
});

test('dated MSA outcomes remain separate and periods with outcomes but no training rows remain selectable',()=>{
  const {api}=loadApi(), alpha=ship('ALPHA',{A:person('A',4,'Current')});
  alpha.msaRecords=[{type:'MSA 2',officer:'A',date:'2026-06-01',result:'Pass',passed:true},{type:'MSA 5',officer:'A',date:'2026-07-02',result:'Fail',passed:false},{type:'MSA 2',officer:'A',date:'2026',result:'Pass',passed:true},{type:'MSA 2',officer:'A',date:'2026-08-01',result:'Pass',passed:true}];
  const model=api.commandTrainingModel([alpha],'2026-06','2026-07-30T12:00:00Z');
  assert.ok(model.months.includes('2026-06'));assert.equal(model.datedOutcomes.length,1);assert.equal(model.datedOutcomes[0].record.result,'Pass');
  assert.equal(model.excludedOutcomes.length,2);assert.equal(model.logs.length,0);
});

test('rendered recovery and training views keep evidence boundaries and use scoped evolution drilldowns',()=>{
  const {api,hosts,context}=loadApi(), alpha=ship('ALPHA',{A:person('A',50,'Need')});
  alpha.logs=[log('ALPHA','A','2026-07-20','0800-1200','july'),log('ALPHA','A','2026-06-20','0800-1200','june')];
  api.setShips([alpha]);api.setFilters({trainingMonth:'2026-07'});api.commandRenderRecovery();api.commandRenderTraining();
  assert.match(hosts['view-performance'].innerHTML,/Who needs a proficiency watch now\?/);assert.match(hosts['view-performance'].innerHTML,/no later qualifying watch/);
  assert.match(hosts['view-performance'].innerHTML,/data-command-action-person="A"/);
  const rendered=hosts['view-evolutions'].innerHTML;
  assert.match(rendered,/Is training rebuilding proficiency\?/);assert.match(rendered,/data-command-training-evolution=/);assert.doesNotMatch(rendered,/data-open-evolution=/);
  assert.match(rendered,/No comparable report intervals/);assert.doesNotMatch(rendered,/0 recoveries, 0 losses/);
  api.captureModal();api.commandOpenTrainingEvolution('ANCHORING');
  assert.match(context.modal.body,/1 counted occurrences/);assert.match(context.modal.body,/2026-07-20/);assert.doesNotMatch(context.modal.body,/2026-06-20/);
});
