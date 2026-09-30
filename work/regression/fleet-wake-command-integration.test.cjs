const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const target = path.resolve(__dirname, "..", "..", "WAKE FLEET - Only Secure in FS Sharepoint-current.html");
const html = fs.readFileSync(target, "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const clone = value => JSON.parse(JSON.stringify(value));
const SHIP = "USS EVIDENCE DDG 99";

function loadAppApi() {
  const marker = /\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/;
  assert.match(scripts.at(-1), marker, "canonical SharePoint app should retain guarded startup");
  const instrumented = scripts.at(-1).replace(marker, `
globalThis.__commandIntegration = {
  importWakeJson, importRows, normalizeState, authoritativeSnapshots,
  shipMetrics, officerCurrencyAsOf, historyForShip, validateFleetBackupPayload,
  getState: () => state,
  setState: value => { state = normalizeState(value); }
};
})();`);
  let clock = Date.parse("2026-09-30T12:00:00Z");
  class TestDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
      if (!args.length) clock += 1000;
    }
    static now() { return clock; }
  }
  const context = {
    console, Date:TestDate, Math, JSON, Object, Array, String, Number, Boolean,
    RegExp, Map, Set, Promise, Intl, URL, setTimeout, clearTimeout,
    document:{
      getElementById:() => null, querySelector:() => null, querySelectorAll:() => [],
      referrer:"", hidden:false, activeElement:null, body:{},
      documentElement:{ getAttribute:() => "light", setAttribute:() => {} }
    },
    navigator:{},
    localStorage:{ getItem:() => null, setItem:() => {}, removeItem:() => {} }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename:path.basename(target) });
  return context.__commandIntegration;
}

function officer(name, { days=5, hours=20, count=1, rorTests=[] } = {}) {
  return {
    name, rank:"LT", autoShipQual:true, autoDaysSince:days,
    hoursByWS:{ "OOD U/W":{ Q:hours, UI:0 } },
    detectedLogs:Array.from({ length:count }, (_, i) => ({
      logId:name + "-" + i, ws:"OOD U/W", type:"Watch Q", val:"OOD Qualified Watch",
      month:"JUL 2026", hrs:count ? hours / count : 0, baseWatchLog:true,
      meta:{ baseWatchLog:true, watchOccurrenceKey:name + "-" + i }
    })),
    logScores:{}, rorTests
  };
}

function payload(exportedAt, officers, extra={}) {
  return { format:"WAKE_JSON_BACKUP", version:1, ship:SHIP, months:["JUL 2026"],
    ofrpPhase:"Basic Phase", exportedAt, officers, ...extra };
}

function importJson(api, data, name="ship.json") {
  const report = api.importWakeJson(JSON.stringify(data), name);
  assert.equal(report.status, "Imported", (report.errors || []).join("; "));
  return report;
}

function getShip(api) { return api.getState().ships[SHIP]; }

function csvRows(sourceDate, people, phase="Basic Phase") {
  return [
    ["TORIS_EXPORT_VERSION","Ship","OFRP Phase","Officer Name","Record Type","Watchstation","Days Since Watch","Currency Status","Log ID","Month","Current Level","Hours","Raw Text Entry","Source Generated At"],
    ...people.map(person => ["TORIS_OOD_TRACKER_V1",SHIP,phase,person.name,"WATCH_LOG","OOD U/W",
      person.days == null ? "" : String(person.days),person.currency || "",person.name + "-" + sourceDate,"JUL 2026",
      person.level == null ? "" : String(person.level),"4","Underway bridge watch",sourceDate])
  ];
}

test("later imports retain departed bridge personnel and their movement evidence through normalization", () => {
  const api = loadAppApi();
  importJson(api, payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA"), BRAVO:officer("BRAVO") }), "july.json");
  importJson(api, payload("2026-08-01T12:00:00Z", { ALPHA:officer("ALPHA", { days:95 }), BRAVO:officer("BRAVO") }), "august.json");
  importJson(api, payload("2026-09-01T12:00:00Z", { BRAVO:officer("BRAVO") }), "september.json");
  const before = clone(api.getState());
  assert.equal(before.ships[SHIP].officers.ALPHA, undefined);
  assert.equal(before.ships[SHIP].snapshots[0].officerStates.ALPHA.name, "ALPHA");
  assert.equal(before.ships[SHIP].snapshots[1].officerStates.ALPHA.currencyCategory, "Loss");
  assert.ok(before.historyEvents.some(event => event.officerKey === "ALPHA" && event.type === "PROFICIENCY_LOST"));
  api.setState(before);
  assert.deepEqual(clone(getShip(api).snapshots.map(snapshot => Object.keys(snapshot.officerStates).sort())), [["ALPHA","BRAVO"],["ALPHA","BRAVO"],["BRAVO"]]);
  assert.deepEqual(clone(api.getState().historyEvents), before.historyEvents);
});

test("historical log counts, source currency, hours, and ROR evidence remain fixed when current records change", () => {
  const api = loadAppApi();
  importJson(api, payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA", {
    hours:12, count:1, rorTests:[{ date:"2026-06-28", score:95 }]
  }) }), "july.json");
  const baseline = clone(getShip(api).snapshots[0]);
  assert.equal(baseline.metrics.logCount, 1);
  assert.equal(baseline.metrics.current, 1);
  assert.equal(baseline.metrics.rorCurrent, 1, "historical ROR must be evaluated on source date, not upload date");
  importJson(api, payload("2026-09-01T12:00:00Z", { ALPHA:officer("ALPHA", { days:98, hours:40, count:4 }) }), "september.json");
  api.setState(clone(api.getState()));
  const retained = getShip(api).snapshots[0];
  for (const field of ["logCount","officerCount","totalHours","totalQ","totalUI","current","need","loss","rorCurrent"]) {
    assert.equal(retained.metrics[field], baseline.metrics[field], "historical " + field + " must not follow the latest roster/logs");
  }
  assert.deepEqual(clone(retained.officerStates), baseline.officerStates);
  assert.equal(getShip(api).logs.length, 4);
});

test("JSON backfills archive the older source while preserving the current roster, logs, source and OFRP phase", () => {
  const api = loadAppApi();
  importJson(api, payload("2026-09-01T12:00:00Z", { CURRENT:officer("CURRENT", { hours:42, count:2 }) }, { ofrpPhase:"Advanced Phase" }), "latest.json");
  const current = clone(getShip(api));
  const report = importJson(api, payload("2026-07-01T12:00:00Z", { EARLIER:officer("EARLIER") }), "backfill.json");
  const ship = getShip(api);
  assert.equal(report.archivedOnly, true);
  assert.equal(report.phaseChanged, false);
  for (const field of ["officers","logs","phase","sourceGeneratedAt","sourceFingerprint"]) assert.deepEqual(clone(ship[field]), current[field], field + " remains current");
  assert.equal(ship.snapshots.length, 2);
  assert.deepEqual(clone(api.authoritativeSnapshots(ship).map(snapshot => snapshot.sourceGeneratedAt)), ["2026-07-01T12:00:00.000Z","2026-09-01T12:00:00.000Z"]);
});

test("CSV backfills also preserve newer authoritative ship evidence", () => {
  const api = loadAppApi();
  assert.equal(api.importRows(csvRows("2026-09-01T12:00:00Z", [{ name:"CURRENT", days:5, level:2 }], "Advanced Phase"), "new.csv").status, "Imported");
  const before = clone(getShip(api));
  const report = api.importRows(csvRows("2026-07-01T12:00:00Z", [{ name:"EARLIER", days:96, level:0 }]), "old.csv");
  assert.equal(report.status, "Imported");
  assert.equal(report.archivedOnly, true);
  assert.equal(report.phaseChanged, false);
  for (const field of ["officers","logs","phase","sourceGeneratedAt","sourceFingerprint"]) assert.deepEqual(clone(getShip(api)[field]), before[field]);
  assert.equal(getShip(api).snapshots.length, 2);
});

test("source-ordered backfills rebuild losses and recoveries without duplicate movement events", () => {
  const api = loadAppApi();
  const july = payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA") });
  const august = payload("2026-08-01T12:00:00Z", { ALPHA:officer("ALPHA", { days:95 }) });
  const september = payload("2026-09-01T12:00:00Z", { ALPHA:officer("ALPHA") });
  importJson(api, july, "july.json");
  importJson(api, september, "september.json");
  importJson(api, august, "august-backfill.json");
  const events = clone(api.historyForShip(getShip(api)));
  assert.equal(events.filter(event => event.type === "PROFICIENCY_LOST").length, 1);
  assert.equal(events.filter(event => event.type === "PROFICIENCY_RESTORED").length, 1);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  assert.equal(events.find(event => event.type === "PROFICIENCY_LOST").fileName, "august-backfill.json");
  assert.equal(events.find(event => event.type === "PROFICIENCY_RESTORED").fileName, "september.json");
  const repeated = importJson(api, august, "same-august-another-name.json");
  assert.equal(repeated.snapshotId, "");
  assert.equal(getShip(api).snapshots.length, 3);
  assert.equal(getShip(api).sourceGeneratedAt, "2026-09-01T12:00:00.000Z");
  assert.deepEqual(clone(api.historyForShip(getShip(api))), events);
});

test("identical latest-source reimports do not create additional snapshots or movement", () => {
  const api = loadAppApi();
  const first = payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA") });
  const second = payload("2026-08-01T12:00:00Z", { ALPHA:officer("ALPHA", { days:95 }) });
  importJson(api, first, "first.json");
  importJson(api, second, "second.json");
  const before = clone(api.getState());
  const report = importJson(api, second, "second-again.json");
  assert.equal(report.snapshotId, "");
  assert.equal(getShip(api).snapshots.length, 2);
  assert.deepEqual(clone(api.getState().historyEvents), before.historyEvents);
});

test("corrections at one source timestamp are not elapsed progress and replay cannot rewind the correction", () => {
  const api = loadAppApi();
  const original = payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA") });
  const corrected = payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA", { days:95, hours:30 }) });
  importJson(api, original, "original.json");
  importJson(api, corrected, "corrected.json");
  const current = clone(getShip(api));
  assert.equal(api.historyForShip(getShip(api)).length, 0, "same-time corrections cannot establish losses over time");
  const replay = importJson(api, original, "original-replayed.json");
  assert.equal(replay.archivedOnly, true);
  assert.equal(replay.snapshotId, "");
  assert.equal(getShip(api).snapshots.length, 2);
  assert.deepEqual(clone(getShip(api).officers), current.officers);
  assert.equal(getShip(api).sourceFingerprint, current.sourceFingerprint);
  assert.equal(api.historyForShip(getShip(api)).length, 0);
});

test("replaying an earlier undated file retains the later accepted current evidence", () => {
  const api = loadAppApi();
  const original = payload(undefined, { ALPHA:officer("ALPHA") });
  const corrected = payload(undefined, { BRAVO:officer("BRAVO", { hours:30 }) });
  importJson(api, original, "undated-original.json");
  importJson(api, corrected, "undated-later.json");
  const current = clone(getShip(api));
  const replay = importJson(api, original, "undated-replayed.json");
  assert.equal(replay.archivedOnly, true);
  assert.equal(replay.snapshotId, "");
  assert.equal(getShip(api).snapshots.length, 2);
  assert.deepEqual(clone(getShip(api).officers), current.officers);
  assert.equal(getShip(api).sourceFingerprint, current.sourceFingerprint);
});

test("null, empty and absent JSON recency evidence stay unknown instead of becoming zero days or lost currency", () => {
  for (const missing of [null, "", undefined]) {
    const api = loadAppApi();
    const person = officer("UNKNOWN");
    if (missing === undefined) delete person.autoDaysSince;
    else person.autoDaysSince = missing;
    importJson(api, payload("2026-07-01T12:00:00Z", { UNKNOWN:person }));
    const ship = getShip(api);
    assert.equal(ship.officers.UNKNOWN.currencyCategory, "Unknown", "missing recency " + String(missing));
    assert.equal(ship.officers.UNKNOWN.daysSinceWatch, null);
    assert.equal(ship.snapshots[0].officerStates.UNKNOWN.daysSinceWatch, null);
    assert.equal(ship.snapshots[0].metrics.unknown, 1);
    assert.equal(api.officerCurrencyAsOf(ship.officers.UNKNOWN, ship, Date.parse("2026-09-30T12:00:00Z")).category, "Unknown");
    api.setState(clone(api.getState()));
    assert.equal(getShip(api).officers.UNKNOWN.currencyCategory, "Unknown");
  }
});

test("missing source timestamps remain explicitly unverified through import and restore", () => {
  const api = loadAppApi();
  const data = payload(undefined, { ALPHA:officer("ALPHA") });
  const report = importJson(api, data, "undated.json");
  assert.equal(getShip(api).sourceGeneratedAt, "");
  assert.equal(getShip(api).snapshots[0].sourceGeneratedAt, "");
  assert.ok(report.warnings.some(warning => /timestamp/i.test(warning)));
  assert.equal(api.officerCurrencyAsOf(getShip(api).officers.ALPHA, getShip(api)).sourceVerified, false);
  api.setState(clone(api.getState()));
  assert.equal(getShip(api).snapshots[0].sourceGeneratedAt, "");
});

test("watch-date fallback measures recency at the export date rather than the later import date", () => {
  const api = loadAppApi();
  const person = officer("ALPHA");
  delete person.autoDaysSince;
  person.detectedLogs[0].watchDate = "2026-07-05T12:00:00Z";
  importJson(api, payload("2026-07-10T12:00:00Z", { ALPHA:person }));
  assert.equal(getShip(api).officers.ALPHA.daysSinceWatch, 5);
  assert.equal(getShip(api).snapshots[0].metrics.current, 1);
});

test("unknown baseline currency and unclassified level do not manufacture confirmed losses or level-ups", () => {
  const api = loadAppApi();
  assert.equal(api.importRows(csvRows("2026-07-01T12:00:00Z", [{ name:"ALPHA", days:null, level:null }]), "unknown.csv").status, "Imported");
  assert.equal(api.importRows(csvRows("2026-08-01T12:00:00Z", [{ name:"ALPHA", days:95, level:1 }]), "known.csv").status, "Imported");
  const events = api.historyForShip(getShip(api));
  assert.equal(events.filter(event => event.type === "PROFICIENCY_LOST").length, 0);
  assert.equal(events.filter(event => event.type === "LEVEL_UP").length, 0);
});

test("Fleet backup validation and repeated normalization preserve chronological evidence and retired roster members", () => {
  const api = loadAppApi();
  importJson(api, payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA", { hours:0 }), BRAVO:officer("BRAVO") }), "july.json");
  importJson(api, payload("2026-09-01T12:00:00Z", { BRAVO:officer("BRAVO", { count:3 }) }), "september.json");
  importJson(api, payload("2026-08-01T12:00:00Z", { ALPHA:officer("ALPHA", { days:95, hours:0 }), BRAVO:officer("BRAVO") }), "august.json");
  const backup = { ...clone(api.getState()), format:"FLEET_WAKE_BACKUP" };
  const baseline = clone(backup.ships[SHIP].snapshots);
  const history = clone(backup.historyEvents);
  api.setState(api.validateFleetBackupPayload(backup));
  api.setState(clone(api.getState()));
  assert.deepEqual(clone(getShip(api).snapshots), baseline);
  assert.deepEqual(clone(api.getState().historyEvents), history);
  assert.equal(getShip(api).snapshots[0].officerStates.ALPHA.name, "ALPHA", "zero-hour bridge personnel retain their historical evidence");
  assert.equal(getShip(api).sourceGeneratedAt, "2026-09-01T12:00:00.000Z");
});

test("MSA-only overlays preserve the current bridge state and all authoritative historical snapshots", () => {
  const api = loadAppApi();
  importJson(api, payload("2026-07-01T12:00:00Z", { ALPHA:officer("ALPHA") }), "bridge.json");
  const before = clone(getShip(api));
  const report = api.importRows([
    ["TORIS_EXPORT_VERSION","Ship","OFRP Phase","Officer Name","Record Type","MSA ID","MSA Type","MSA Date","MSA Result","MSA Underway Hours"],
    ["TORIS_OOD_TRACKER_V1",SHIP,"Basic Phase","ALPHA","MSA","MSA-2-001","MSA 2","2026-07-20","PASS","40"]
  ], "msa-only.csv");
  assert.equal(report.status, "Imported");
  assert.equal(report.msaRecordsAdded, 1);
  assert.equal(report.snapshotId, "");
  assert.equal(report.historyEvents, 0);
  for (const field of ["officers","logs","sourceGeneratedAt","sourceFingerprint","snapshots"]) assert.deepEqual(clone(getShip(api)[field]), before[field], field + " remains unchanged by outcome overlay");
  assert.equal(getShip(api).msaRecords.length, 1);
});
