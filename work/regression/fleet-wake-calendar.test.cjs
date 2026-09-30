const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const enginePath = path.resolve(__dirname, "../progression/command-progress-engine.js");
const calendarPath = path.resolve(__dirname, "../progression/calendar-comparison.js");
const context = vm.createContext({ Date });
vm.runInContext(fs.readFileSync(enginePath, "utf8") + "\n" + fs.readFileSync(calendarPath, "utf8") + "\nthis.api = { commandCalendarMonth, commandCalendarPreviousMonth, commandCalendarMonthLabel, commandCalendarMonths, commandCalendarCompare, commandCalendarFleet };", context);
const api = context.api;
const NOW = "2026-09-30T12:00:00Z";
const plain = value => JSON.parse(JSON.stringify(value));
function officer(name, currencyCategory = "Current", level = "1") {
  return { name, rank: "LT", currencyCategory, level, daysSinceWatch: currencyCategory === "Loss" ? 95 : currencyCategory === "Need" ? 60 : 10, cumulativeBridgeHours: 100, totalQHrs: 80, totalUIHrs: 20 };
}
function snapshot(date, officerStates, extras = {}) {
  return Object.assign({ sourceGeneratedAt: date, importedAt: date, authoritativeBridge: true, officerStates }, extras);
}
function ship(snapshots, name = "USS MONTHLY") { return { name, snapshots }; }
function compare(snapshots, options = {}) { return api.commandCalendarCompare(ship(snapshots), Object.assign({ nowISO: NOW }, options)); }

test("calendar helpers validate months and roll the baseline across a year boundary", () => {
  assert.equal(api.commandCalendarMonth("2026-09"), "2026-09");
  ["2026-9", "2026-13", "2026-00", "0000-01", "SEP 2026", "2026-09-30"].forEach(month => assert.equal(api.commandCalendarMonth(month), ""));
  assert.equal(api.commandCalendarPreviousMonth("2026-09"), "2026-08");
  assert.equal(api.commandCalendarPreviousMonth("2026-01"), "2025-12");
  assert.equal(api.commandCalendarMonthLabel("2026-09"), "September 2026");
});

test("September compares to August rather than the prior September import", () => {
  const august = snapshot("2026-08-25T12:00:00Z", { A: officer("Alpha") });
  const septemberFirst = snapshot("2026-09-02T12:00:00Z", { A: officer("Alpha", "Loss") });
  const septemberLast = snapshot("2026-09-26T12:00:00Z", { A: officer("Alpha", "Loss", "2") });
  const result = compare([septemberLast, august, septemberFirst]);
  assert.equal(result.available, true);
  assert.equal(result.month, "2026-09");
  assert.equal(result.baselineMonth, "2026-08");
  assert.equal(result.baseline.date, "2026-08-25");
  assert.equal(result.end.date, "2026-09-26");
  assert.equal(result.counts.lost, 1);
  assert.equal(result.counts.levelUp, 1);
  assert.equal(result.period.reportCount, 2);
});

test("multiple exports use only the latest source observation within each selected month", () => {
  const result = compare([
    snapshot("2026-08-03", { A: officer("Alpha", "Loss") }),
    snapshot("2026-08-28", { A: officer("Alpha") }),
    snapshot("2026-09-03", { A: officer("Alpha", "Loss") }),
    snapshot("2026-09-28", { A: officer("Alpha") })
  ]);
  assert.equal(result.available, true);
  assert.equal(result.baseline.date, "2026-08-28");
  assert.equal(result.end.date, "2026-09-28");
  assert.equal(result.counts.lost, 0);
  assert.equal(result.counts.restored, 0);
  assert.equal(result.baselinePeriod.reportCount, 2);
  assert.equal(result.period.reportCount, 2);
});

test("an absent baseline month stays unavailable even when an earlier month exists", () => {
  const result = compare([
    snapshot("2026-07-31", { A: officer("Alpha") }),
    snapshot("2026-09-28", { A: officer("Alpha", "Loss") })
  ]);
  assert.equal(result.available, false);
  assert.equal(result.baseline, null);
  assert.equal(result.before, null);
  assert.equal(result.after.loss, 1);
  assert.equal(result.net, null);
  assert.match(result.reason, /August 2026/);
});

test("an absent selected month does not reuse the latest prior report", () => {
  const result = compare([snapshot("2026-08-28", { A: officer("Alpha") })]);
  assert.equal(result.available, false);
  assert.equal(result.end, null);
  assert.equal(result.after, null);
  assert.equal(result.before.current, 1);
  assert.match(result.reason, /September 2026/);
});

test("a selectable earlier baseline month compares its endpoint with the selected month", () => {
  const result = compare([
    snapshot("2026-06-28", { A: officer("Alpha", "Loss", "1") }),
    snapshot("2026-08-28", { A: officer("Alpha", "Loss", "2") }),
    snapshot("2026-09-28", { A: officer("Alpha", "Current", "3") })
  ], { baselineMonth: "2026-06" });
  assert.equal(result.available, true);
  assert.equal(result.baseline.date, "2026-06-28");
  assert.equal(result.counts.restored, 1);
  assert.equal(result.counts.levelUp, 1, "one person improved; level steps are not separate people");
});

test("calendar endpoint changes separate loss, restored, proficiency, and roster movement", () => {
  const result = compare([
    snapshot("2026-08-28", { A: officer("Alpha"), B: officer("Bravo", "Loss", "2"), C: officer("Charlie") }),
    snapshot("2026-09-28", { A: officer("Alpha", "Loss", "2"), B: officer("Bravo", "Current", "1"), D: officer("Delta", "Loss") })
  ]);
  assert.equal(result.counts.lost, 1, "a newly arrived person with Loss is a roster change, not a new loss");
  assert.equal(result.counts.restored, 1);
  assert.equal(result.counts.levelUp, 1);
  assert.equal(result.counts.levelDown, 1);
  assert.equal(result.counts.joined, 1);
  assert.equal(result.counts.departed, 1);
  assert.equal(result.matchedPeople, 2);
  assert.equal(result.net.loss, 1);
  assert.equal(result.rows.lost[0].fromDate, "2026-08-28");
  assert.equal(result.rows.lost[0].toDate, "2026-09-28");
});

test("a later upload of an August backfill remains an August observation", () => {
  const august = snapshot("2026-08-28", { A: officer("Alpha") }, { importedAt: "2026-09-30T11:00:00Z" });
  const september = snapshot("2026-09-28", { A: officer("Alpha", "Loss") }, { importedAt: "2026-09-29T12:00:00Z" });
  const result = compare([september, august]);
  assert.equal(result.available, true);
  assert.equal(result.baseline.snapshot, august);
  assert.equal(result.end.snapshot, september);
  assert.equal(result.counts.lost, 1);
});

test("undated, invalid-date, future and nonauthoritative exports cannot fill a calendar month", () => {
  const result = compare([
    snapshot("", { A: officer("Alpha") }, { importedAt: "2026-08-28" }),
    snapshot("2026-08-32", { A: officer("Alpha") }, { importedAt: "2026-08-28" }),
    snapshot("2026-08-28", { A: officer("Alpha") }, { authoritativeBridge: false }),
    snapshot("2026-09-30T23:00:00Z", { A: officer("Alpha", "Loss") })
  ]);
  assert.equal(result.available, false);
  assert.equal(result.baseline, null);
  assert.equal(result.end, null);
  assert.equal(result.timeline.undated.length, 2);
});

test("same-time source corrections use the engine's selected authoritative version", () => {
  const original = snapshot("2026-08-28T12:00:00Z", { A: officer("Alpha", "Loss") }, { importedAt: "2026-09-01T12:00:00Z", observationSequence: 1, sourceFingerprint: "original" });
  const corrected = snapshot("2026-08-28T12:00:00Z", { A: officer("Alpha") }, { importedAt: "2026-09-01T12:00:00Z", observationSequence: 2, sourceFingerprint: "corrected" });
  const result = compare([corrected, original, snapshot("2026-09-28", { A: officer("Alpha", "Loss") })]);
  assert.equal(result.baseline.snapshot, corrected);
  assert.equal(result.baseline.corrected, true);
  assert.equal(result.counts.lost, 1);
});

test("unknown currency and unknown levels do not become affirmative changes", () => {
  const result = compare([
    snapshot("2026-08-28", { A: { name: "Alpha", currencyCategory: "Unknown", level: "" } }),
    snapshot("2026-09-28", { A: officer("Alpha", "Loss", "2") })
  ]);
  assert.equal(result.counts.lost, 0);
  assert.equal(result.counts.levelUp, 0);
  assert.equal(result.counts.unknownCurrency, 1);
  assert.equal(result.counts.unknownLevel, 1);
});

test("month options reject same-month and reverse-month comparisons", () => {
  ["2026-09", "2026-10"].forEach(baselineMonth => {
    const result = compare([], { month: "2026-09", baselineMonth });
    assert.equal(result.available, false);
    assert.match(result.reason, /before/);
  });
  assert.match(compare([], { month: "2026-13" }).reason, /valid calendar/);
});

test("available month choices follow source chronology and remove duplicate months", () => {
  const source = ship([
    snapshot("2026-09-28", {}), snapshot("2026-08-28", {}), snapshot("2026-08-03", {}),
    snapshot("", {}, { importedAt: "2026-07-28" }), snapshot("2026-10-02", {})
  ]);
  assert.deepEqual(plain(api.commandCalendarMonths(source, NOW)), ["2026-08", "2026-09"]);
});

test("fleet comparison reports coverage and totals only ships with both selected months", () => {
  const covered = ship([snapshot("2026-08-28", { A: officer("Alpha") }), snapshot("2026-09-28", { A: officer("Alpha", "Loss") })], "USS COVERED");
  const missing = ship([snapshot("2026-09-28", { B: officer("Bravo", "Loss") })], "USS MISSING");
  const result = api.commandCalendarFleet([covered, missing], { nowISO: NOW });
  assert.equal(result.available, true);
  assert.equal(result.shipCount, 2);
  assert.equal(result.comparedShipCount, 1);
  assert.equal(result.missingShipCount, 1);
  assert.equal(result.counts.lost, 1);
  assert.equal(result.after.officerCount, 1, "unmatched ships are excluded from paired totals");
  assert.equal(result.changes.lost[0].shipName, "USS COVERED");
  assert.equal(result.rows[1].comparison.after.loss, 1, "an unmatched ship can still show its individual known month status");
});

test("fleet comparison without paired month evidence is unavailable rather than zero change", () => {
  const result = api.commandCalendarFleet([ship([snapshot("2026-09-28", { A: officer("Alpha") })])], { nowISO: NOW });
  assert.equal(result.available, false);
  assert.equal(result.before, null);
  assert.equal(result.after, null);
  assert.equal(result.net, null);
  const invalid = api.commandCalendarFleet([ship([])], { nowISO: NOW, month: "2026-13" });
  assert.equal(invalid.available, false);
  assert.equal(invalid.rows[0].comparison.month, "");
  assert.match(invalid.rows[0].comparison.reason, /valid calendar/);
});
