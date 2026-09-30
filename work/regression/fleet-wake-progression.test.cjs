const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const enginePath = path.resolve(__dirname, "../progression/command-progress-engine.js");
const engineSource = fs.readFileSync(enginePath, "utf8");
const context = vm.createContext({ Date, console });
vm.runInContext(engineSource + "\nthis.api = { commandTimeline, commandCompare, commandLast30Days, commandMonthly, commandCurrent, commandMetrics, commandTimestamp };", context, { filename: enginePath });
const api = context.api;
const NOW = "2026-09-30T12:00:00.000Z";
const plain = value => JSON.parse(JSON.stringify(value));
function officer(name, category = "Current", level = "1", days = 10) {
  return { name, rank: "LT", currencyCategory: category, level, daysSinceWatch: days, cumulativeBridgeHours: 70, totalQHrs: 60, totalUIHrs: 10 };
}
function snapshot(date, states, extra = {}) {
  return Object.assign({ snapshotId: date, sourceGeneratedAt: date, importedAt: date, authoritativeBridge: true, officerStates: states }, extra);
}
function ship(snapshots, extra = {}) { return Object.assign({ name: "USS EVIDENCE", snapshots }, extra); }
function compare(snapshots, options = {}) { return api.commandCompare(ship(snapshots), Object.assign({ mode: "date", from: "2026-01-01", to: "2026-09-30", nowISO: NOW }, options)); }
function deepFreeze(value) { Object.values(value).forEach(item => { if (item && typeof item === "object") deepFreeze(item); }); return Object.freeze(value); }

function loadUi(ships) {
  const uiSource = fs.readFileSync(path.resolve(__dirname, "../progression/command-progress-ui.js"), "utf8");
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  const captures = [];
  const uiContext = vm.createContext({
    Date: FixedDate,
    console,
    allShips: () => ships,
    keyFor: value => String(value).toUpperCase(),
    state: { ships: Object.fromEntries(ships.map(item => [item.name.toUpperCase(), item])) },
    h: value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])),
    fmt: (value, decimals) => Number(value).toFixed(decimals || 0),
    currencyStatusLabel: value => ({ Current: "Current", Need: "Requires Proficiency Watch", Loss: "Lost Currency", Unknown: "Unknown" }[value] || "Unknown"),
    emptyState: message => "<p>" + message + "</p>",
    csvEscape: value => '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"',
    downloadText: (name, text, mime) => captures.push({ name, text, mime })
  });
  vm.runInContext(engineSource + "\n" + uiSource + "\nthis.ui = { commandReviewModel, commandLastThirtyModel, commandLastThirtyPanel, commandMonthRows, commandWorkspace, commandBriefHtml, commandExportCsv, commandSourcesPanel, commandMonthlyPanel, setFilters: value => { commandFilters = Object.assign(commandFilters, value); } };", uiContext);
  uiContext.ui.setFilters({ mode: "date", from: "2026-01-01", to: "2026-09-30" });
  return { ui: uiContext.ui, captures };
}

function loadFleetViews(ships) {
  const uiSource = fs.readFileSync(path.resolve(__dirname, "../progression/command-progress-ui.js"), "utf8");
  const fleetSource = fs.readFileSync(path.resolve(__dirname, "../progression/command-fleet-views.js"), "utf8");
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  const fleetContext = vm.createContext({
    Date: FixedDate,
    console,
    allShips: () => ships,
    keyFor: value => String(value || "").toUpperCase(),
    state: { ships: Object.fromEntries(ships.map(item => [item.name.toUpperCase(), item])) },
    h: value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])),
    fmt: (value, decimals) => Number(value).toFixed(decimals || 0),
    emptyState: message => "<p>" + message + "</p>",
    bridgeLogsForShip: item => item.logs || [],
    historicalActivityLogsForShip: item => item.activityHistory || item.logs || [],
    commandWatchDateInfo: log => {
      const raw = String(log.watchDate || log.dateLogged || "").trim();
      const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      const dayOnly = raw.match(/^\d{1,2}$/);
      const month = String(log.month || "").match(/\b((?:19|20)\d{2})\b/) && String(log.month || "").match(/\b([A-Z]{3})/i);
      const monthNumber = month ? ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(month[1].toUpperCase()) + 1 : 0;
      return { day:direct ? direct[1] : dayOnly && monthNumber ? month[1] + "-" + String(monthNumber).padStart(2,"0") + "-" + dayOnly[0].padStart(2,"0") : "", raw };
    },
    evolutionSummary: logs => {
      const labels=[];
      logs.forEach(log => [log.events, log.specialConditions].forEach(value => String(value || "").split(/[;,|]/).map(item => item.trim()).filter(Boolean).forEach(label => labels.push(label))));
      const counts=new Map(); labels.forEach(label => counts.set(label,(counts.get(label)||0)+1));
      return { total:labels.length, rows:Array.from(counts,([label,count])=>({label,count})) };
    }
  });
  vm.runInContext(engineSource + "\n" + uiSource + "\n" + fleetSource + "\nthis.fleet = { commandShipActivityModel, commandShipActivityPanel, setActivityMonth:(shipKey, month) => { commandShipActivitySelections[shipKey] = month; } };", fleetContext);
  return fleetContext.fleet;
}

function loadCanonicalWithFrozenClock() {
  const html = fs.readFileSync(path.resolve(__dirname, "../../WAKE FLEET - Only Secure in FS Sharepoint-current.html"), "utf8");
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  const marker = /\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/;
  assert.match(script, marker);
  const instrumented = script.replace(marker, "\nglobalThis.__sameMsTest = { importWakeJson, sourceFingerprint, commandTimeline, commandCurrent, commandShipActivityModel, historicalActivityLogsForShip, getState: () => state, normalizeState };\n})();");
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  const sandbox = vm.createContext({ console, Date:FrozenDate, URL, setTimeout, clearTimeout,
    document:{ getElementById:() => null, querySelector:() => null, querySelectorAll:() => [], referrer:"", hidden:false, activeElement:null, body:{}, documentElement:{ getAttribute:() => "light", setAttribute:() => {} } },
    navigator:{}, localStorage:{ getItem:() => null, setItem:() => {}, removeItem:() => {} }
  });
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInContext(instrumented, sandbox);
  return sandbox.__sameMsTest;
}

test("source chronology survives backfills; upload time never becomes historical source evidence", () => {
  const early = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha") }, { importedAt: "2026-09-01T12:00:00Z" });
  const late = snapshot("2026-06-01T12:00:00Z", { A: officer("Alpha", "Loss", "2", 91) }, { importedAt: "2026-06-02T12:00:00Z" });
  const undated = snapshot("", { A: officer("Alpha") }, { importedAt: "2026-09-02T12:00:00Z" });
  const result = api.commandTimeline(ship([late, undated, early]), NOW);
  assert.deepEqual(plain(result.snapshots.map(item => item.date)), ["2026-01-01", "2026-06-01"]);
  assert.equal(result.undated.length, 1);
  assert.equal(result.undated[0].basis, "upload");
  assert.equal(result.undated[0].dated, false);
  assert.equal(compare([late, early]).counts.lost, 1);
});

test("duplicate source fingerprints and identical same-time observations do not multiply evidence", () => {
  const a = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha") }, { sourceFingerprint: "source-1" });
  const reupload = Object.assign({}, a, { snapshotId: "later-upload", importedAt: "2026-07-01T12:00:00Z" });
  const b = snapshot("2026-02-01T12:00:00Z", { A: officer("Alpha", "Loss", "1", 91) });
  const repeatedB = Object.assign({}, b, { importedAt: "2026-08-01T12:00:00Z" });
  const result = api.commandTimeline(ship([reupload, repeatedB, b, a]), NOW);
  assert.equal(result.snapshots.length, 2);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.conflicts.length, 0);
  assert.equal(compare([reupload, repeatedB, b, a]).observed.counts.lost, 1);
});

test("same-source-time corrections are deterministic and flagged, never counted as progression", () => {
  const old = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha", "Loss", "1", 91) }, { importedAt: "2026-01-02T12:00:00Z", sourceFingerprint: "old" });
  const corrected = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha") }, { importedAt: "2026-01-03T12:00:00Z", sourceFingerprint: "corrected" });
  const first = api.commandTimeline(ship([old, corrected]), NOW);
  const reverse = api.commandTimeline(ship([corrected, old]), NOW);
  assert.equal(first.snapshots.length, 1);
  assert.equal(first.conflicts.length, 1);
  assert.equal(first.snapshots[0].snapshot, corrected);
  assert.equal(reverse.snapshots[0].snapshot, corrected);
  assert.equal(first.snapshots[0].corrected, true);
  assert.equal(api.commandCompare(ship([old, corrected]), { nowISO: NOW }).available, false);
});

test("same-millisecond source corrections use persisted observation sequence rather than fingerprint lexicography", () => {
  const old = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha", "Loss", "1", 91) }, { snapshotId:"same-ffff", sourceFingerprint:"ffff", importedAt:"2026-09-30T11:00:00Z", observationSequence:4 });
  const corrected = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha", "Current", "2", 1) }, { snapshotId:"same-0000", sourceFingerprint:"0000", importedAt:"2026-09-30T11:00:00Z", observationSequence:5 });
  for (const order of [[old, corrected], [corrected, old]]) {
    const source = ship(order);
    const result = api.commandTimeline(source, NOW);
    assert.equal(result.snapshots.length, 1);
    assert.equal(result.snapshots[0].snapshot, corrected);
    assert.equal(result.conflicts[0].selectionBasis, "sequence");
    assert.equal(result.conflicts[0].orderAmbiguous, false);
    const current = api.commandCurrent(source, "2026-01-02T12:00:00Z");
    assert.equal(current.roster[0].sourceCategory, "Current");
    assert.equal(current.roster[0].level, "2");
  }
});

test("legacy same-millisecond ties prefer a matching current source and otherwise flag retained order as provisional", () => {
  const old = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha", "Loss", "1", 91) }, { snapshotId:"same-ffff", sourceFingerprint:"ffff", importedAt:"2026-09-30T11:00:00Z" });
  const corrected = snapshot("2026-01-01T12:00:00Z", { A: officer("Alpha", "Current", "2", 1) }, { snapshotId:"same-0000", sourceFingerprint:"0000", importedAt:"2026-09-30T11:00:00Z" });
  const resolved = api.commandTimeline(ship([corrected, old], { sourceGeneratedAt:corrected.sourceGeneratedAt, sourceFingerprint:corrected.sourceFingerprint }), NOW);
  assert.equal(resolved.snapshots[0].snapshot, corrected);
  assert.equal(resolved.conflicts[0].selectionBasis, "current-source");
  assert.equal(resolved.conflicts[0].orderAmbiguous, false);
  const ambiguous = api.commandTimeline(ship([old, corrected]), NOW);
  assert.equal(ambiguous.snapshots[0].snapshot, corrected);
  assert.equal(ambiguous.conflicts[0].selectionBasis, "retained-order");
  assert.equal(ambiguous.conflicts[0].orderAmbiguous, true);
  assert.match(ambiguous.warnings.join(" "), /Retained order is provisional/);
});

test("canonical same-millisecond imports persist correction order and current currency follows the actual latest source", () => {
  const app = loadCanonicalWithFrozenClock();
  const payload = (days, revision) => ({ format:"WAKE_JSON_BACKUP", version:1, ship:"USS SAME MILLISECOND", exportedAt:"2026-09-29T12:00:00Z", ofrpPhase:"Basic Phase", months:["SEP 2026"], revision,
    officers:{ ALPHA:{ name:"ALPHA", rank:"LT", autoShipQual:true, autoDaysSince:days, hoursByWS:{ "OOD U/W":{ Q:20, UI:0 } }, detectedLogs:[], logScores:{}, rorTests:[] } }
  });
  const old = payload(5, "old");
  let corrected;
  for (let index = 0; index < 1000; index++) {
    const candidate = payload(95, "correction-" + index);
    if (app.sourceFingerprint(old) > app.sourceFingerprint(candidate)) { corrected = candidate; break; }
  }
  assert.ok(corrected, "fixture must force a later correction with a lexicographically smaller fingerprint");
  assert.equal(app.importWakeJson(JSON.stringify(old), "old.json").status, "Imported");
  assert.equal(app.importWakeJson(JSON.stringify(corrected), "correction.json").status, "Imported");
  const source = app.getState().ships[old.ship];
  assert.equal(source.snapshots.length, 2);
  assert.equal(source.snapshots[0].importedAt, source.snapshots[1].importedAt);
  assert.ok(source.snapshots[0].snapshotId > source.snapshots[1].snapshotId, "fixture must defeat the former lexical snapshot ID tie-break");
  assert.ok(source.snapshots[1].observationSequence > source.snapshots[0].observationSequence);
  assert.equal(app.commandTimeline(source, NOW).snapshots[0].snapshot.sourceFingerprint, source.sourceFingerprint);
  assert.equal(app.commandCurrent(source, NOW).roster[0].sourceCategory, "Loss");
  const restored = app.normalizeState(plain(app.getState())).ships[old.ship];
  restored.snapshots.reverse();
  assert.equal(app.commandTimeline(restored, NOW).snapshots[0].snapshot.sourceFingerprint, source.sourceFingerprint, "backup normalization and snapshot order must not undo a recorded correction");
});

test("canonical imports retain a ship's month-by-month watch activity after a newer report replaces current logs", () => {
  const app = loadCanonicalWithFrozenClock();
  const payload = (month, days, hours) => ({ format:"WAKE_JSON_BACKUP", version:1, ship:"USS ACTIVITY HISTORY", exportedAt:"2026-"+String(month).padStart(2,"0")+"-20T12:00:00Z", ofrpPhase:"Basic Phase", months:[["MAR","APR","MAY","JUN","JUL","AUG","SEP"][month-3]+" 2026"],
    officers:{ ALPHA:{ name:"ALPHA", rank:"LT", autoShipQual:true, autoDaysSince:days, hoursByWS:{ "OOD U/W":{ Q:hours, UI:0 } }, detectedLogs:[{ logId:"ACTIVITY-"+month, ws:"OOD U/W", type:"Watch Q", val:"Underway bridge watch", month:["MAR","APR","MAY","JUN","JUL","AUG","SEP"][month-3]+" 2026", watchDate:"2026-"+String(month).padStart(2,"0")+"-05T14:30:00Z", baseWatchLog:true, hrs:8, meta:{ baseWatchLog:true, watchOccurrenceKey:"ACTIVITY-"+month, watchDate:"2026-"+String(month).padStart(2,"0")+"-05T14:30:00Z" }, events:"Sea and Anchor Detail" }], logScores:{}, rorTests:[] } }
  });
  assert.equal(app.importWakeJson(JSON.stringify(payload(3,10,40)), "march.json").status, "Imported");
  assert.equal(app.importWakeJson(JSON.stringify(payload(9,95,80)), "september.json").status, "Imported");
  const source = app.getState().ships["USS ACTIVITY HISTORY"];
  assert.equal(source.logs.length, 1, "current logs still follow the latest authoritative report");
  assert.equal(source.activityHistory.length, 2, "the historical activity record remains available for the chart");
  const model = plain(app.commandShipActivityModel(source));
  assert.deepEqual(model.rows.map(row => row.key), ["2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09"]);
  assert.equal(model.rows[0].hours, 8);
  assert.equal(model.rows[6].hours, 8);
  assert.match(model.lastWatch.label, /2026-09-05T14:30:00Z/);
});

test("future, nonauthoritative, malformed-roster, and invalid-date snapshots cannot establish chronology", () => {
  const future = snapshot("2026-10-01T00:00:00Z", { A: officer("Alpha") });
  const support = snapshot("2026-01-01T00:00:00Z", { A: officer("Alpha") }, { authoritativeBridge: false });
  const invalid = snapshot("2026-02-30T00:00:00Z", { A: officer("Alpha") }, { importedAt: "2026-03-01T00:00:00Z" });
  const result = api.commandTimeline(ship([future, support, invalid, { sourceGeneratedAt: "2026-01-01" }]), NOW);
  assert.equal(result.snapshots.length, 0);
  assert.equal(result.undated.length, 1);
  assert.equal(result.excluded.length, 3);
  assert.equal(api.commandTimestamp("2026-02-30"), null);
  assert.equal(api.commandTimestamp("2026-02"), null);
  assert.equal(api.commandTimestamp("2026"), null);
  assert.equal(api.commandTimestamp("2025-02-29T01:00:00Z"), null);
  assert.equal(api.commandTimestamp("2024-02-29T01:00:00Z"), Date.parse("2024-02-29T01:00:00Z"));
});

test("roster additions and departures are separate from same-person currency and level changes", () => {
  const a = snapshot("2026-01-01", { A: officer("Alpha"), D: officer("Departed", "Loss", "3", 91) });
  const b = snapshot("2026-06-01", { A: officer("Alpha", "Loss", "2", 100), J: officer("Joined", "Loss", "3", 100) });
  const result = compare([a, b]);
  assert.equal(result.available, true);
  assert.equal(result.counts.lost, 1);
  assert.equal(result.counts.levelUp, 1);
  assert.equal(result.counts.joined, 1);
  assert.equal(result.counts.departed, 1);
  assert.equal(result.rows.lost[0].name, "Alpha");
  assert.equal(result.rows.joined[0].name, "Joined");
  assert.equal(result.rows.departed[0].name, "Departed");
  assert.equal(result.net.loss, 1);
});

test("unknown categories and blank levels never become invented losses, restoration, or level gains", () => {
  const a = snapshot("2026-01-01", { A: officer("Alpha", "Unknown", "", null), B: officer("Bravo", "Loss", "2", 91), C: officer("Charlie", "Current", "1", 10) });
  const b = snapshot("2026-02-01", { A: officer("Alpha", "Loss", "2", 100), B: officer("Bravo", "Unknown", "", null), C: officer("Charlie", "Need", "0", 50) });
  const result = compare([a, b]);
  assert.equal(result.counts.lost, 0);
  assert.equal(result.counts.restored, 0);
  assert.equal(result.counts.unknownCurrency, 2);
  assert.equal(result.counts.unknownLevel, 2);
  assert.equal(result.counts.levelUp, 0);
  assert.equal(result.counts.levelDown, 1);
  assert.equal(result.counts.requiresWatch, 1);
});

test("endpoint changes and gross observed transitions distinguish a loss followed by recovery", () => {
  const snapshots = [
    snapshot("2026-01-01", { A: officer("Alpha") }),
    snapshot("2026-03-01", { A: officer("Alpha", "Loss", "1", 100) }),
    snapshot("2026-05-01", { A: officer("Alpha", "Current", "1", 2) })
  ];
  const result = compare(snapshots);
  assert.equal(result.counts.lost, 0);
  assert.equal(result.counts.restored, 0);
  assert.equal(result.net.current, 0);
  assert.equal(result.observed.counts.lost, 1);
  assert.equal(result.observed.counts.restored, 1);
  assert.equal(result.observed.intervals.length, 2);
  assert.equal(result.observed.rows.lost[0].observedFrom, "2026-01-01T00:00:00.000Z");
  assert.equal(result.observed.rows.lost[0].observedAt, "2026-03-01T00:00:00.000Z");
});

test("last-30-day answer counts only transitions bounded by reports inside the window", () => {
  const snapshots = [
    snapshot("2026-08-01T12:00:00Z", { A: officer("Alpha", "Current", "1", 10) }),
    snapshot("2026-09-05T12:00:00Z", { A: officer("Alpha", "Current", "1", 10) }),
    snapshot("2026-09-20T12:00:00Z", { A: officer("Alpha", "Loss", "1", 100) }),
    snapshot("2026-09-29T12:00:00Z", { A: officer("Alpha", "Current", "2", 5) })
  ];
  const result = api.commandLast30Days(ship(snapshots), NOW);
  assert.equal(result.available, true);
  assert.equal(result.startDate, "2026-08-31");
  assert.equal(result.reports.length, 3);
  assert.equal(result.boundaryIntervals.length, 1, "August to September report pair crosses the window and must not be counted");
  assert.equal(result.counts.lost, 1);
  assert.equal(result.counts.restored, 1);
  assert.equal(result.counts.levelUp, 1);
  assert.equal(result.rows.lost[0].observedFrom, "2026-09-05T12:00:00.000Z");
  assert.equal(result.rows.lost[0].observedAt, "2026-09-20T12:00:00.000Z");
});

test("last-30-day answer says evidence is insufficient when the only pair crosses the boundary", () => {
  const result = api.commandLast30Days(ship([
    snapshot("2026-08-20T12:00:00Z", { A: officer("Alpha", "Current", "1", 10) }),
    snapshot("2026-09-20T12:00:00Z", { A: officer("Alpha", "Loss", "1", 100) })
  ]), NOW);
  assert.equal(result.available, false);
  assert.equal(result.counts.lost, 0, "a boundary-crossing difference is not a confirmed last-30-day loss");
  assert.equal(result.boundaryIntervals.length, 1);
  assert.match(result.reason, /crosses the boundary/);
});

test("command review leads with a direct, factual last-30-day answer", () => {
  const source = ship([
    snapshot("2026-09-05T12:00:00Z", { A: officer("Alpha") }, { fileName:"Sep-05.json" }),
    snapshot("2026-09-20T12:00:00Z", { A: officer("Alpha", "Loss", "1", 100) }, { fileName:"Sep-20.json" })
  ]);
  const { ui } = loadUi([source]);
  const workspace = ui.commandWorkspace();
  assert.match(workspace, /What changed in the last 30 days\?/);
  assert.match(workspace, /two dated reports entirely inside this window/);
  assert.ok(workspace.indexOf("What changed in the last 30 days?") < workspace.indexOf("Explore another period"));
  assert.match(ui.commandBriefHtml(), /What changed in the last 30 days\?/);
});

test("ship activity history keeps months chronological, exposes a selected past month, and shows the last recorded watch", () => {
  const source = ship([], { logs:[
    { month:"JUL 2026", watchDate:"2026-07-21T08:30:00Z", officer:"Alpha", watchstation:"OOD U/W", hours:4, events:"Man Overboard" },
    { month:"SEP 2026", watchDate:"2026-09-12T10:15:00Z", officer:"Bravo", watchstation:"OOD U/W", hours:6, specialConditions:"Heavy Weather" },
    { month:"SEP 2026", watchDate:"2026-09-29T14:45:00Z", officer:"Charlie", watchstation:"TAO", hours:2, events:"Man Overboard" }
  ] });
  const fleet = loadFleetViews([source]);
  let model = plain(fleet.commandShipActivityModel(source));
  assert.deepEqual(model.rows.map(row => row.key), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(model.rows[0].hours, 4);
  assert.equal(model.rows[1].hours, 0, "a gap remains selectable instead of being silently omitted");
  assert.equal(model.rows[2].hours, 8);
  assert.equal(model.rows[2].evolutions, 2);
  assert.match(model.lastWatch.label, /2026-09-29T14:45:00Z/);
  fleet.setActivityMonth("USS EVIDENCE", "2026-07");
  model = plain(fleet.commandShipActivityModel(source));
  assert.equal(model.selected.key, "2026-07");
  const html = fleet.commandShipActivityPanel(source);
  assert.match(html, /Hours logged and evolutions conducted/);
  assert.match(html, /Last watch conducted/);
  assert.match(html, /Man Overboard/);
});

test("requested dates select real source observations at or before each boundary", () => {
  const snapshots = [snapshot("2026-01-01", { A: officer("Alpha") }), snapshot("2026-03-15", { A: officer("Alpha", "Loss", "1", 92) }), snapshot("2026-07-01", { A: officer("Alpha") })];
  const result = compare(snapshots, { from: "2026-02-01", to: "2026-05-01" });
  assert.equal(result.baseline.date, "2026-01-01");
  assert.equal(result.end.date, "2026-03-15");
  assert.equal(result.requestedFrom, "2026-02-01");
  assert.equal(result.requestedTo, "2026-05-01");
  assert.equal(compare(snapshots, { from: "2025-12-01" }).available, false);
  assert.equal(compare(snapshots, { from: "2026-08-01" }).available, false);
  assert.equal(compare(snapshots, { from: "2026-07-01", to: "2026-01-01" }).available, false);
});

test("previous comparison uses previous source observation and rolling periods handle month-end dates", () => {
  const snapshots = [snapshot("2026-02-28", { A: officer("Alpha") }), snapshot("2026-03-10", { A: officer("Alpha") }), snapshot("2026-05-31", { A: officer("Alpha", "Need", "1", 60) })];
  const previous = compare(snapshots, { mode: "previous", to: "2026-05-31" });
  assert.equal(previous.baseline.date, "2026-03-10");
  const rolling = compare(snapshots, { mode: "3m", to: "2026-05-31" });
  assert.equal(rolling.requestedFrom, "2026-02-28");
  assert.equal(rolling.baseline.date, "2026-02-28");
});

test("monthly history emits every month with missing evidence and assigns changes to observed month", () => {
  const snapshots = [snapshot("2026-01-01", { A: officer("Alpha") }), snapshot("2026-03-15", { A: officer("Alpha", "Loss", "2", 100) }), snapshot("2026-03-25", { A: officer("Alpha", "Current", "2", 1) })];
  const result = api.commandMonthly(ship(snapshots), "2026-01-01", "2026-04-30", NOW);
  assert.deepEqual(plain(result.months.map(row => row.month)), ["2026-01", "2026-02", "2026-03", "2026-04"]);
  assert.equal(result.months[1].hasObservation, false);
  assert.equal(result.months[1].metrics, null);
  assert.match(result.months[1].caveat, /unknown/);
  assert.equal(result.months[2].snapshot.date, "2026-03-25");
  assert.equal(result.months[2].counts.lost, 1);
  assert.equal(result.months[2].counts.restored, 1);
  assert.equal(result.months[2].counts.levelUp, 1);
  assert.equal(result.months[2].gap, true);
  assert.equal(result.months[2].metrics.current, 1);
  assert.equal(result.months[0].baselineOnly, true);
  assert.equal(result.months[0].hasComparison, false);
  assert.match(result.months[0].caveat, /unknown, not zero/);
  assert.equal(result.months[2].hasComparison, true);
  assert.equal(result.months[2].intervalCount, 2);
});

test("monthly history rejects oversized ranges explicitly and includes all months within its limit", () => {
  const huge = api.commandMonthly(ship([]), "1000-01-01", "9999-12-31", NOW);
  assert.equal(huge.available, false);
  assert.equal(huge.months.length, 0);
  assert.match(huge.reason, /1,200 months/);
  const century = api.commandMonthly(ship([]), "1900-01-01", "1999-12-31", NOW);
  assert.equal(century.available, true);
  assert.equal(century.months.length, 1200);
  assert.equal(century.months[1199].month, "1999-12");
  assert.equal(api.commandMonthly(ship([]), "2026-02", "2026-03-31", NOW).available, false);
});

test("monthly transitions disclose a baseline outside the requested reporting window", () => {
  const result = api.commandMonthly(ship([snapshot("2026-01-31", { A: officer("Alpha") }), snapshot("2026-02-05", { A: officer("Alpha", "Need", "1", 50) })]), "2026-02-01", "2026-02-28", NOW);
  assert.equal(result.months[0].counts.requiresWatch, 1);
  assert.equal(result.months[0].gap, true);
  assert.equal(result.months[0].rows.requiresWatch[0].fromDate, "2026-01-31");
});

test("current currency ages days from latest source, respecting exact 45 and greater-than-90 thresholds", () => {
  const newest = snapshot("2026-09-29T12:00:00Z", { A: officer("Alpha", "Current", "1", 44), B: officer("Bravo", "Need", "2", 89), C: officer("Charlie", "Need", "3", 90), D: officer("Delta", "Current", "1", null) });
  const backfill = snapshot("2026-01-01", { A: officer("Alpha", "Loss", "0", 100) }, { importedAt: "2026-09-30T11:00:00Z" });
  const result = api.commandCurrent(ship([newest, backfill]), NOW);
  assert.equal(result.sourceDate, "2026-09-29");
  assert.equal(result.ageDays, 1);
  assert.equal(result.counts.need, 2);
  assert.equal(result.counts.loss, 1);
  assert.equal(result.counts.unknown, 1);
  assert.deepEqual(plain(result.roster.map(row => [row.days, row.category, row.level])), [[45, "Need", "1"], [90, "Need", "2"], [91, "Loss", "3"], [null, "Unknown", "1"]]);
});

test("undated source status is retained as evidence but cannot establish today's currency", () => {
  const result = api.commandCurrent(ship([snapshot("", { A: officer("Alpha", "Current", "2", 1), B: officer("Bravo", "Loss", "1", 120) }, { importedAt: "2026-09-30" })]), NOW);
  assert.equal(result.available, false);
  assert.equal(result.counts.current, 0);
  assert.equal(result.counts.loss, 0);
  assert.equal(result.counts.unknown, 2);
  assert.equal(result.roster[0].sourceCategory, "Current");
  assert.equal(result.roster[0].level, "2");
  assert.equal(result.ageDays, null);
});

test("newer undated uploads cannot silently replace a dated current projection or roster", () => {
  const dated = snapshot("2026-09-29T12:00:00Z", { A: officer("Alpha", "Current", "1", 44) });
  const undated = snapshot("", { B: officer("Bravo", "Current", "3", 1) }, { importedAt: "2026-09-30T11:00:00Z" });
  const result = api.commandCurrent(ship([dated, undated], { officers: undated.officerStates }), NOW);
  assert.equal(result.undatedConflict, true);
  assert.equal(result.newerUndated.length, 1);
  assert.equal(result.roster.length, 1);
  assert.equal(result.roster[0].name, "Alpha");
  assert.equal(result.roster[0].category, "Need");
  assert.equal(result.roster[0].level, "1");
  assert.match(result.caveats.join(" "), /membership and intervening status are unverified/);
  const olderUndated = Object.assign({}, undated, { importedAt: "2026-08-01T00:00:00Z" });
  assert.equal(api.commandCurrent(ship([dated, olderUndated]), NOW).undatedConflict, false);
});

test("a future snapshot is excluded from current projection and end-date comparison", () => {
  const past = snapshot("2026-09-29T12:00:00Z", { A: officer("Alpha", "Current", "1", 44) });
  const future = snapshot("2026-10-01T12:00:00Z", { A: officer("Alpha", "Current", "3", 0) });
  const current = api.commandCurrent(ship([future, past]), NOW);
  assert.equal(current.sourceDate, "2026-09-29");
  assert.equal(current.roster[0].category, "Need");
  assert.equal(current.roster[0].level, "1");
  assert.equal(compare([past, future], { to: "2026-12-31" }).available, false);
});

test("current aging cannot manufacture recovery from contradictory source category and days", () => {
  const result = api.commandCurrent(ship([snapshot("2026-09-29T12:00:00Z", { A: officer("Alpha", "Loss", "1", 0), B: officer("Bravo", "Need", "1", 0) })]), NOW);
  assert.equal(result.counts.loss, 1);
  assert.equal(result.counts.need, 1);
  assert.equal(result.counts.current, 0);
});

test("snapshot metrics and chronology are immutable and independent from changed live logs and roster", () => {
  const source = ship([snapshot("2026-01-01", { A: officer("Alpha") }), snapshot("2026-03-01", { A: officer("Alpha", "Need", "2", 60) })], { officers: { X: officer("Unrelated live officer", "Loss", "3", 100) }, logs: [{ hours: 9999 }] });
  const serialized = JSON.stringify(source);
  deepFreeze(source);
  const result = api.commandCompare(source, { nowISO: NOW });
  api.commandMonthly(source, "2026-01-01", "2026-03-31", NOW);
  api.commandCurrent(source, NOW);
  assert.equal(JSON.stringify(source), serialized);
  assert.equal(result.after.officerCount, 1);
  assert.equal(result.after.totalHours, 70);
  assert.equal(result.after.need, 1);
  assert.equal(result.after.loss, 0);
});

test("empty authoritative rosters remain observations and identify departures without currency improvement", () => {
  const result = compare([snapshot("2026-01-01", { A: officer("Alpha", "Loss", "2", 100) }), snapshot("2026-03-01", {})]);
  assert.equal(result.available, true);
  assert.equal(result.after.officerCount, 0);
  assert.equal(result.counts.departed, 1);
  assert.equal(result.counts.restored, 0);
  assert.equal(result.net.loss, -1);
});

test("UI consumes engine gross changes and missing months without confusing them with endpoint totals", () => {
  const source = ship([
    snapshot("2026-01-01", { A: officer("Alpha") }, { fileName: "January.json" }),
    snapshot("2026-03-15", { A: officer("Alpha", "Loss", "1", 100) }, { fileName: "March.json" }),
    snapshot("2026-05-22", { A: officer("Alpha", "Current", "2", 1) }, { fileName: "May.json" })
  ]);
  const { ui } = loadUi([source]);
  const model = ui.commandReviewModel();
  assert.equal(model.counts.lost, 1);
  assert.equal(model.counts.restored, 1);
  assert.equal(model.entries[0].comparison.net.current, 0);
  const months = ui.commandMonthRows(model);
  assert.equal(months.length, 9);
  assert.equal(months[1].ships, 0);
  assert.equal(typeof months[2].observations, "number");
  assert.equal(months[2].observations, 1);
  const monthlyHtml = ui.commandMonthlyPanel(model);
  const baselineRow = monthlyHtml.match(/<tr><td>2026-01<\/td>[\s\S]*?<\/tr>/)[0];
  assert.match(baselineRow, /<td>—<\/td>/, "first snapshot cannot establish zero monthly changes");
  const workspace = ui.commandWorkspace();
  assert.match(workspace, /January\.json/);
  assert.match(workspace, /March\.json/);
  assert.match(workspace, /No report/);
});

test("CO brief and evidence CSV keep named observations, source files, and unmatched roster changes distinct", () => {
  const source = ship([
    snapshot("2026-01-01", { A: officer("Alpha <evidence>"), D: officer("Departed", "Loss", "3", 100) }, { fileName: "base<&>.json" }),
    snapshot("2026-03-15", { A: officer("Alpha <evidence>", "Loss", "2", 100), J: officer("Joined", "Loss", "3", 100) }, { fileName: "later.json" })
  ]);
  const { ui, captures } = loadUi([source]);
  const brief = ui.commandBriefHtml();
  assert.match(brief, /Alpha &lt;evidence&gt;/);
  assert.match(brief, /base&lt;&amp;&gt;\.json/);
  assert.doesNotMatch(brief, /Alpha <evidence>/);
  ui.commandExportCsv();
  assert.equal(captures.length, 1);
  const csv = captures[0].text;
  assert.match(csv, /"TRANSITION","USS EVIDENCE","Alpha <evidence>","Lost currency","Current","Loss","2026-01-01T00:00:00.000Z","2026-03-15T00:00:00.000Z","base<&>\.json","later\.json"/);
  assert.doesNotMatch(csv, /"TRANSITION","USS EVIDENCE","Joined","Lost currency"/);
  assert.match(csv, /"TRANSITION","USS EVIDENCE","Joined","Added to roster"/);
});

test("source register remains reviewable when rejected snapshot records are malformed", () => {
  const { ui } = loadUi([ship([null, snapshot("2026-01-01", { A: officer("Alpha") })])]);
  assert.doesNotThrow(() => ui.commandSourcesPanel(ui.commandReviewModel()));
});
