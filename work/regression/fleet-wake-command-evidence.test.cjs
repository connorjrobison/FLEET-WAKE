const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname,'..','..');
const html = fs.readFileSync(path.join(root,'WAKE FLEET - Only Secure in FS Sharepoint-current.html'),'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
const copy = value => JSON.parse(JSON.stringify(value));

function loadApi() {
  let source = scripts.at(-1);
  let additions = '';
  for (const [marker,file] of [['function commandTimeline(', 'command-progress-engine.js'],['function commandDateLabel(', 'command-progress-ui.js'],['function commandRenderImports(', 'command-evidence-views.js']]) {
    if (!source.includes(marker)) additions += '\n'+fs.readFileSync(path.join(root,'work','progression',file),'utf8');
  }
  const marker = /\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/;
  assert.match(source,marker);
  source = source.replace(marker, additions+`
globalThis.__evidenceTest={
  commandWatchDateInfo, commandFilteredActivityLogs, commandActivityCsv,
  commandImportMeaning, commandSourceRows, commandRenderImports,
  commandRenderReferences, commandRenderExplorer, commandOpenSource,
  importWakeJson, parseCSV,
  getState:()=>state,
  pushReport:report=>state.importReports.push(report),
  setActivity:value=>{commandActivityFilters=Object.assign({from:'',to:'',precision:''},value);},
  setExplorer:value=>{Object.keys(explorerFilters).forEach(key=>explorerFilters[key]='');Object.assign(explorerFilters,value);}
};
})();`);
  const hosts = Object.fromEntries(['view-imports','view-references','view-explorer'].map(id=>[id,{innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]} ]));
  const context = {
    console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
    Map, Set, Promise, Intl, URL, setTimeout, clearTimeout,
    document:{getElementById:id=>hosts[id]||null,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null,referrer:'',hidden:false,body:{},documentElement:{getAttribute:()=> 'light',setAttribute:()=>{}}},
    navigator:{},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);vm.runInContext(source,context);
  return {api:context.__evidenceTest,hosts};
}

function sample(ship='USS EVIDENCE',date='2026-07-01T12:00:00Z',days=5) {
  return {format:'WAKE_JSON_BACKUP',version:1,ship,exportedAt:date,ofrpPhase:'Basic Phase',months:['JUL 2026'],officers:{ALPHA:{name:'ALPHA',rank:'LT',autoShipQual:true,autoDaysSince:days,hoursByWS:{'OOD U/W':{Q:12,UI:0}},detectedLogs:[
    {logId:'WATCH-1',ws:'OOD U/W',type:'Watch Q',val:'DATED WATCH',watchDate:'2026-07-05',month:'JUL 2026',hrs:4,baseWatchLog:true},
    {logId:'WATCH-2',ws:'OOD U/W',type:'Watch Q',val:'MONTH ONLY',month:'JUL 2026',hrs:4,baseWatchLog:true},
    {logId:'WATCH-3',ws:'OOD U/W',type:'Watch Q',val:'DATE UNKNOWN',hrs:4,baseWatchLog:true}
  ],logScores:{},rorTests:[]}}};
}

test('activity dates distinguish a recorded day, month-only evidence, invalid dates and missing evidence',()=>{
  const {api}=loadApi();
  const cases=[
    [{watchDate:'2026-07-05',month:'JUL 2026'},'day','2026-07-05'],
    [{dateLogged:'5',month:'JUL 2026'},'day','2026-07-05'],
    [{dateLogged:'20260705',month:'JUL 2026'},'day','2026-07-05'],
    [{dateLogged:'JUL 2026',month:'JUL 2026'},'month',''],
    [{dateLogged:'2026-07',month:'JUL 2026'},'month',''],
    [{dateLogged:'07/2026',month:'JUL 2026'},'month',''],
    [{watchDate:'2026-02-31',month:'FEB 2026'},'month',''],
    [{dateLogged:'31',month:'APR 2026'},'month',''],
    [{watchDate:'9/31/2026',month:'SEP 2026'},'month',''],
    [{month:'JUL 2026'},'month',''],
    [{logId:'20260705',importedAt:'2026-07-05'},'unknown','']
  ];
  for(const [log,precision,day] of cases){
    const result=api.commandWatchDateInfo(log);
    assert.equal(result.precision,precision,JSON.stringify(log));
    assert.equal(result.day,day,JSON.stringify(log));
  }
});

test('activity date filters and exported CSV use the identical filtered population and retain source provenance',()=>{
  const {api}=loadApi();
  api.importWakeJson(JSON.stringify(sample()),'source-july.json');
  assert.equal(api.commandFilteredActivityLogs().length,3);
  api.setActivity({from:'2026-07-01',to:'2026-07-31'});
  assert.equal(api.commandFilteredActivityLogs().length,1,'month-only and unknown-day rows cannot be assigned to a day range');
  const rows=api.parseCSV(api.commandActivityCsv());
  assert.equal(rows.length,2);
  assert.equal(rows[1][20],'WATCH-1');
  assert.equal(rows[1][21],'2026-07-05');
  assert.equal(rows[1][22],'day');
  assert.equal(rows[1][23],'source-july.json');
  assert.equal(rows[1][24],'2026-07-01T12:00:00.000Z');
  api.setActivity({precision:'month'});
  assert.equal(api.commandFilteredActivityLogs().length,1);
  api.setExplorer({search:'DATED WATCH'});
  assert.equal(api.commandFilteredActivityLogs().length,0,'existing text filter composes with new precision filter');
});

test('source register uses source chronology and identifies retained same-time corrections',()=>{
  const {api}=loadApi();
  api.importWakeJson(JSON.stringify(sample('USS EVIDENCE','2026-09-01T12:00:00Z')),'latest.json');
  api.importWakeJson(JSON.stringify(sample('USS EVIDENCE','2026-07-01T12:00:00Z')),'older.json');
  api.importWakeJson(JSON.stringify(sample('USS OTHER','2026-08-01T12:00:00Z')),'other.json');
  const corrected=sample('USS OTHER','2026-08-01T12:00:00Z',95);
  api.importWakeJson(JSON.stringify(corrected),'correction.json');
  const rows=api.commandSourceRows();
  assert.equal(rows[0].snapshot.fileName,'latest.json');
  assert.equal(rows.at(-1).snapshot.fileName,'older.json');
  assert.ok(rows.some(row=>row.status==='Selected correction at this source time'));
  assert.ok(rows.some(row=>row.status==='Superseded version retained for audit'));
});

test('upload classification keeps rejected files, replay, backfills and outcome overlays distinct',()=>{
  const {api}=loadApi();
  assert.equal(api.commandImportMeaning({status:'Rejected',errors:['Invalid']}).label,'Rejected');
  assert.equal(api.commandImportMeaning({status:'Imported',sourceFingerprint:'abc',snapshotId:'',duplicateSource:true,archivedOnly:true}).label,'Repeated source');
  assert.equal(api.commandImportMeaning({status:'Imported',sourceFingerprint:'abc',snapshotId:'older',archivedOnly:true}).label,'Historical backfill');
  assert.equal(api.commandImportMeaning({status:'Imported',snapshotId:'',notes:['MSA-only outcome data was overlaid.']}).label,'Outcome overlay');
  assert.equal(api.commandImportMeaning({status:'Imported',snapshotId:'new',sourceGeneratedAt:''}).label,'Undated observation');
});

test('revamped evidence views render import provenance, source limits, original filters and SharePoint controls safely',()=>{
  const {api,hosts}=loadApi();
  const report=api.importWakeJson(JSON.stringify(sample()),'<source>.json');
  api.pushReport(report);
  api.commandRenderImports();
  assert.match(hosts['view-imports'].innerHTML,/What did the upload change\?/);
  assert.match(hosts['view-imports'].innerHTML,/&lt;source&gt;\.json/);
  assert.doesNotMatch(hosts['view-imports'].innerHTML,/<source>/);
  assert.match(hosts['view-imports'].innerHTML,/Source date/);
  assert.match(hosts['view-imports'].innerHTML,/First dated observation establishes the baseline/);
  api.commandRenderExplorer();
  const explorer=hosts['view-explorer'].innerHTML;
  for(const name of ['ship','phase','month','watchstation','level','currency','area','traffic'])assert.ok(explorer.includes('data-filter="'+name+'"'));
  assert.match(explorer,/id="filter-search"/);
  assert.match(explorer,/Month only/);
  assert.match(explorer,/Date unavailable/);
  assert.match(explorer,/not a complete historical log archive/);
  api.commandRenderReferences();
  const guide=hosts['view-references'].innerHTML;
  assert.match(guide,/What changed since the last report\?/);
  assert.match(guide,/flankspeed\.sharepoint-mil\.us/);
  assert.match(guide,/data-command-maintenance="restore"/);
  assert.match(guide,/data-command-maintenance="coverage"/);
  assert.match(guide,/Unknown currency is excluded/);
});
