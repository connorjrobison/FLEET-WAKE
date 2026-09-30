const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');

function loadApi(){
  const html=fs.readFileSync(path.join(root,'WAKE FLEET - Only Secure in FS Sharepoint-current.html'),'utf8');
  let script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  script=script.replace(/\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/, '\nglobalThis.api={normalizeSourceTimestamp,parseSourceCalendarTimestamp,wakeJsonDaysSince,importWakeJson,importRows,normalizeState,authoritativeSnapshots,historyForShip,historySummaryForShip,getState:()=>state};\n})();');
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-09-30T12:00:00Z']));}static now(){return Date.parse('2026-09-30T12:00:00Z');}}
  const context={console,Date:FixedDate,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Map,Set,Promise,Intl,URL,setTimeout,clearTimeout,
    document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],referrer:'',hidden:false,activeElement:null,body:{},documentElement:{getAttribute:()=> 'light',setAttribute:()=>{}}},
    navigator:{},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
  context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(script,context);return context.api;
}
function payload(date,days=3,records=[]){return {format:'WAKE_JSON_BACKUP',version:1,ship:'USS EVIDENCE',ofrpPhase:'Basic Phase',exportedAt:date,months:['JUL 2026'],officers:{A:{name:'A',autoShipQual:true,autoDaysSince:days,hoursByWS:{'OOD U/W':{Q:20,UI:0}},detectedLogs:[{logId:'a',ws:'OOD U/W',type:'Watch Q',month:'JUL 2026',hrs:4,baseWatchLog:true}],rorTests:[],msaRecords:records}}};}
function getShip(api){return api.getState().ships['USS EVIDENCE'];}

test('source normalization requires a complete valid calendar date and rejects future times',()=>{
  const api=loadApi();
  for(const raw of ['2026','2026-07','July 2026','2026-02-30','2/30/2026','31 APR 2026','2026-10-01T00:00:00Z'])assert.equal(api.normalizeSourceTimestamp(raw),'',raw);
  for(const raw of ['2026-07-04','7/4/2026','4 JUL 2026','July 4, 2026'])assert.match(api.normalizeSourceTimestamp(raw),/^2026-07-04T/,raw);
  assert.equal(api.normalizeSourceTimestamp('2026-02-30','2026-07-01T12:00:00Z'),'2026-07-01T12:00:00.000Z');
});

test('invalid or future JSON source strings remain preserved without fabricated calendar dates',()=>{
  for(const raw of ['2026-07','2026-02-30','2026-12-01T00:00:00Z']){
    const api=loadApi(),report=api.importWakeJson(JSON.stringify(payload(raw)),'invalid.json'),ship=getShip(api);
    assert.equal(report.status,'Imported');assert.equal(report.sourceGeneratedAt,'');assert.equal(report.sourceGeneratedAtRaw,raw);
    assert.equal(ship.snapshots[0].sourceGeneratedAt,'');assert.equal(ship.snapshots[0].sourceGeneratedAtRaw,raw);
    assert.match(report.warnings.join(' '),/invalid, incomplete, or future-dated/);
    assert.equal(api.normalizeState(api.getState()).ships['USS EVIDENCE'].sourceGeneratedAtRaw,raw);
  }
});

test('invalid CSV source retains raw date evidence without manufacturing a dated observation',()=>{
  const api=loadApi();
  const rows=[['TORIS_EXPORT_VERSION','Ship','OFRP Phase','Officer Name','Record Type','Watchstation','Days Since Watch','Currency Status','Log ID','Month','Current Level','Hours','Source Generated At'],['TORIS_OOD_TRACKER_V1','USS EVIDENCE','Basic Phase','A','WATCH_LOG','OOD U/W','3','Current','a','JUL 2026','1','4','2026-02-30']];
  const report=api.importRows(rows,'invalid.csv');assert.equal(report.status,'Imported');assert.equal(report.sourceGeneratedAt,'');assert.equal(report.sourceGeneratedAtRaw,'2026-02-30');
  assert.equal(getShip(api).snapshots[0].sourceGeneratedAtRaw,'2026-02-30');
});

test('watch-date fallback rejects incomplete impossible and future watch dates',()=>{
  const api=loadApi();
  for(const date of ['2026','2026-02','2026-02-30','2/30/2026','2026-03-06'])assert.ok(Number.isNaN(api.wakeJsonDaysSince({watchDate:date},'2026-03-05T12:00:00Z')),date);
  assert.equal(api.wakeJsonDaysSince({watchDate:'2026-03-02'},'2026-03-05T12:00:00Z'),3);
});

test('same-millisecond corrections receive monotonic sequences and remove superseded legacy movement claims',()=>{
  const api=loadApi();
  api.importWakeJson(JSON.stringify(payload('2026-07-01T12:00:00Z',3)),'baseline.json');
  api.importWakeJson(JSON.stringify(payload('2026-08-01T12:00:00Z',95)),'superseded-loss.json');
  api.importWakeJson(JSON.stringify(payload('2026-08-01T12:00:00Z',3)),'correction-current.json');
  const ship=getShip(api);
  assert.deepEqual(Array.from(ship.snapshots,snapshot=>snapshot.observationSequence),[1,2,3]);
  assert.equal(new Set(ship.snapshots.map(snapshot=>snapshot.importedAt)).size,1);
  assert.equal(api.authoritativeSnapshots(ship).length,2);
  assert.equal(api.authoritativeSnapshots(ship).at(-1).fileName,'correction-current.json');
  assert.equal(api.historyForShip(ship).length,0);assert.equal(api.historySummaryForShip(ship).lostEver,0);
  const normalized=api.normalizeState(api.getState());assert.equal(normalized.historyEvents.length,0);
});

test('older mixed-source backfill cannot undo a newer MSA outcome correction but retains unseen historical keys',()=>{
  const api=loadApi();
  const record=(id,result,date)=>({recordId:id,type:'MSA 2',date,result,score:result==='Pass'?95:70});
  api.importWakeJson(JSON.stringify(payload('2026-08-01T12:00:00Z',3,[record('same','Fail','2026-07-15')])),'newer.json');
  const report=api.importWakeJson(JSON.stringify(payload('2026-07-01T12:00:00Z',20,[record('same','Pass','2026-07-15'),record('older','Pass','2026-06-15')])),'older.json');
  const ship=getShip(api);
  assert.equal(report.archivedOnly,true);assert.equal(report.msaRecordsUpdated,0);
  assert.equal(ship.msaRecords.length,2);assert.equal(ship.msaRecords.find(item=>item.recordId==='same').result,'Fail');assert.equal(ship.msaRecords.find(item=>item.recordId==='older').result,'Pass');
  assert.match(report.notes.join(' '),/historical assessment correction/);
});
