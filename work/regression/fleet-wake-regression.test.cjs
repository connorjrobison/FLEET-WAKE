const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const target = path.join(root, process.env.FLEET_WAKE_TARGET || "FLEET_WAKE_board_reviewed.html");
const html = fs.readFileSync(target, "utf8");
const wakeReferenceHtml = fs.readFileSync(path.join(root, "WAKE", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const appScript = scripts.at(-1);

function loadAppApi() {
  const marker = /\nboot\(\);\s*\n\}\)\(\);\s*$/;
  assert.match(appScript, marker, "app script should end with the normal boot call");
  const instrumented = appScript.replace(marker, `
globalThis.__fleetWakeTest = {
  COACH_STEPS,
  FLEET_EVENT_CATALOG,
  FLEET_SPECIAL_CONDITION_CATALOG,
  normalizeState,
  shipDataPosture,
  fleetDataQuality,
  latestSnapshotPair,
  sourceFingerprint,
  hasComparableAuthoritativeSnapshots,
  parseWakeJsonPayload,
  importWakeJson,
  importRows,
  parseCSV,
  wakeJsonOfficerLevel,
  wakeJsonRequirementMatches,
  officerCurrencyAsOf,
  officerLevelLabel,
  shipMetrics,
  watchstanderComparisonStatus,
  phaseBenchmarkCell,
  splitEvolutionValues,
  evolutionRowsForLogs,
  evolutionSummary,
  evolutionCoverageBand,
  evolutionCoverageLegend,
  evolutionChart,
  evolutionTable,
  shipEvolutionPanel,
  filteredLogCsvRow,
  allFleetCsvRows,
  currentStatusReportHtml,
  getState: () => state,
  setState: value => { state = normalizeState(value); }
};
})();`);
  const context = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    Intl,
    document:{ getElementById:() => null },
    window:{},
    navigator:{},
    localStorage:{ getItem:() => null, setItem:() => {}, removeItem:() => {} }
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename:"FLEET_WAKE.inline.js" });
  return context.__fleetWakeTest;
}

function wakePayload({ ship="USS TEST DDG 99", officer="TEST, OFFICER", exportedAt="2026-07-01T12:00:00Z", logId="TEST-1", qHours=82, score="" } = {}) {
  return {
    format:"WAKE_JSON_BACKUP",
    version:1,
    exportedAt,
    ship,
    months:["JUL 2026"],
    ofrpPhase:"Basic Phase",
    officers:{
      [officer]:{
        name:officer,
        rank:"LT",
        autoShipQual:true,
        autoDaysSince:12,
        hoursByWS:{ "OOD U/W":{ Q:qHours, UI:6 } },
        detectedLogs:[{ logId, ws:"OOD U/W", type:"Q", val:"Underway bridge watch", month:"JUL 2026", daysAgo:12 }],
        logScores:score === "" ? {} : { [logId]:score },
        rorTests:[{ date:"2026-07-01", score:95 }]
      }
    }
  };
}

test("single-file Fleet WAKE scripts parse", () => {
  assert.equal(scripts.length, 2);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} should parse`));
});

test("WAKE Fleet keeps the WAKE-matched shell and welcome hierarchy", () => {
  for (const contract of [
    "id=\"wake-startup-overlay\"",
    "class=\"wake-startup-card\"",
    "class=\"wake-top-controls\"",
    "class=\"wake-main-nav\"",
    "id=\"fleet-welcome-overlay\"",
    "Welcome to WAKE Fleet",
    "Interactive Walkthrough",
    "Begin WAKE Fleet"
  ]) assert.ok(html.includes(contract), `missing shell contract: ${contract}`);
});

test("Start Here includes a full-page Evolutions workspace", () => {
  const startHere = html.slice(html.indexOf("function homeCommandRibbon()"), html.indexOf("function ribbonButton("));
  assert.match(startHere, /id=\\"admin-evolutions-btn\\"[^>]*data-view=\\"evolutions\\">Evolutions/);
  assert.equal((startHere.match(/id=\\"admin-evolutions-btn\\"/g) || []).length, 1);
  assert.match(html, /<section id="view-evolutions" class="view hidden"><\/section>/);
  assert.match(html, /function renderEvolutions\(\)/);
  assert.match(html, /renderEvolutions\(\);/);
  assert.match(html, /topbar\("Evolutions"/);
});

test("evolution aggregation counts every named item once per watch and keeps latest dates", () => {
  const api = loadAppApi();
  const logs = [
    { ship:"USS ALPHA DDG 10", events:"Sea and Anchor Detail", specialConditions:"", watchDate:"2026-07-10" },
    { ship:"USS ALPHA DDG 10", events:"sea and anchor detail", specialConditions:"Low Visibility", watchDate:"2026-07-21" },
    { ship:"USS BRAVO DDG 20", events:"Sea and Anchor Detail; Man Overboard Recovery", specialConditions:"Man Overboard Recovery", dateLogged:"22", month:"JUL 2026" },
    { ship:"USS BRAVO DDG 20", events:"None", specialConditions:"N/A", watchDate:"2026-07-23" },
    { ship:"USS CHARLIE DDG 30", events:"", specialConditions:"", watchDate:"2026-07-23" }
  ];
  const summary = api.evolutionSummary(logs);
  const byKey = Object.fromEntries(summary.rows.map(row => [row.key, row]));
  assert.equal(summary.unique, 3);
  assert.equal(summary.total, 5);
  assert.equal(summary.eventRecords, 4);
  assert.equal(summary.specialConditionRecords, 2);
  assert.equal(summary.shipCount, 3);
  assert.equal(summary.shipsWithEvolution, 2);
  assert.equal(summary.average, 5 / 3);
  assert.equal(summary.eventAverage, 4 / 3);
  assert.equal(summary.specialConditionAverage, 2 / 3);
  assert.equal(summary.latestDate, "22 JUL 2026");
  assert.equal(byKey["SEA AND ANCHOR DETAIL"].count, 3);
  assert.equal(byKey["SEA AND ANCHOR DETAIL"].average, 1);
  assert.equal(byKey["SEA AND ANCHOR DETAIL"].shipCount, 2);
  assert.ok(Math.abs(byKey["SEA AND ANCHOR DETAIL"].coveragePct - (200 / 3)) < 1e-9);
  assert.equal(byKey["SEA AND ANCHOR DETAIL"].coverageKey, "partial");
  assert.equal(byKey["SEA AND ANCHOR DETAIL"].latestDate, "22 JUL 2026");
  assert.equal(byKey["MAN OVERBOARD RECOVERY"].count, 1);
  assert.equal(byKey["MAN OVERBOARD RECOVERY"].eventCount, 1);
  assert.equal(byKey["MAN OVERBOARD RECOVERY"].specialConditionCount, 1);
  assert.equal(byKey["LOW VISIBILITY"].count, 1);
  assert.deepEqual(
    Array.from(api.splitEvolutionValues("Night; Restricted Waters\nLow Visibility")),
    ["Night","Restricted Waters","Low Visibility"]
  );
});

test("Evolutions uses one combined chart with all-ship averages immediately below", () => {
  const api = loadAppApi();
  const rows = [
    { label:"Sea and Anchor Detail", count:4, average:1, coveragePct:50, shipCount:2, eventCount:4, specialConditionCount:0, latestDate:"22 JUL 2026" },
    { label:"Low Visibility", count:2, average:.5, coveragePct:25, shipCount:1, eventCount:0, specialConditionCount:2, latestDate:"21 JUL 2026" }
  ];
  const chart = api.evolutionChart(rows, 4);
  assert.match(chart, /class="evolution-chart-frame"/);
  assert.match(chart, /class="evolution-chart-plot" style="--evolution-columns:2"/);
  assert.equal((chart.match(/class="evolution-chart-column"/g) || []).length, 2);
  assert.equal((chart.match(/class="evolution-chart-column-value"/g) || []).length, 2);
  assert.match(chart, /class="evolution-chart-column" style="--evolution-height:100%"/);
  assert.match(chart, /class="evolution-chart-column-value" aria-hidden="true">1\.0<\/span>/);
  assert.match(chart, /class="evolution-chart-column-value" aria-hidden="true">0\.5<\/span>/);
  assert.match(chart, /Sea and Anchor Detail: 1\.0 average records per ship; 50% ship coverage; Partial Coverage/);
  assert.match(chart, /evolution-coverage-partial/);
  assert.match(chart, /evolution-coverage-limited/);
  assert.match(chart, /Averages use all 4 imported ships/);
  assert.match(chart, /Average values and dates are listed below/);
  assert.doesNotMatch(chart, /evolution-chart-row|evolution-chart-track/);
  assert.match(api.evolutionTable(rows, true, 4), /Average \/ Ship/);
  assert.match(api.evolutionTable(rows, true, 4), /Ship Coverage/);
  assert.match(api.evolutionTable(rows, true, 4), /2 of 4 \| 50%/);

  const renderSource = html.slice(html.indexOf("function renderEvolutions()"), html.indexOf("function sortRows("));
  const chartIndex = renderSource.indexOf("evolutionChart(summary.rows, summary.shipCount)");
  const numbersIndex = renderSource.indexOf("Evolution Averages");
  const tableIndex = renderSource.indexOf("evolutionTable(summary.rows, true, summary.shipCount)");
  assert.ok(chartIndex >= 0 && numbersIndex > chartIndex && tableIndex > numbersIndex);
  assert.match(renderSource, /evolutionSummary\(allLogs\(\), allShips\(\)\.length, true\)/);
  assert.match(renderSource, /red at 0%, orange from 1-49%, yellow from 50-94%, and green at 95% or greater/);
  assert.match(html, /linear-gradient\(180deg,var\(--evolution-none-from\),var\(--evolution-none-to\)\)/);
  assert.match(html, /linear-gradient\(180deg,var\(--evolution-partial-from\),var\(--evolution-partial-to\)\)/);
  assert.match(html, /linear-gradient\(180deg,var\(--evolution-fleet-from\),var\(--evolution-fleet-to\)\)/);
});

test("evolution catalog keeps zero-completion rows and applies exact coverage thresholds", () => {
  const api = loadAppApi();
  assert.equal(api.FLEET_EVENT_CATALOG.length, 68);
  assert.equal(api.FLEET_SPECIAL_CONDITION_CATALOG.length, 10);
  assert.equal(new Set(api.FLEET_EVENT_CATALOG.concat(api.FLEET_SPECIAL_CONDITION_CATALOG).map(value => value.toUpperCase())).size, 72);

  const summary = api.evolutionSummary([
    { ship:"USS ALPHA DDG 10", events:"Anchoring", specialConditions:"", watchDate:"2026-07-10" }
  ], 2, true);
  const byKey = Object.fromEntries(summary.rows.map(row => [row.key, row]));
  assert.equal(summary.unique, 72);
  assert.equal(summary.observedCount, 1);
  assert.equal(summary.coverageCounts.none, 71);
  assert.equal(summary.coverageCounts.partial, 1);
  assert.equal(byKey["ANCHORING"].average, .5);
  assert.equal(byKey["ANCHORING"].coveragePct, 50);
  assert.equal(byKey["ANCHORING"].coverageKey, "partial");
  assert.equal(byKey["GENERAL QUARTERS DAY"].count, 0);
  assert.equal(byKey["GENERAL QUARTERS DAY"].average, 0);
  assert.equal(byKey["GENERAL QUARTERS DAY"].coverageKey, "none");

  assert.equal(api.evolutionCoverageBand(0).key, "none");
  assert.equal(api.evolutionCoverageBand(49.99).key, "limited");
  assert.equal(api.evolutionCoverageBand(50).key, "partial");
  assert.equal(api.evolutionCoverageBand(94.99).key, "partial");
  assert.equal(api.evolutionCoverageBand(95).key, "fleet");
  assert.equal(api.evolutionCoverageBand(100).key, "fleet");

  const thresholdChart = api.evolutionChart([
    { label:"Zero", average:0, coveragePct:0, shipCount:0 },
    { label:"Limited", average:.25, coveragePct:25, shipCount:1 },
    { label:"Half", average:.5, coveragePct:50, shipCount:2 },
    { label:"Fleet", average:.95, coveragePct:95, shipCount:19 }
  ], 20);
  for (const key of ["none","limited","partial","fleet"]) {
    assert.match(thresholdChart, new RegExp(`evolution-coverage-${key}`));
  }
  assert.match(thresholdChart, /class="evolution-chart-column-value" aria-hidden="true">0\.0<\/span>/);
  assert.match(thresholdChart, /data-coverage="none" style="--evolution-height:4%"/);

  const legend = api.evolutionCoverageLegend(summary);
  assert.match(legend, /Not Observed/);
  assert.match(legend, /0% of ships/);
  assert.match(legend, /Limited Coverage/);
  assert.match(legend, /Partial Coverage/);
  assert.match(legend, /Fleet-Wide/);
});

test("ship profiles show evolution counts and the last conducted date", () => {
  const api = loadAppApi();
  const ship = {
    name:"USS ALPHA DDG 10",
    logs:[
      { ship:"USS ALPHA DDG 10", watchstation:"OOD U/W", events:"Sea and Anchor Detail", watchDate:"2026-07-10" },
      { ship:"USS ALPHA DDG 10", watchstation:"OOD U/W", events:"Sea and Anchor Detail", specialConditions:"Low Visibility", watchDate:"2026-07-21" }
    ]
  };
  const panel = api.shipEvolutionPanel(ship);
  assert.match(panel, /Evolution Activity/);
  assert.match(panel, /Times Recorded/);
  assert.match(panel, /Last Conducted/);
  assert.match(panel, /2026-07-21/);
  assert.match(panel, /Sea and Anchor Detail/);
  assert.match(panel, /Low Visibility/);
  assert.match(panel, /Count<\/th><th>Last Date/);
});

test("Fleet startup mirrors the bundled WAKE index animation contract", () => {
  const compactFleet = html.replace(/\s+/g, "");
  const compactWake = wakeReferenceHtml.replace(/\s+/g, "");
  for (const contract of [
    "#wake-startup-overlay.wake-show{display:flex;animation:wakeOverlayFade1.45seaseforwards;}",
    "animation:wakeSweep1.1sease-outforwards;",
    "animation:wakeFoam1.25sease-outforwards;",
    "animation:wakeLogoPop.75sease-out.18sforwards;",
    "background:radial-gradient(circleat50%42%,#e9f8ff0%,#aedcf134%,#3f84aa62%,#134165100%)!important;",
    "@keyframeswakeOverlayFade{0%{opacity:1;}82%{opacity:1;}100%{opacity:0;visibility:hidden;}}",
    '<divclass="wake-startup-logo-text">WAKE</div>',
    '<divclass="wake-startup-subtitle">MeasuretheWake,MastertheWatch:TheOODTrainingContinuum</div>'
  ]) {
    assert.ok(compactWake.includes(contract), `WAKE reference lost startup contract: ${contract}`);
    assert.ok(compactFleet.includes(contract), `Fleet startup does not mirror WAKE: ${contract}`);
  }
  assert.match(compactFleet, /setTimeout\(\(\)=>finishStartupAndOpenWelcome\(true\),1450\)/);
});

test("regression defaults to the reviewed Fleet WAKE target", () => {
  assert.equal(path.basename(target), "FLEET_WAKE_board_reviewed.html");
});

test("Watchbill and dormant Planning/RAC implementation are absent while OFRP remains", () => {
  assert.doesNotMatch(html, /watchbill/i);
  assert.doesNotMatch(html, /normalizePlanning|planning-save-btn|data-plan-field|ORM_RISK_MATRIX|\bRAC\b|\.planning-/i);
  assert.ok(html.includes("id=\\\"admin-ofrp-btn\\\" type=\\\"button\\\" data-view=\\\"ofrp\\\">OFRP Analysis"));
  assert.match(html, /id="view-ofrp" class="view hidden"/);
});

test("legacy planning state is discarded during normalization", () => {
  const api = loadAppApi();
  const normalized = api.normalizeState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{}, plans:[{ id:"legacy" }] });
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "plans"), false);
});

test("coach actions target live controls", () => {
  const api = loadAppApi();
  const selectors = api.COACH_STEPS.map(step => step.selector).filter(Boolean);
  assert.ok(selectors.includes("#admin-export-btn"));
  assert.ok(selectors.includes("#drop-zone"));
  assert.ok(selectors.includes("button[data-view='performance']"));
  assert.ok(selectors.includes("button[data-view='ofrp']"));
  assert.equal(selectors.includes("#backup-btn"), false);
  assert.doesNotMatch(html, /#backup-btn/);
});

test("ship data posture tolerates isolated recovery records", () => {
  const api = loadAppApi();
  const base = { officerCount:20, current:16, need:1, loss:1, readyToLevelUp:0, level2PlusDelta:0, levels:{"0":4,"1":6,"2":7,"3":3} };
  assert.equal(api.shipDataPosture(base), "Sustained");
  assert.equal(api.shipDataPosture({ ...base, readyToLevelUp:1, levels:{"0":8,"1":5,"2":5,"3":2} }), "Progressing");
  assert.equal(api.shipDataPosture({ ...base, current:14, need:3, loss:2, levels:{"0":12,"1":4,"2":3,"3":1} }), "Developing");
  assert.equal(api.shipDataPosture({ ...base, current:8, need:1, loss:1, levels:{"0":7,"1":5,"2":5,"3":3} }), "Developing");
  assert.equal(api.shipDataPosture({ ...base, current:8, need:1, loss:1, levels:{"0":8,"1":5,"2":5,"3":2} }), "Recovering");
  assert.equal(api.shipDataPosture({ ...base, current:10, need:8, loss:2, levels:{"0":10,"1":5,"2":4,"3":1} }), "Developing");
});

test("fleet posture definitions and calculation boundary are visible", () => {
  assert.match(html, /At least 75% current and 40% Level 2\+/);
  assert.match(html, /At least 60% are current, plus either 5% meet the approaching-next-level indicator or a level-up is recorded in saved history/);
  assert.match(html, /At least 50% of watchstanders are current, or at least 40% are Level 2 or 3/);
  assert.match(html, /Fewer than 50% are current and fewer than 40% are Level 2 or 3/);
  assert.match(html, /Individual need- or lost-proficiency records do not determine this category/);
  assert.match(html, /Sustained, Progressing, Developing, Recovering/);
  assert.match(html, /does not add a composite fleet risk score/);
});

test("approaching-level language never implies approval readiness", () => {
  assert.doesNotMatch(html, /ready to level|ready-up|marked ready|to level up|level-up approval/i);
  assert.doesNotMatch(html, /countWithRate\([^\r\n]*"ready"/);
  assert.match(html, /hours-based approaching indicator/i);
  assert.match(html, /not proof of completed advancement gates/i);
});

test("posture category controls pass the selected category into Ship List filtering", () => {
  const postureSource = html.slice(html.indexOf("function fleetDataPosturePanel("), html.indexOf("function renderDashboard()"));
  assert.match(postureSource, /data-posture=\\\".*row\.label/);
  assert.match(postureSource, /Open .* Ships/);
  assert.match(html, /posture:\s*""/);
  assert.match(html, /id=\\\"heatmap-posture-filter\\\"/);
  assert.match(html, /shipDataPosture\(m\) !== heatmapFilters\.posture/);
  assert.match(html, /filters\.posture = shipListTarget\.dataset\.posture/);
  assert.match(html, /heatmapFilters\.posture = next\.posture \|\| ""/);
});

test("OFRP Analysis is a focused phase-comparison workspace", () => {
  const source = html.slice(html.indexOf("function renderOfrp()"), html.indexOf("function filterOptions("));
  assert.match(source, /const rows = phaseSummaryRows\(metrics\)/);
  for (const contract of ["Weighted Phase Comparison","Watchstander Level Mix by Phase","Phase Relationship Map","Open complete OFRP phase data"]) {
    assert.ok(source.includes(contract), `missing OFRP comparison contract: ${contract}`);
  }
  assert.match(source, /ofrpPhaseComparisonMatrix\(rows, fleet\)/);
  assert.match(source, /ofrpPhaseLevelChart\(rows\)/);
  assert.match(source, /ofrpPhaseRelationshipMap\(rows, fleet\)/);
  assert.match(source, /ofrpCompleteDataTable\(rows\)/);
  assert.doesNotMatch(source, /ofrpImpactBoard\(|phaseLevelPipelinePanel\(|phaseProficiencyRecoveryPanel\(|phaseTrainingOutputPanel\(|analytics-kpi/);
  assert.match(html, /\.phase-benchmark-marker/);
});

test("Decision Board focuses on watchstander levels and qualified depth", () => {
  const source = html.slice(html.indexOf("function commandDecisionBoard("), html.indexOf("function commandAttentionBoard("));
  for (const contract of ["Watchstander Level Ladder","Qualified Depth Map","Open complete watchstander-level data"]) {
    assert.ok(source.includes(contract), "missing Decision Board contract: " + contract);
  }
  assert.match(source, /watchstanderLevelLadder\(rows, fleet\)/);
  assert.match(source, /watchstanderDepthMap\(rows, fleet\)/);
  assert.match(source, /watchstanderDetailTable\(rows, fleet\)/);
  assert.ok(source.indexOf("Qualified Depth Map") < source.indexOf("Watchstander Level Ladder"));
  assert.match(source, /data-open-ship=/);
  assert.match(source, /watchstanderShipDotSize\(row\.officerCount, maxCount\)/);
  assert.match(source, /quadrant-bubble ship-dot/);
  assert.match(source, /data-plot-label=/);
  assert.match(source, /quadrant-chart watchstander-depth-chart/);
  assert.match(source, /quadrant-plot performance-surface/);
  assert.match(source, /performance-rank-" \+ h\(row\.comparisonStatus\.rank\)/);
  assert.match(html, /linear-gradient\(90deg,#d84a41 0%,#ee9438 34%,#e7c946 62%,#4aa36b 100%\)/);
  assert.match(source, /Red · both below/);
  assert.match(source, /Green · both above/);
  assert.doesNotMatch(source, /fleetOverviewKpi\(|assessmentOutcomePanel\(|monthlyBridgeProductionPanel\(|ofrpImpactBoard\(|analytics-kpi/);
});

test("watchstander comparison uses transparent fleet baselines", () => {
  const api = loadAppApi();
  const fleet = { qualRate:.6, level2Plus:.5 };
  assert.equal(api.watchstanderComparisonStatus({ officerCount:20, qualRate:.7, level2Plus:.6 }, fleet).label, "High performing");
  assert.equal(api.watchstanderComparisonStatus({ officerCount:20, qualRate:.4, level2Plus:.3 }, fleet).label, "Needs qualified depth");
  assert.equal(api.watchstanderComparisonStatus({ officerCount:20, qualRate:.4, level2Plus:.7 }, fleet).label, "Close qualification gap");
  assert.equal(api.watchstanderComparisonStatus({ officerCount:20, qualRate:.8, level2Plus:.3 }, fleet).label, "Build Level 2+ depth");
  assert.match(api.phaseBenchmarkCell(.7, .6, 7, 10, "Current"), /\+10(?:\.0)? pts/);
});

test("Fleet Overview and ship profile have explicit responsive layout contracts", () => {
  assert.match(html, /@media \(max-width:900px\)[\s\S]*?\.fleet-overview-kpi-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \}/);
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?\.ship-profile-level-grid,[\s\S]*?\.ship-profile-secondary \{ grid-template-columns:1fr; \}/);
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?\.watchstander-level-chart,[\s\S]*?\.phase-level-comparison \{ min-width:0; \}/);
  assert.match(html, /\.watchstander-chart-row,[\s\S]*?\.phase-level-row \{ grid-template-columns:1fr; gap:7px; \}/);
});

test("normal import accepts current WAKE JSON working copies", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  const payload = {
    format:"WAKE_JSON_BACKUP",
    version:1,
    ship:"USS TEST DDG 99",
    months:["JUL 2026"],
    ofrpPhase:"Basic Phase",
    officers:{
      "TEST, OFFICER":{
        name:"TEST, OFFICER",
        rank:"LT",
        autoShipQual:true,
        autoDaysSince:12,
        hoursByWS:{ "OOD U/W":{ Q:82, UI:6 } },
        detectedLogs:[{ logId:"TEST-1", ws:"OOD U/W", type:"Q", val:"Underway bridge watch", month:"JUL 2026", daysAgo:12 }],
        rorTests:[{ date:"2026-07-01", score:95 }]
      },
      "NONBRIDGE, OFFICER":{
        name:"NONBRIDGE, OFFICER",
        hoursByWS:{ EOOW:{ Q:40, UI:2 } },
        detectedLogs:[{ logId:"TEST-2", ws:"EOOW", type:"Q", val:"Engineering watch" }]
      }
    }
  };
  const parsed = api.parseWakeJsonPayload(JSON.stringify(payload), "WAKE_Working_Copy_USS_TEST.json");
  assert.equal(parsed.ship, "USS TEST DDG 99");
  const report = api.importWakeJson(JSON.stringify(payload), "WAKE_Working_Copy_USS_TEST.json");
  assert.equal(report.status, "Imported");
  assert.equal(report.sourceType, "WAKE JSON");
  assert.equal(report.ship, "USS TEST DDG 99");
  assert.equal(report.logsAdded, 1);
  assert.equal(report.officers, 1);
  const ship = api.getState().ships["USS TEST DDG 99"];
  assert.ok(ship);
  assert.equal(ship.phase, "Basic Phase");
  assert.equal(ship.officers["TEST, OFFICER"].level, "1");
  assert.equal(ship.officers["TEST, OFFICER"].currencyCategory, "Current");
});

test("WAKE JSON import preserves recognized and explicit evolution evidence", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  const payload = wakePayload({ officer:"EVOLUTION, OFFICER", logId:"EVOLUTION-BASE" });
  payload.officers["EVOLUTION, OFFICER"].hoursByWS = { CONN:{ Q:18, UI:4 } };
  payload.officers["EVOLUTION, OFFICER"].detectedLogs = [
    { logId:"EVOLUTION-1", ws:"CONN", type:"Q", val:"Sea and Anchor Detail", month:"JUL 2026", watchDate:"2026-07-08", meta:{ qual:"Q" } },
    { logId:"EVOLUTION-2", ws:"CONN", type:"Spec Cond", val:"Low Visibility", month:"JUL 2026", watchDate:"2026-07-10" },
    { logId:"EVOLUTION-3", ws:"CONN", type:"Q", val:"Bridge watch", month:"JUL 2026", watchDate:"2026-07-12", meta:{ events:"Flight Quarters" } }
  ];
  const report = api.importWakeJson(JSON.stringify(payload), "WAKE_Working_Copy_Evolutions.json");
  assert.equal(report.status, "Imported");
  const logs = api.getState().ships["USS TEST DDG 99"].logs;
  assert.equal(logs.find(log => log.logId === "EVOLUTION-1").events, "Sea and Anchor Detail");
  assert.equal(logs.find(log => log.logId === "EVOLUTION-2").specialConditions, "Low Visibility");
  assert.equal(logs.find(log => log.logId === "EVOLUTION-3").events, "Flight Quarters");
  const summary = api.evolutionSummary(logs);
  assert.equal(summary.unique, 3);
  assert.equal(summary.total, 3);
  assert.equal(summary.latestDate, "2026-07-12");
});

test("currency ages from authoritative source time and unknown evidence stays visible", () => {
  const api = loadAppApi();
  const ship = { sourceGeneratedAt:"2026-07-01T00:00:00.000Z" };
  const officer = { daysSinceWatch:20, currencyCategory:"Current" };
  assert.equal(api.officerCurrencyAsOf(officer, ship, Date.parse("2026-07-20T00:00:00.000Z")).category, "Current");
  assert.equal(api.officerCurrencyAsOf(officer, ship, Date.parse("2026-08-01T00:00:00.000Z")).category, "Need");
  assert.equal(api.officerCurrencyAsOf(officer, ship, Date.parse("2026-09-20T00:00:00.000Z")).category, "Loss");
  const unverified = api.officerCurrencyAsOf({ daysSinceWatch:"", currencyCategory:"" }, {}, Date.parse("2026-08-01T00:00:00.000Z"));
  assert.equal(unverified.category, "Unknown");
  assert.equal(unverified.sourceVerified, false);
  assert.equal(api.officerLevelLabel("0"), "Foundational (L0)");
  assert.equal(api.officerLevelLabel(""), "Unclassified");
});

test("CSV import preserves missing currency evidence as Unknown instead of Loss", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  const rows = [
    ["TORIS_EXPORT_VERSION","Ship","OFRP Phase","Officer Name","Record Type","Watchstation","Days Since Watch","Currency Status","Log ID","Month","Current Level","Hours","Raw Text Entry","Source Generated At"],
    ["TORIS_OOD_TRACKER_V1","USS MISSING DDG 98","Basic Phase","MISSING, DAYS","WATCH_LOG","OOD U/W","","","MISSING-1","JUL 2026","0","4","Underway bridge watch","2026-07-20T12:00:00Z"]
  ];
  const report = api.importRows(rows, "missing-currency.csv");
  assert.equal(report.status, "Imported");
  const ship = api.getState().ships["USS MISSING DDG 98"];
  const officer = ship.officers["MISSING, DAYS"];
  assert.equal(officer.daysSinceWatch, null);
  assert.equal(officer.currencyCategory, "Unknown");
  const metrics = api.shipMetrics(ship);
  assert.equal(metrics.current, 0);
  assert.equal(metrics.need, 0);
  assert.equal(metrics.loss, 0);
  assert.equal(metrics.unknown, 1);
});

test("watch-log CSV paths export explicit Foundational and Unclassified levels", () => {
  const api = loadAppApi();
  assert.equal(api.filteredLogCsvRow({ level:"0" })[4], "Foundational (L0)");
  assert.equal(api.filteredLogCsvRow({ level:"" })[4], "Unclassified");

  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  api.importWakeJson(JSON.stringify(wakePayload()), "WAKE_Working_Copy_USS_TEST.json");
  const ship = Object.values(api.getState().ships)[0];
  const levelColumn = api.allFleetCsvRows().headers.indexOf("Current Level");
  ship.logs[0].level = "0";
  let watchRow = api.allFleetCsvRows().rows.find(row => row[0] === "WATCH_LOG");
  assert.equal(watchRow[levelColumn], "Foundational (L0)");
  ship.logs[0].level = "";
  watchRow = api.allFleetCsvRows().rows.find(row => row[0] === "WATCH_LOG");
  assert.equal(watchRow[levelColumn], "Unclassified");
});

test("PDF status export omits Unclassified while keeping the four classified levels", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  api.importWakeJson(JSON.stringify(wakePayload()), "WAKE_Working_Copy_USS_TEST.json");
  const report = api.currentStatusReportHtml();
  assert.doesNotMatch(report, /Unclassified/);
  for (const label of ["Foundational (L0)", "Level 1", "Level 2", "Level 3"]) {
    assert.match(report, new RegExp(label.replace(/[()+]/g, "\\$&")));
  }
  assert.match(report, /\.level-heat-grid\{display:grid;grid-template-columns:repeat\(4,1fr\)/);
});

test("metric palette uses semantic gradients in light and dark themes", () => {
  for (const token of [
    "--metric-info-from",
    "--metric-good-from",
    "--metric-warn-from",
    "--metric-bad-from",
    "--metric-purple-from",
    "--level-l3-from",
    "linear-gradient(145deg,var(--metric-info-from),var(--metric-info-to))",
    "band-card-healthy",
    "band-card-monitor",
    "band-card-watch",
    "band-card-at-risk",
    ".fleet-health-priority .risk-stack .band-healthy",
    "linear-gradient(90deg,#217a4b,#45aa6d)",
    "linear-gradient(90deg,#246b91,#4b9cc3)",
    "linear-gradient(90deg,#a96f12,#d6a332)",
    "linear-gradient(90deg,#a83d38,#d45e57)",
    "[data-theme=\"dark\"] .fleet-health-priority .band-card-healthy",
    "[data-theme=\"dark\"] .fleet-health-priority .band-card-monitor",
    "[data-theme=\"dark\"] .fleet-health-priority .band-card-watch",
    "[data-theme=\"dark\"] .fleet-health-priority .band-card-at-risk",
    "[data-theme=\"dark\"]"
  ]) assert.ok(html.includes(token), `missing metric palette contract: ${token}`);
});

test("identical authoritative JSON reimports do not manufacture comparable history", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  const text = JSON.stringify(wakePayload());
  const first = api.importWakeJson(text, "WAKE_Working_Copy_USS_TEST.json");
  const second = api.importWakeJson(text, "WAKE_Working_Copy_USS_TEST.json");
  const ship = api.getState().ships["USS TEST DDG 99"];
  assert.equal(first.snapshots, 1);
  assert.equal(second.snapshots, 1);
  assert.equal(second.snapshotId, "");
  assert.match(second.notes.join(" "), /without adding a duplicate snapshot/);
  assert.equal(ship.snapshots.length, 1);
  assert.equal(api.hasComparableAuthoritativeSnapshots(ship), false);
  assert.equal(api.fleetDataQuality([]).comparableShips, 0);
});

test("distinct authoritative JSON replaces current truth and creates a comparable snapshot", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  api.importWakeJson(JSON.stringify(wakePayload()), "first.json");
  const secondPayload = wakePayload({
    officer:"SECOND, OFFICER",
    exportedAt:"2026-07-15T12:00:00Z",
    logId:"TEST-2",
    qHours:125
  });
  const report = api.importWakeJson(JSON.stringify(secondPayload), "second.json");
  const ship = api.getState().ships["USS TEST DDG 99"];
  assert.equal(report.snapshots, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(ship.officers, "TEST, OFFICER"), false);
  assert.equal(ship.officers["SECOND, OFFICER"].totalQHrs, 125);
  assert.equal(JSON.stringify(ship.logs.map(log => log.logId)), JSON.stringify(["TEST-2"]));
  assert.equal(api.hasComparableAuthoritativeSnapshots(ship), true);
  assert.equal(api.latestSnapshotPair(ship).length, 2);
});

test("graded WAKE JSON reimports replace ungraded watches for several ships without duplication", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  const ships = [
    { ship:"USS ALPHA DDG 10", officer:"ALPHA, OFFICER", logId:"ALPHA-1", score:4 },
    { ship:"USS BRAVO DDG 20", officer:"BRAVO, OFFICER", logId:"BRAVO-1", score:3 }
  ];

  ships.forEach(entry => {
    api.importWakeJson(JSON.stringify(wakePayload({ ...entry, score:"" })), `${entry.ship}-ungraded.json`);
  });
  ships.forEach(entry => {
    const current = api.getState().ships[entry.ship];
    assert.equal(current.logs.length, 1);
    assert.equal(current.logs[0].score, "");
  });

  const reports = ships.map(entry => api.importWakeJson(JSON.stringify(wakePayload({
    ...entry,
    exportedAt:"2026-07-15T12:00:00Z"
  })), `${entry.ship}-graded.json`));

  assert.equal(Object.keys(api.getState().ships).length, 2);
  ships.forEach((entry, index) => {
    const current = api.getState().ships[entry.ship];
    assert.equal(current.logs.length, 1);
    assert.equal(current.logs[0].logId, entry.logId);
    assert.equal(current.logs[0].score, entry.score);
    assert.equal(current.officers[entry.officer].logScores[entry.logId], entry.score);
    assert.equal(current.snapshots.length, 2);
    assert.equal(reports[index].logsAdded, 1);
    assert.equal(reports[index].duplicateLogs, 0);
    assert.match(reports[index].notes.join(" "), /replaced from this authoritative ship export/);
  });
});

test("graded CSV reimports replace ungraded watches for several ships without duplication", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  const header = ["TORIS_EXPORT_VERSION","Ship","OFRP Phase","Officer Name","Record Type","Watchstation","Days Since Watch","Currency Status","Log ID","Month","Current Level","Hours","Raw Text Entry","Score","Source Generated At"];
  const ships = [
    { ship:"USS CHARLIE DDG 30", officer:"CHARLIE, OFFICER", logId:"CHARLIE-1", score:"4" },
    { ship:"USS DELTA DDG 40", officer:"DELTA, OFFICER", logId:"DELTA-1", score:"3" }
  ];
  const rowsFor = (entry, score, generatedAt) => [
    header,
    ["TORIS_OOD_TRACKER_V1",entry.ship,"Basic Phase",entry.officer,"WATCH_LOG","OOD U/W","12","Current",entry.logId,"JUL 2026","1","4","Underway bridge watch",score,generatedAt]
  ];

  ships.forEach(entry => api.importRows(rowsFor(entry, "", "2026-07-01T12:00:00Z"), `${entry.ship}-ungraded.csv`));
  ships.forEach(entry => {
    const current = api.getState().ships[entry.ship];
    assert.equal(current.logs.length, 1);
    assert.equal(current.logs[0].score, "");
  });

  const reports = ships.map(entry => api.importRows(
    rowsFor(entry, entry.score, "2026-07-15T12:00:00Z"),
    `${entry.ship}-graded.csv`
  ));

  assert.equal(Object.keys(api.getState().ships).length, 2);
  ships.forEach((entry, index) => {
    const current = api.getState().ships[entry.ship];
    assert.equal(current.logs.length, 1);
    assert.equal(current.logs[0].logId, entry.logId);
    assert.equal(current.logs[0].score, entry.score);
    assert.equal(current.snapshots.length, 2);
    assert.equal(reports[index].logsAdded, 1);
    assert.equal(reports[index].duplicateLogs, 0);
    assert.match(reports[index].notes.join(" "), /replaced from this authoritative ship export/);
  });
});

test("MSA-only overlays do not append authoritative bridge snapshots", () => {
  const api = loadAppApi();
  api.setState({ version:2, ships:{}, importReports:[], historyEvents:[], leadership:{} });
  api.importWakeJson(JSON.stringify(wakePayload()), "bridge.json");
  const before = api.getState().ships["USS TEST DDG 99"].snapshots.length;
  const rows = [
    ["TORIS_EXPORT_VERSION","Ship","OFRP Phase","Officer Name","Record Type","MSA ID","MSA Type","MSA Date","MSA Result","MSA Underway Hours"],
    ["TORIS_OOD_TRACKER_V1","USS TEST DDG 99","Basic Phase","TEST, OFFICER","MSA","MSA-2-001","MSA 2","2026-07-20","PASS","40"]
  ];
  const report = api.importRows(rows, "msa-only.csv");
  const ship = api.getState().ships["USS TEST DDG 99"];
  assert.equal(report.status, "Imported");
  assert.equal(report.msaRecordsAdded, 1);
  assert.equal(report.snapshotId, "");
  assert.equal(report.historyEvents, 0);
  assert.equal(ship.snapshots.length, before);
  assert.equal(api.hasComparableAuthoritativeSnapshots(ship), false);
});

test("normal JSON import rejects Fleet backups and unsafe payloads", () => {
  const api = loadAppApi();
  assert.throws(() => api.parseWakeJsonPayload(JSON.stringify({ version:2, ships:{} }), "fleet.json"), /WAKE Fleet backup/);
  assert.throws(() => api.parseWakeJsonPayload('{"format":"WAKE_JSON_BACKUP","version":1,"ship":"USS TEST","months":[],"officers":{"A":{"detectedLogs":[],"constructor":{}}}}', "unsafe.json"), /Unsafe field name/);
});

test("Fleet Overview orders posture, figures, and full-width supporting panels", () => {
  const dashboardSource = html.slice(html.indexOf("function renderDashboard()"), html.indexOf("function fleetImportStatusPanel()"));
  const startIndex = dashboardSource.indexOf("homeCommandRibbon()");
  const postureIndex = dashboardSource.indexOf("fleetDataPosturePanel(rows)");
  const figuresIndex = dashboardSource.indexOf("fleetOverviewFigures(rows, aggregate)");
  const levelIndex = dashboardSource.indexOf("level-layout-home");
  const outcomesIndex = dashboardSource.indexOf("assessmentOutcomePanel(aggregate, rows)");
  assert.ok(startIndex >= 0 && postureIndex > startIndex && levelIndex > postureIndex && figuresIndex > levelIndex && outcomesIndex > figuresIndex);
  assert.doesNotMatch(dashboardSource, /dashboardDataAccess\(\)|leadershipBluf\(/);
  assert.match(html, /<h2>Start Here<\/h2>/);
});

test("Ship List uses clickable horizontal rows and moves actions into Ship View", () => {
  for (const contract of ["fleet-ship-list-summary","fleet-horizontal-ship-table","fleet-ship-click-row","fleet-ship-row-name","ship-profile-hero","ship-profile-level-grid","Overall Ship Data"]) {
    assert.ok(html.includes(contract), "missing Ship List contract: " + contract);
  }
  const shipListSource = html.slice(html.indexOf("function shipListTable("), html.indexOf("function shipRosterCard("));
  assert.doesNotMatch(shipListSource, /Open Data|quickBtn\(/);
  assert.match(shipListSource, /data-open-ship=\\\".*tabindex=\\\"0\\\" role=\\\"button\\\"/);
  const shipViewSource = html.slice(html.indexOf("function renderShips()"), html.indexOf("function rosterTable("));
  assert.doesNotMatch(shipViewSource, /rosterTable\(ship\)/);
  assert.match(shipViewSource, /quickBtn\(shipKey, "roster", "Roster"\)/);
  assert.match(html, /accept="\.csv,\.json,text\/csv,application\/json"/);
});

test("offline single-file security policy remains restrictive", () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /form-action 'none'/);
});
