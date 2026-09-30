const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const moduleSource = fs.readFileSync(path.join(root, 'work/progression/activity-drilldown.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'WAKE FLEET - Only Secure in FS Sharepoint-current.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
const plain = value => JSON.parse(JSON.stringify(value));
const NOW = '2026-09-30T12:00:00.000Z';
const fleetSource = fs.readFileSync(path.join(root, 'work/progression/command-fleet-views.js'), 'utf8');
const fleetHelpers = ['commandActivityMonth', 'commandRecordedActivityLogs', 'commandShipActivityModel'].map(name => {
  const match = fleetSource.match(new RegExp('^function '+name+'\\([^)]*\\) \\{[\\s\\S]*?^\\}', 'm'));
  assert.ok(match, 'current activity helper '+name);
  return match[0];
}).join('\n');

function loadApi(ship) {
  const marker = /\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/;
  assert.match(script, marker);
  const captures = [], listeners = {};
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  const context = { console, Date:FixedDate, URL, setTimeout, clearTimeout,
    document:{ getElementById:() => null, querySelector:() => null, querySelectorAll:() => [], referrer:'', hidden:false, activeElement:null, body:{}, documentElement:{ getAttribute:() => 'light', setAttribute:() => {} }, addEventListener:(event, fn) => { listeners[event] = fn; } },
    navigator:{}, localStorage:{ getItem:() => null, setItem:() => {}, removeItem:() => {} },
    captureModal:(title, subtitle, body) => captures.push({ title, subtitle, body })
  };
  context.window = context; context.globalThis = context;
  vm.createContext(context);
  const instrumented = script.replace(marker, '\n'+fleetHelpers+'\n'+moduleSource+`
showModal = captureModal;
globalThis.__activityTest = {
  commandActivityDrilldownModel, commandActivityDrilldownPanel, commandActivityDrilldownSource,
  commandOpenActivityDrilldown, commandOpenActivityLog, attachActivityDrilldownEvents,
  evolutionSummary, commandRecordedActivityLogs, commandShipActivityModel, keyFor, setShip:ship => { state.ships[keyFor(ship.name)] = ship; }
};
})();`);
  vm.runInContext(instrumented, context);
  context.__activityTest.setShip(ship);
  return { api:context.__activityTest, captures, listeners };
}

function sample() {
  const row = (officer, date, comments, events, extra = {}) => ({
    key:officer+'|'+date+'|'+comments, ship:'USS RECORDS', officer, watchstation:'OOD U/W',
    month:'SEP 2026', watchDate:date, comments, events, hours:4,
    activitySourceFingerprint:'september-source', activitySourceGeneratedAt:'2026-09-29T12:00:00Z',
    ...extra
  });
  return { name:'USS RECORDS', logs:[], activityHistory:[
    row('Alpha', '2026-09-05', '0800-1200', 'Mooring; Mooring; UNREP', { specialConditions:'Mooring', rawRowData:{ Comments:'<script>source evidence</script>' } }),
    row('Bravo', '2026-09-05', '0800-1200', 'Mooring'),
    row('Charlie', '2026-09-05', '1200-1600', 'Mooring'),
    row('Delta', '', '', 'Mooring', { hours:2 }),
    row('Echo', '2026-08-08', '0800-1200', 'Mooring', { month:'AUG 2026', hours:9 })
  ], snapshots:[{ fileName:'September WAKE.json', sourceFingerprint:'september-source', sourceGeneratedAt:'2026-09-29T12:00:00Z', importedAt:'2026-09-30T08:00:00Z' }] };
}

test('month drilldown uses retained history and the same session counts as the chart', () => {
  const ship = sample(), original = JSON.stringify(ship), { api } = loadApi(ship);
  const model = api.commandActivityDrilldownModel(ship, '2026-09');
  assert.equal(model.logs.length, 4);
  assert.equal(model.hours, 14);
  assert.equal(model.rows.length, api.evolutionSummary(model.logs).total);
  assert.equal(model.rows.length, 4);
  const mooring = model.rows.find(row => row.label === 'Mooring' && row.sessionLabel === '0800-1200');
  assert.equal(mooring.records.length, 2);
  assert.equal(mooring.people.size, 2);
  assert.deepEqual(plain([...mooring.sources]), ['Event', 'Special Condition']);
  assert.equal(JSON.stringify(ship), original);
});

test('month-only evidence never becomes a first-of-month day', () => {
  const ship = sample(), { api } = loadApi(ship);
  const model = api.commandActivityDrilldownModel(ship, '2026-09');
  const undated = model.rows.find(row => row.records.some(item => item.log.officer === 'Delta'));
  assert.equal(undated.day, '');
  assert.equal(undated.dateLabel, 'Day not recorded');
  const panel = api.commandActivityDrilldownPanel(ship, '2026-09');
  assert.match(panel, /Day not recorded/);
  assert.match(panel, /data-command-activity-records="day:"/);
  assert.doesNotMatch(panel, /Sep 1, 2026|2026-09-01/);
});

test('date and evolution links open their exact underlying population without multiplying hours', () => {
  const ship = sample(), { api, captures } = loadApi(ship), key = api.keyFor(ship.name);
  api.commandOpenActivityDrilldown(key, '2026-09', 'day:2026-09-05');
  assert.match(captures[0].subtitle, /3 records · 12\.0 recorded hours/);
  assert.match(captures[0].body, /Alpha/);
  assert.match(captures[0].body, /Bravo/);
  assert.match(captures[0].body, /Charlie/);
  assert.doesNotMatch(captures[0].body, /Delta|Echo/);
  const model = api.commandActivityDrilldownModel(ship, '2026-09');
  const groupIndex = model.rows.findIndex(row => row.label === 'Mooring' && row.sessionLabel === '0800-1200');
  api.commandOpenActivityDrilldown(key, '2026-09', 'evolution:'+groupIndex);
  assert.match(captures[1].subtitle, /2 records · 8\.0 recorded hours/);
  assert.doesNotMatch(captures[1].body, /Charlie|Delta|Echo/);
  assert.match(captures[1].body, /data-command-activity-log="0"/);
});

test('record detail preserves original source provenance and escapes raw imported content', () => {
  const ship = sample(), { api, captures } = loadApi(ship), key = api.keyFor(ship.name);
  api.commandOpenActivityLog(key, '2026-09', 0);
  const detail = captures[0];
  assert.match(detail.body, /September WAKE\.json/);
  assert.match(detail.body, /2026-09-29T12:00:00Z/);
  assert.match(detail.body, /2026-09-30T08:00:00Z/);
  assert.match(detail.body, /&lt;script&gt;source evidence&lt;\/script&gt;/);
  assert.doesNotMatch(detail.body, /<script>/);
  assert.match(detail.body, /Back to date logs/);
  assert.equal(api.commandActivityDrilldownSource(ship, { officer:'Old record' }).file, 'Not retained');
});

test('month without evolutions remains accessible as watch logs and missing month is empty', () => {
  const ship = sample(); ship.activityHistory = [ { ...ship.activityHistory[0], events:'', specialConditions:'' } ];
  const { api, captures } = loadApi(ship), key = api.keyFor(ship.name);
  const panel = api.commandActivityDrilldownPanel(ship, '2026-09');
  assert.match(panel, /All month logs \(1\)/);
  assert.match(panel, /No recorded evolutions/);
  api.commandOpenActivityDrilldown(key, '2026-09', 'month');
  assert.match(captures[0].body, /Alpha/);
  assert.equal(api.commandActivityDrilldownModel(ship, '2026-07').logs.length, 0);
});

test('delegated click handler supports date, evolution, and individual log actions', () => {
  const ship = sample(), { api, captures, listeners } = loadApi(ship), key = api.keyFor(ship.name);
  api.attachActivityDrilldownEvents();
  let prevented = false;
  const button = { dataset:{activityShip:key, activityMonth:'2026-09', commandActivityRecords:'day:2026-09-05'}, hasAttribute:() => false };
  listeners.click({ target:{ closest:() => button }, preventDefault:() => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(captures.length, 1);
  button.dataset.commandActivityLog = '0'; button.hasAttribute = attr => attr === 'data-command-activity-log';
  listeners.click({ target:{ closest:() => button }, preventDefault:() => {} });
  assert.match(captures[1].title, /Watch log/);
});

test('month chart, evolution drilldown, and source log modal share the same past/current activity rows', () => {
  const ship = sample(), valid = ship.activityHistory[0];
  ship.activityHistory = [
    valid,
    { ...valid, officer:'Future day', watchDate:'2026-10-01', month:'OCT 2026', hours:6 },
    { ...valid, officer:'Later today', watchDate:'2026-09-30T15:00:00Z', hours:8 },
    { ...valid, officer:'Future month', watchDate:'', month:'OCT 2026', hours:10 }
  ];
  const { api, captures } = loadApi(ship), key = api.keyFor(ship.name);
  const chart = api.commandShipActivityModel(ship), detail = api.commandActivityDrilldownModel(ship, '2026-09');
  assert.equal(chart.totalHours, 4);
  assert.equal(chart.excludedLogs, 3);
  assert.equal(detail.hours, 4);
  assert.deepEqual(plain(detail.logs.map(log => log.officer)), ['Alpha']);
  assert.equal(detail.rows.length, chart.totalEvolutions);
  assert.equal(api.commandActivityDrilldownModel(ship, '2026-10').logs.length, 0);
  api.commandOpenActivityDrilldown(key, '2026-09', 'month');
  assert.match(captures[0].subtitle, /1 records · 4\.0 recorded hours/);
  assert.doesNotMatch(captures[0].body, /Future day|Later today|Future month/);
  api.commandOpenActivityLog(key, '2026-09', 1);
  assert.equal(captures.length, 1, 'an excluded row cannot be opened through a month log index');
});

test('invalid date without valid month stays outside month drilldowns', () => {
  const ship = sample();
  ship.activityHistory = [{ ...ship.activityHistory[0], month:'', watchDate:'2026-02-30' }];
  const { api } = loadApi(ship);
  assert.equal(api.commandActivityDrilldownModel(ship, '2026-03').logs.length, 0);
  assert.equal(api.commandShipActivityModel(ship).totalHours, 0);
});
