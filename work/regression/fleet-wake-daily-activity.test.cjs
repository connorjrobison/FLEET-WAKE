const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'work/progression/daily-activity-model.js'), 'utf8');
const fleetSource = fs.readFileSync(path.join(root, 'work/progression/command-fleet-views.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'WAKE FLEET - Only Secure in FS Sharepoint-current.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
const NOW = '2026-09-18T12:00:00.000Z';
const plain = value => JSON.parse(JSON.stringify(value));
const currentHelpers = ['commandActivityMonth', 'commandRecordedActivityLogs'].map(name => {
  const match = fleetSource.match(new RegExp('^function '+name+'\\([^)]*\\) \\{[\\s\\S]*?^\\}', 'm'));
  assert.ok(match, name);
  return match[0];
}).join('\n');

function loadApi() {
  const marker = /\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/;
  assert.match(script, marker);
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  const context = {
    console, Date:FixedDate, URL, setTimeout, clearTimeout,
    document:{ getElementById:() => null, querySelector:() => null, querySelectorAll:() => [], referrer:'', hidden:false, activeElement:null, body:{}, documentElement:{ getAttribute:() => 'light', setAttribute:() => {} } },
    navigator:{}, localStorage:{ getItem:() => null, setItem:() => {}, removeItem:() => {} }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(script.replace(marker, '\n'+currentHelpers+'\n'+source+`\n
globalThis.__dailyTest = { dailyActivityModel, dailyActivityMonths, commandActivityDrilldownModel, importWakeJson, keyFor, getState:() => state };
})();`), context);
  return context.__dailyTest;
}

function log(day, hours, events = '', extra = {}) {
  return { key:day+'|'+hours, watchDate:day, month:'SEP 2026', officer:'Alpha',
    ship:'USS ALPHA', watchstation:'OOD U/W', hours, events, comments:'0800-1200', ...extra };
}
function ship(name, logs) { return { name, logs:[], activityHistory:logs }; }

test('daily calendar includes every day and leaves future days unavailable without asserting coverage', () => {
  const api = loadApi();
  const model = api.dailyActivityModel([], '2026-09');
  assert.equal(model.days.length, 30);
  assert.equal(model.throughDay, 18);
  assert.equal(model.days[17].hours, 0);
  assert.equal(model.days[17].available, true);
  assert.equal(model.days[17].hasRecords, false);
  assert.equal(model.days[18].hours, null);
  assert.equal(model.days[18].available, false);
  assert.equal(model.days[18].hasRecords, false);
  assert.equal(model.hasRecords, false);
  assert.match(model.coverage, /empty day does not establish/);
  assert.equal(api.dailyActivityModel([], '2024-02').days.length, 29);
  assert.equal(api.dailyActivityModel([], '2026-02').days.length, 28);
  assert.equal(api.dailyActivityModel([], '2026-08').days.length, 31);
  assert.ok(api.dailyActivityModel([], '2026-08').days.every(day => day.available && day.hours === 0));
});

test('fleet totals sum each watch row once while session counts deduplicate people and duplicate labels', () => {
  const api = loadApi();
  const alpha = ship('USS ALPHA', [
    log('2026-09-05', 4, 'Mooring; Mooring; UNREP', { specialConditions:'Mooring' }),
    log('2026-09-05', 6, 'Mooring', { officer:'Bravo', key:'bravo' }),
    log('2026-09-05', 2, 'Mooring', { comments:'1200-1600', key:'later' })
  ]);
  const bravo = ship('USS BRAVO', [log('2026-09-05', 5, 'Mooring', { ship:undefined })]);
  const before = JSON.stringify([alpha, bravo]);
  const model = api.dailyActivityModel([alpha, bravo], '2026-09');
  const day = model.days[4];
  assert.equal(model.totalHours, 17);
  assert.equal(day.hours, 17);
  assert.equal(model.logCount, 4);
  assert.equal(day.evolutions, 4);
  assert.equal(model.totalEvolutions, 4);
  assert.equal(day.evolutionRows.find(row => row.label === 'Mooring').count, 3);
  assert.equal(day.evolutionRows.find(row => row.label === 'Mooring').records.length, 4);
  assert.deepEqual(plain(day.ships), ['USS ALPHA', 'USS BRAVO']);
  assert.deepEqual(plain(model.perShip.map(row => row.totalHours)), [12, 5]);
  assert.equal(model.lanes.find(row => row.label === 'Mooring').days[4].count, 3);
  assert.equal(model.lanes.find(row => row.label === 'Mooring').days[3].count, 0);
  assert.equal(JSON.stringify([alpha, bravo]), before, 'chart aggregation must not mutate retained evidence');
});

test('month-only and malformed calendar days remain inspectable without being placed on a day', () => {
  const api = loadApi();
  const sourceShip = ship('USS DATES', [
    log('', 7, 'Mooring', { month:'FEB 2026' }),
    log('2026-02-30', 4, 'UNREP', { month:'FEB 2026' }),
    log('2026-02-05', 3, 'Mooring', { month:'FEB 2026' }),
    log('', 11, 'Mooring', { month:'Unknown' })
  ]);
  const model = api.dailyActivityModel([sourceShip], '2026-02');
  assert.equal(model.records.length, 3);
  assert.equal(model.totalHours, 3);
  assert.equal(model.logCount, 1);
  assert.equal(model.monthOnlyLogs.length, 2);
  assert.equal(model.monthOnlyHours, 11);
  assert.equal(model.days[0].hours, 0);
  assert.equal(model.days[4].hours, 3);
  assert.equal(model.totalEvolutions, 1);
  assert.equal(model.monthOnlyEvolutionRows.length, 2);
  assert.equal(model.perShip[0].monthOnlyHours, 11);
});

test('recorded calendar dates determine the month rather than a stale export month label', () => {
  const api = loadApi();
  const sourceShip = ship('USS DATES', [log('2026-09-05', 8, 'Mooring', { month:'AUG 2026' })]);
  assert.equal(api.dailyActivityModel([sourceShip], '2026-09').days[4].hours, 8);
  assert.equal(api.dailyActivityModel([sourceShip], '2026-08').totalHours, 0);
  assert.deepEqual(plain(api.dailyActivityMonths([sourceShip])), ['2026-09']);
});

test('month choices include calendar gaps through today and empty months retain no dated evidence', () => {
  const api = loadApi();
  const sourceShip = ship('USS GAPS', [
    log('2026-06-05', 4, 'Mooring', { month:'JUN 2026' }),
    log('2026-08-05', 8, 'UNREP', { month:'AUG 2026' })
  ]);
  assert.deepEqual(plain(api.dailyActivityMonths([sourceShip])), ['2026-06', '2026-07', '2026-08', '2026-09']);
  const gap = api.dailyActivityModel([sourceShip], '2026-07');
  assert.equal(gap.label, 'July 2026');
  assert.equal(gap.days.length, 31);
  assert.equal(gap.hasRecords, false);
  assert.equal(gap.logCount, 0);
  assert.equal(gap.totalHours, 0);
  assert.equal(gap.records.length, 0);
  assert.equal(gap.lanes.length, 0);
  assert.ok(gap.days.every(day => day.available && day.hours === 0 && !day.hasRecords));
  assert.equal(gap.perShip[0].hasRecords, false);
  assert.match(gap.coverage, /empty day does not establish/);
});

test('future watch rows and future month-only rows cannot become plotted or undated activity', () => {
  const api = loadApi();
  const sourceShip = ship('USS FUTURE', [
    log('2026-09-19', 9, 'Mooring'),
    log('', 10, 'Mooring', { month:'OCT 2026' }),
    log('2026-09-18T15:00:00Z', 11, 'Mooring')
  ]);
  const model = api.dailyActivityModel([sourceShip], '2026-09');
  assert.equal(model.records.length, 0);
  assert.equal(model.totalHours, 0);
  assert.equal(model.monthOnlyLogs.length, 0);
  assert.equal(model.days[18].hours, null);
  assert.deepEqual(plain(api.dailyActivityMonths([sourceShip])), ['2026-09']);
});

test('daily references use the month drilldown log index and keep all evolution evidence attached', () => {
  const api = loadApi();
  const sourceShip = ship('USS ALPHA', [
    log('2026-08-03', 2, 'Mooring', { month:'AUG 2026' }),
    log('', 3, 'Mooring'),
    log('2026-09-07', 4, 'Mooring'),
    log('2026-09-07', 5, 'UNREP', { key:'UNREP' })
  ]);
  const model = api.dailyActivityModel([sourceShip], '2026-09');
  const drilldown = api.commandActivityDrilldownModel(sourceShip, '2026-09');
  const refs = model.days[6].logs;
  assert.deepEqual(plain(refs.map(record => record.index)), [1, 2]);
  assert.ok(refs.every(record => drilldown.logs[record.index] === record.log));
  assert.ok(model.lanes.every(lane => lane.days[6].records.every(record => drilldown.logs[record.index] === record.log)));
});

test('actual WAKE cumulative reuploads and corrected records remain one retained daily record', () => {
  const api = loadApi();
  const payload = (exportedAt, hours) => ({
    format:'WAKE_JSON_BACKUP', version:1, ship:'USS IMPORTED', ofrpPhase:'Basic Phase', exportedAt,
    months:['SEP 2026'], officers:{ ALPHA:{ name:'ALPHA', rank:'LT', autoShipQual:true, autoDaysSince:2,
      hoursByWS:{ 'OOD U/W':{ Q:hours, UI:0 } }, rorTests:[], logScores:{}, detectedLogs:[{
        logId:'SAME-WATCH', ws:'OOD U/W', type:'Watch Q', val:'Underway bridge watch', month:'SEP 2026',
        watchDate:'2026-09-05', comments:'0800-1200', baseWatchLog:true, hrs:hours,
        meta:{ baseWatchLog:true, watchDate:'2026-09-05', comments:'0800-1200' }, events:'Mooring'
      }] } }
  });
  assert.equal(api.importWakeJson(JSON.stringify(payload('2026-09-10T12:00:00Z', 4)), 'first.json').status, 'Imported');
  assert.equal(api.importWakeJson(JSON.stringify(payload('2026-09-12T12:00:00Z', 6)), 'correction.json').status, 'Imported');
  api.importWakeJson(JSON.stringify(payload('2026-09-12T12:00:00Z', 6)), 'replay.json');
  const sourceShip = api.getState().ships[api.keyFor('USS IMPORTED')];
  const model = api.dailyActivityModel([sourceShip], '2026-09');
  assert.equal(model.days[4].hours, 6);
  assert.equal(model.days[4].logCount, 1);
  assert.equal(model.days[4].evolutions, 1);
  assert.equal(model.totalHours, 6);
  assert.equal(model.records[0].log.activitySourceGeneratedAt, '2026-09-12T12:00:00.000Z');
});
