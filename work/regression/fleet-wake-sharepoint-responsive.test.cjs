const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const root = path.resolve(__dirname, "..", "..");
const target = path.join(root, "WAKE FLEET - Only Secure in FS Sharepoint-current.html");
const html = fs.readFileSync(target, "utf8");
const scripts = [];
let scriptCursor = 0;
while ((scriptCursor = html.indexOf("<script", scriptCursor)) >= 0) {
  const open = html.indexOf(">", scriptCursor);
  const close = html.indexOf("</script>", open);
  assert.ok(open >= 0 && close > open, "script tag should close");
  scripts.push(html.slice(open + 1, close));
  scriptCursor = close + 9;
}
const appScript = scripts.at(-1);

function loadAppApi(options = {}) {
  const marker = /\nboot\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/;
  assert.match(appScript, marker, "SharePoint app script should end with guarded boot");
  const instrumented = appScript.replace(marker, `
globalThis.__fleetWakeResponsiveTest = {
  barsHtml,
  currencyStatusLabel,
  importedPhaseChanges,
  importWakeJson,
  importRows,
  normalizeState,
  normalizeImportedPhase,
  normalizePhase,
  officerLevelLabel,
  parseWakeJsonPayload,
  validateFleetBackupPayload,
  evolutionDayKey,
  evolutionEvidenceTable,
  evolutionOccurrenceGroups,
  evolutionRowsForLogs,
  evolutionSummary,
  evolutionChart,
  evolutionTable,
  figureExplanationText,
  levelHeatCell,
  normalizeLevelKey,
  monthlyBridgeHoursByMonth,
  shipMetrics,
  ultrawideFleetLens,
  ultrawideWorkspaceRail,
  ultrawideMiniBarChart,
  ultrawideDecisionBoardRail,
  ultrawideShipListRail,
  ultrawideEvolutionRail,
  ultrawideShipRail,
  ultrawideOfrpRail,
  ultrawideExplorerRail,
  ultrawideImportsRail,
  ultrawideReferencesRail,
  renderDashboard,
  renderHeatMaps,
  renderShips,
  renderOfrp,
  renderPerformance,
  renderEvolutions,
  renderExplorer,
  renderImports,
  renderReferences,
  switchView,
  selectCalendar:(month, baselineMonth) => { fleetCalendarSelection = {month, baselineMonth}; },
  selectActivityMonth:(shipKey, month) => { commandShipActivitySelections[shipKey] = month; },
  getState: () => JSON.parse(JSON.stringify(state)),
  setState: value => { state = normalizeState(value); }
};
})();`);
  const nullElement = () => null;
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
    URL,
    setTimeout,
    clearTimeout,
    requestAnimationFrame:callback => callback(),
    scrollTo:options.scrollTo || (() => {}),
    document:{
      getElementById:id => options.elements && options.elements[id] || null,
      querySelector:nullElement,
      querySelectorAll:selector => selector === ".view" ? (options.views || []) : selector === "[data-view]" || selector === ".wake-main-nav .wake-nav-btn" ? (options.navigation || []) : [],
      referrer:"",
      hidden:false,
      activeElement:null,
      body:{},
      documentElement:{ getAttribute:() => "light", setAttribute:() => {} }
    },
    window:{},
    navigator:{},
    localStorage:{ getItem:() => null, setItem:() => {}, removeItem:() => {} }
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename:"WAKE-Fleet-SharePoint.inline.js" });
  return context.__fleetWakeResponsiveTest;
}

test("all inline scripts parse", () => {
  assert.equal(scripts.length, 3);
  scripts.forEach((source,index) => assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} should parse`));
});

test("SharePoint persistence keeps live polling while using bounded fast-path reads and writes", () => {
  const marker = "SharePoint persistence";
  const start = html.lastIndexOf("/*", html.indexOf(marker));
  const end = html.indexOf("async function persistLocalStateCopies");
  assert.ok(start >= 0 && end > start);
  const block = html.slice(start,end);
  for (const contract of [
    "pollingEnabled: true",
    "pollVisibleMs: 25000",
    "pollHiddenMs: 90000",
    "manifestCandidateLimit: 20",
    "listDiscoveryCacheMs: 60000",
    "chunkWriteConcurrency: 4",
    "function startSharePointPolling()",
    "function handleSharePointVisibilityChange()",
    "async function saveStateToSharePoint(snapshot, reason)",
    "await Promise.all(lists.map(async list =>",
    "await runWithConcurrency(chunks, SHAREPOINT_CONFIG.chunkWriteConcurrency",
    "candidate.fingerprint === cachedFingerprint"
  ]) assert.ok(block.includes(contract), `missing SharePoint contract: ${contract}`);
  const discovery = block.slice(block.indexOf("async function discoverSharePointDataLists"), block.indexOf("function splitSharePointStateText"));
  assert.doesNotMatch(discovery, /await verifySharePointConnection\(\)/);
  assert.doesNotMatch(discovery, /ensureSharePointList\(list\.Title\)/);
  const loadSnapshot = block.slice(block.indexOf("async function loadSharePointSnapshot"), block.indexOf("async function loadLatestSharePointState"));
  assert.doesNotMatch(loadSnapshot, /ensureSharePointList/);
});

test("the SharePoint persistence implementation remains identical to the pre-revamp baseline", () => {
  const start = html.lastIndexOf("/*", html.indexOf("SharePoint persistence"));
  const end = html.indexOf("async function persistLocalStateCopies");
  assert.ok(start >= 0 && end > start, "the complete protected persistence block must remain locatable");
  const block = html.slice(start, end).replace(/\r\n/g, "\n");
  // SHA-256 of the same normalized block in baseline HEAD c0bad25a89c6f195c7e4d4531ecc59f392d0e263.
  // Frozen so the regression still protects the implementation after this revamp is committed.
  assert.equal(createHash("sha256").update(block).digest("hex"), "169e79463bc5bdc15d6e260ad04a0047c0fe863d25d094c157a545b5e44c51a0");
});

test("WAKE JSON upserts ships and counts submitted watch hours once per watch occurrence", () => {
  const api = loadAppApi();
  const payload = (ship, officer, totalHours, logId) => ({
    format:"WAKE_JSON_BACKUP",
    version:1,
    exportedAt:"2026-08-24T12:13:12.994Z",
    ship,
    months:["AUG 2026"],
    ofrpPhase:"Basic Phase",
    officers:{
      [officer]:{
        name:officer,
        rank:"LT",
        autoShipQual:true,
        autoDaysSince:1,
        hoursByWS:{ "OOD U/W":{ Q:totalHours, UI:0 } },
        detectedLogs:[
          {
            logId:logId + "-WATCH",
            ws:"OOD U/W",
            type:"Watch Q",
            val:"OOD Qualified Watch",
            hrs:totalHours,
            month:"AUG 2026",
            baseWatchLog:true,
            meta:{ dayTotalHours:String(totalHours), baseWatchLog:true, watchOccurrenceKey:logId }
          },
          {
            logId:logId + "-EVENT",
            ws:"OOD U/W",
            type:"Event 1",
            val:"Flight Quarters",
            hrs:totalHours,
            month:"AUG 2026",
            meta:{ dayTotalHours:String(totalHours), watchOccurrenceKey:logId }
          }
        ],
        logScores:{},
        rorTests:[]
      }
    }
  });

  const alphaFirst = api.importWakeJson(JSON.stringify(payload("USS ALPHA DDG 10", "ALPHA ONE", 8, "ALPHA-1")), "alpha-first.json");
  assert.equal(alphaFirst.status, "Imported");
  let state = api.getState();
  let alpha = state.ships["USS ALPHA DDG 10"];
  assert.equal(alpha.officers["ALPHA ONE"].cumulativeBridgeHours, 8);
  assert.equal(api.shipMetrics(alpha).totalHours, 8);
  assert.equal(api.monthlyBridgeHoursByMonth(alpha.logs)["AUG 2026"], 8);
  assert.equal(alpha.logs.find(log => log.logId === "ALPHA-1-WATCH").hours, 8);
  assert.equal(alpha.logs.find(log => log.logId === "ALPHA-1-EVENT").hours, 0);
  assert.equal(alpha.logs.find(log => log.logId === "ALPHA-1-EVENT").evidenceHours, 8);
  assert.equal(alpha.logs.find(log => log.logId === "ALPHA-1-WATCH").dayTotalHours, 8);

  api.importWakeJson(JSON.stringify(payload("USS BRAVO DDG 20", "BRAVO ONE", 6, "BRAVO-1")), "bravo.json");
  const alphaSecond = api.importWakeJson(JSON.stringify(payload("USS ALPHA DDG 10", "ALPHA TWO", 12, "ALPHA-2")), "alpha-second.json");
  assert.equal(alphaSecond.status, "Imported");
  state = api.getState();
  assert.equal(Object.keys(state.ships).length, 2);
  assert.ok(state.ships["USS BRAVO DDG 20"]);
  alpha = state.ships["USS ALPHA DDG 10"];
  assert.equal(Object.prototype.hasOwnProperty.call(alpha.officers, "ALPHA ONE"), false);
  assert.equal(alpha.officers["ALPHA TWO"].cumulativeBridgeHours, 12);
  assert.equal(api.shipMetrics(alpha).totalHours, 12);
  assert.equal(JSON.stringify(alpha.logs.map(log => log.logId).sort()), JSON.stringify(["ALPHA-2-EVENT","ALPHA-2-WATCH"]));
});

test("legacy fleet snapshots restore monthly bridge hours from retained watch metadata", () => {
  const api = loadAppApi();
  const normalized = api.normalizeState({
    version:2,
    savedAt:"2026-08-24T12:00:00.000Z",
    leadership:{ expectedShipCount:0, staleAfterDays:14 },
    importReports:[],
    historyEvents:[],
    ships:{
      "USS LEGACY DDG 90":{
        name:"USS LEGACY DDG 90",
        phase:"Basic Phase",
        months:["AUG 2026"],
        officers:{
          "LEGACY ONE":{
            name:"LEGACY ONE",
            hoursByWS:{ "OOD UW":{ Q:4, UI:0 } },
            cumulativeBridgeHours:4,
            totalQHrs:4,
            totalUIHrs:0,
            level:"1",
            currencyCategory:"Current",
            rorTests:[],
            logScores:{}
          }
        },
        logs:[
          {
            logId:"LEGACY-WATCH",
            ship:"USS LEGACY DDG 90",
            officer:"LEGACY ONE",
            watchstation:"OOD UW",
            month:"AUG 2026",
            logType:"Watch Q",
            hours:0,
            dayTotalHours:0,
            meta:{ dayTotalHours:"4.0", baseWatchLog:true }
          },
          {
            logId:"LEGACY-EVENT",
            ship:"USS LEGACY DDG 90",
            officer:"LEGACY ONE",
            watchstation:"OOD UW",
            month:"AUG 2026",
            logType:"Event 1",
            hours:0,
            dayTotalHours:0,
            meta:{ dayTotalHours:"4.0", baseWatchLog:false }
          }
        ],
        logKeys:{},
        snapshots:[],
        sourceFiles:[],
        msaRecords:[],
        msaKeys:{}
      }
    }
  });
  const ship = normalized.ships["USS LEGACY DDG 90"];
  const watch = ship.logs.find(log => log.logId === "LEGACY-WATCH");
  const event = ship.logs.find(log => log.logId === "LEGACY-EVENT");
  assert.equal(watch.hours, 4);
  assert.equal(watch.evidenceHours, 4);
  assert.equal(event.hours, 0);
  assert.equal(event.evidenceHours, 4);
  assert.deepEqual(api.monthlyBridgeHoursByMonth(ship.logs), { "AUG 2026":4 });
});

test("compact changes fit the familiar responsive layout and hidden views stay hidden", () => {
  const match = html.match(/\/\* BEGIN CO PROGRESSION STYLES \*\/([\s\S]*?)\/\* END CO PROGRESSION STYLES \*\//);
  assert.ok(match, "comparison styles must be embedded in the application");
  const styles = match[1];
  assert.ok(html.indexOf(match[0]) > html.lastIndexOf("@media (min-width:3200px)"), "comparison layout rules must follow the existing wide-screen layout rules");
  assert.doesNotMatch(styles, /(?:\.ultrawide-enabled-view\s*,\s*)?#view-dashboard\s*\{\s*display:block!important/);
  assert.match(styles, /#view-dashboard\.hidden\s*,\s*\.view\.hidden\s*\{\s*display:none!important/);
  assert.match(styles, /@media\s*\(max-width:\s*(?:900|560)px\)/);
  assert.match(html, /\.wake-main-nav\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(styles, /:focus-visible/);
  assert.match(html, /\.table-wrap\s*\{[^}]*overflow(?:-x)?:\s*auto/);
});

test("primary navigation preserves the familiar three tabs and WAKE import action", () => {
  const nav = html.match(/<nav class="wake-main-nav" aria-label="Main navigation">([\s\S]*?)<\/nav>/);
  assert.ok(nav);
  const actual = [...nav[1].matchAll(/<button\b[^>]*data-view="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map(match => [match[1], match[2].replace(/&amp;/g, "&")]);
  assert.deepEqual(actual, [["dashboard", "Fleet Overview"], ["heatmaps", "Ship List"], ["references", "References"]]);
  assert.match(nav[1], /<button[^>]*type="button"[^>]*data-command-import="true"[^>]*>Import WAKE<\/button>/);
  assert.match(nav[1], /aria-current="page"/);
  actual.forEach(([view]) => assert.match(html, new RegExp('<section id="view-' + view + '"')));
  assert.match(html, /<input[^>]*id="file-input"[^>]*type="file"|<input[^>]*type="file"[^>]*id="file-input"/);
  assert.match(appScript, /const activeTopView = currentView === "ships" \? "heatmaps" : currentView;/);
});

test("the familiar application and comparison engine remain self-contained inline", () => {
  assert.equal((appScript.match(/\/\/ BEGIN CO PROGRESSION BUNDLE/g) || []).length, 1);
  assert.equal((appScript.match(/\/\/ END CO PROGRESSION BUNDLE/g) || []).length, 1);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref\s*=/i);
  assert.doesNotMatch(html, /@import\s+(?:url\()?\s*["']?https?:/i);
  const bundle = appScript.slice(appScript.indexOf("// BEGIN CO PROGRESSION BUNDLE"), appScript.indexOf("// END CO PROGRESSION BUNDLE"));
  ["commandTimeline", "commandCompare", "commandMonthly", "commandCurrent", "commandCalendarCompare", "commandCalendarFleet", "commandShipActivityModel", "dailyActivityModel", "dailyActivityChart"].forEach(name => assert.match(bundle, new RegExp("function " + name + "\\("), name + " must be bundled"));
});

const commandViews = [
  ["dashboard", "renderDashboard"], ["heatmaps", "renderHeatMaps"], ["ships", "renderShips"],
  ["ofrp", "renderOfrp"], ["performance", "renderPerformance"], ["evolutions", "renderEvolutions"],
  ["explorer", "renderExplorer"], ["imports", "renderImports"], ["references", "renderReferences"]
];

function commandViewHarness() {
  const elements = Object.fromEntries(commandViews.map(([view]) => ["view-" + view, { innerHTML:"", querySelector:() => null, querySelectorAll:() => [], contains:() => false }]));
  return { api:loadAppApi({ elements }), elements };
}

function assertCommandViewMarkup(elements, view) {
  const markup = elements["view-" + view].innerHTML;
  assert.ok(markup.length > 100, view + " must render useful evidence or an explicit empty state");
  assert.match(markup, /<h[12]\b[^>]*>[^<]+<\/h[12]>/, view + " must identify the page");
  assert.doesNotMatch(markup, />\s*(?:undefined|NaN|Infinity)\s*</, view + " must handle missing evidence without invalid display values");
  for (const button of markup.matchAll(/<button\b[^>]*>/g)) assert.match(button[0], /\btype="button"/, view + " controls must remain keyboard-native non-submit buttons");
}

test("every familiar view renders its page or explicit no-data guidance", () => {
  const { api, elements } = commandViewHarness();
  commandViews.forEach(([view, render]) => {
    assert.doesNotThrow(() => api[render](), view + " must render without imported evidence");
    assertCommandViewMarkup(elements, view);
  });
});

test("every familiar view renders imported evidence with safe names and retained drilldowns", () => {
  const { api, elements } = commandViewHarness();
  const source = (date, days) => ({ format:"WAKE_JSON_BACKUP", version:1, exportedAt:date, ship:"USS EVIDENCE", months:["SEP 2026"], ofrpPhase:"Basic Phase", officers:{ "SAFE <OFFICER>":{ name:"SAFE <OFFICER>", rank:"LT", autoShipQual:true, autoDaysSince:days, hoursByWS:{ "OOD U/W":{ Q:8, UI:0 } }, detectedLogs:[], logScores:{}, rorTests:[] } } });
  const reports = [
    api.importWakeJson(JSON.stringify(source("2026-01-01T12:00:00Z", 10)), "baseline<&>.json"),
    api.importWakeJson(JSON.stringify(source("2026-09-01T12:00:00Z", 95)), "later.json")
  ];
  const imported = api.getState();
  imported.importReports = reports;
  api.setState(imported);
  api.selectCalendar("2026-09", "2026-01");
  commandViews.forEach(([view, render]) => {
    assert.doesNotThrow(() => api[render](), view + " must render imported evidence");
    assertCommandViewMarkup(elements, view);
    assert.doesNotMatch(elements["view-" + view].innerHTML, /SAFE <OFFICER>|baseline<&>\.json/, view + " must escape source-provided names");
  });
  assert.match(elements["view-dashboard"].innerHTML, /Fleet Overview/);
  for (const topic of ["Sustained", "Progressing", "Developing", "Recovering"]) assert.match(elements["view-dashboard"].innerHTML, new RegExp(topic));
  assert.doesNotMatch(elements["view-dashboard"].innerHTML, /fleet-calendar-panel|data-fleet-calendar|Compare with/);
  assert.match(elements["view-imports"].innerHTML, /baseline&lt;&amp;&gt;\.json/);
  assert.match(elements["view-heatmaps"].innerHTML, /Ship List/);
  assert.match(elements["view-ships"].innerHTML, /Overall Ship Data/);
  for (const action of ["roster", "logs", "ror", "history"]) assert.match(elements["view-ships"].innerHTML, new RegExp('data-open-drill="' + action + '"'), action + " drilldown must remain available");
});

test("ship pages show a daily hours line and evolution diagram for a selectable month with last-watch evidence", () => {
  const { api, elements } = commandViewHarness();
  const source = (date, month, days) => ({
    format:"WAKE_JSON_BACKUP", version:1, exportedAt:date + "T12:00:00Z", ship:"USS MONTHS", months:[month], ofrpPhase:"Basic Phase",
    officers:{ "SAFE <OFFICER>":{
      name:"SAFE <OFFICER>", rank:"LT", autoShipQual:true, autoDaysSince:days,
      hoursByWS:{ "OOD U/W":{Q:8, UI:0} }, logScores:{}, rorTests:[],
      detectedLogs:[
        {logId:date + "-WATCH", ws:"OOD U/W", type:"Watch Q", val:"OOD Qualified Watch", hrs:8, month, watchDate:date, baseWatchLog:true, meta:{baseWatchLog:true, dayTotalHours:"8", watchOccurrenceKey:date}},
        {logId:date + "-EVENT", ws:"OOD U/W", type:"Event 1", val:"Anchoring", hrs:8, month, watchDate:date, meta:{dayTotalHours:"8", watchOccurrenceKey:date}}
      ]
    }}
  });
  api.importWakeJson(JSON.stringify(source("2026-01-01", "JAN 2026", 10)), "jan.json");
  api.importWakeJson(JSON.stringify(source("2026-09-01", "SEP 2026", 95)), "sep.json");
  api.selectCalendar("2026-09", "2026-01");
  api.selectActivityMonth("USS MONTHS", "2026-01");
  api.renderShips();
  const markup = elements["view-ships"].innerHTML;
  assert.match(markup, /Last watch conducted/);
  assert.match(markup, /Sep(?:tember)? 1,? 2026|2026-09-01/);
  assert.match(markup, /data-daily-month="ship"/);
  assert.match(markup, /<option value="2026-01" selected/);
  assert.match(markup, /<svg class="daily-hours-chart"[^>]*aria-label="January 2026 daily recorded hours line graph"/);
  assert.match(markup, /class="daily-hours-line"/);
  assert.ok(markup.indexOf('data-daily-day="2026-01-01"') < markup.indexOf('data-daily-day="2026-01-31"'), "the graph must run from the first day through the last day of the selected month");
  assert.match(markup, /data-daily-day="2026-01-01"[^>]*aria-label="[^"]*8\.0 h[^"]*1 evolutions[^"]*Anchoring/);
  assert.match(markup, /aria-label="Daily evolution diagram"/);
  assert.match(markup, /data-daily-evolution="ANCHORING" data-daily-day="2026-01-01"/);
  assert.doesNotMatch(markup, /class="command-activity-bar/);
  assert.match(markup, /Anchoring/);
  assert.doesNotMatch(markup, /SAFE <OFFICER>/);
  const summary = markup.match(/<section class="card ship-profile-summary">([\s\S]*?)<\/section>/);
  assert.ok(summary, "familiar overall ship card must remain");
  assert.doesNotMatch(summary[1], /(?:Bridge Logs|Total Q Hours|Total UI Hours|Snapshots)/);
  assert.match(summary[1], /Lost Currency/);
  assert.match(summary[1], /Requires Proficiency Watch/);
});

test("Overview retains fleet posture, levels, and aggregate activity while Ship List stays a filtered table", () => {
  const { api, elements } = commandViewHarness();
  for (const [name, hours, day] of [["USS FIRST", 4, "2026-01-03"], ["USS SECOND", 6, "2026-01-05"]]) {
    api.importWakeJson(JSON.stringify({
      format:"WAKE_JSON_BACKUP", version:1, exportedAt:"2026-01-20T12:00:00Z", ship:name, months:["JAN 2026"], ofrpPhase:"Basic Phase",
      officers:{ ALPHA:{ name:"ALPHA", rank:"LT", autoShipQual:true, autoDaysSince:10, hoursByWS:{"OOD U/W":{Q:hours, UI:0}}, logScores:{}, rorTests:[],
        detectedLogs:[{logId:name+"-WATCH", ws:"OOD U/W", type:"Watch Q", val:"OOD Qualified Watch", hrs:hours, month:"JAN 2026", watchDate:day, events:"Anchoring", baseWatchLog:true, meta:{baseWatchLog:true, dayTotalHours:String(hours), watchOccurrenceKey:day}}]
      }}
    }), name+".json");
  }
  api.selectCalendar("2026-01", "2025-12");
  api.renderDashboard();
  api.renderHeatMaps();
  const overview = elements["view-dashboard"].innerHTML;
  const list = elements["view-heatmaps"].innerHTML;
  assert.match(overview, /data-daily-scope="fleet"/);
  assert.match(overview, /<strong>10\.0<\/strong> dated hours/);
  assert.match(overview, /aria-label="January 2026 daily recorded hours line graph"/);
  assert.match(overview, /data-daily-evolution="ANCHORING" data-daily-day="2026-01-03"/);
  assert.match(overview, /data-daily-evolution="ANCHORING" data-daily-day="2026-01-05"/);
  assert.doesNotMatch(overview, /fleet-calendar-panel|data-fleet-calendar|Compare with/);
  assert.doesNotMatch(overview, /Training Outcomes|Fleet Data Overview/);
  for (const topic of ["Sustained", "Progressing", "Developing", "Recovering"]) assert.match(overview, new RegExp(topic));
  const posture = overview.indexOf("Fleet Ship Data Posture");
  const levels = overview.indexOf("Fleet Levels");
  const chart = overview.indexOf('data-daily-scope="fleet"');
  assert.ok(posture >= 0 && levels > posture && chart > levels, "fleet levels must follow ship posture and precede fleet activity");
  assert.match(list, /heatmap-controls/);
  assert.match(list, /<table/);
  for (const name of ["USS FIRST", "USS SECOND"]) assert.match(list, new RegExp(name));
  assert.doesNotMatch(list, /daily-activity-panel|daily-hours-chart|daily-evolution-scroll|data-daily-scope|data-daily-ship/);
});

test("switching tabs shows one page, marks its tab, and returns to the top", () => {
  const classes = initial => {
    const values = new Set(initial);
    return {
      add:value => values.add(value),
      remove:value => values.delete(value),
      contains:value => values.has(value),
      toggle:(value, enabled) => enabled ? values.add(value) : values.delete(value)
    };
  };
  const views = commandViews.map(([view]) => ({
    id:"view-" + view,
    classList:classes(view === "dashboard" ? ["view"] : ["view", "hidden"]),
    querySelector:() => ({ textContent:view, setAttribute:() => {}, focus:() => {} })
  }));
  const navigation = ["dashboard", "heatmaps", "references"].map(view => ({
    tagName:"BUTTON", dataset:{view}, classList:classes([]), attributes:{},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  }));
  const scrolls = [];
  const api = loadAppApi({ elements:Object.fromEntries(views.map(view => [view.id, view])), views, navigation, scrollTo:(...args) => scrolls.push(args) });
  for (const requested of ["heatmaps", "references", "ships", "performance", "dashboard", "missing"]) {
    const selected = requested === "missing" ? "dashboard" : requested;
    api.switchView(requested);
    assert.deepEqual(views.filter(view => !view.classList.contains("hidden")).map(view => view.id), ["view-" + selected]);
    const active = selected === "ships" ? "heatmaps" : selected;
    assert.deepEqual(navigation.filter(button => button.attributes["aria-current"] === "page").map(button => button.dataset.view), navigation.some(button => button.dataset.view === active) ? [active] : []);
  }
  assert.ok(scrolls.length >= 5, "each different page must reset the previous page's scroll position");
  for (const [first, second] of scrolls) {
    if (typeof first === "object") { assert.equal(first.top, 0); }
    else { assert.equal(first, 0); assert.equal(second, 0); }
  }
});

test("retained legacy lens helpers remain interactive when used as supporting evidence", () => {
  const api = loadAppApi();
  const shell = api.ultrawideWorkspaceRail("Test Lens","Description","Core","Tier two","Tier three","test-rail","Tier four");
  assert.match(shell, /class="ultrawide-context-rail test-rail"/);
  assert.match(shell, /ultrawide-tier-one/);
  assert.match(shell, /ultrawide-tier-two/);
  assert.match(shell, /ultrawide-tier-three/);
  assert.match(shell, /ultrawide-tier-four/);
  assert.match(shell, /Tier four/);

  const evolution = api.ultrawideEvolutionRail({
    unique:2,
    observedCount:1,
    average:1,
    averageCoverage:50,
    total:2,
    eventRecords:2,
    specialConditionRecords:0,
    coverageCounts:{none:1,limited:0,partial:1,fleet:0},
    rows:[
      {key:"ANCHORING",label:"Anchoring",count:2,coveragePct:50,latestTime:Date.parse("2026-07-01"),latestDate:"2026-07-01"},
      {key:"SEA AND ANCHOR",label:"Sea and Anchor",count:0,coveragePct:0,latestTime:null,latestDate:"Not recorded"}
    ]
  });
  assert.match(evolution, /data-open-evolution="ANCHORING"/);
  assert.match(evolution, /Coverage Gaps/);
  assert.match(evolution, /Most Recent Evidence/);

  const explorer = api.ultrawideExplorerRail([
    {ship:"USS TEST",officer:"OFFICER ONE",watchstation:"OOD UW",month:"JUL 2026",hours:4}
  ], 1);
  assert.match(explorer, /data-open-ship="USS TEST"/);
  assert.match(explorer, /data-explorer-filter="watchstation"/);
  assert.match(explorer, /data-explorer-filter="month"/);

  const references = api.ultrawideReferencesRail();
  assert.match(references, /data-view="evolutions"/);
  assert.match(references, /data-view="imports"/);
});

test("retained legacy chart helpers preserve their data and compact chart contracts", () => {
  const api = loadAppApi();
  const metric = {
    ship:"USS TEST",
    phase:"Basic Phase",
    months:["JUL 2026","AUG 2026"],
    officerCount:2,
    bridgeWatchstanders:2,
    logCount:3,
    shipQual:1,
    qualRate:.5,
    level2Plus:.5,
    approaching:1,
    readyToLevelUp:1,
    current:1,
    need:1,
    loss:0,
    unknown:0,
    avgHours:5,
    totalHours:10,
    totalQ:6,
    totalUI:4,
    rorCurrent:1,
    rorRate:.5,
    levels:{Blank:0,"0":0,"1":1,"2":1,"3":0},
    snapshotCount:1,
    allTimeLevelUps:0,
    allTimeLost:0,
    restoredProficiency:0,
    msaAttempts:0,
    msaEvaluated:0,
    msaPassed:0,
    msaFailed:0,
    msaUnderwayHours:0
  };
  const fleet = {
    ships:1,
    officers:2,
    bridgeWatchstanders:2,
    logs:3,
    logsPerOfficer:1.5,
    totalHours:10,
    avgHours:5,
    level2PlusPeople:1,
    level2Plus:.5,
    shipQual:1,
    qualRate:.5,
    current:1,
    currentRate:.5,
    need:1,
    needRate:.5,
    loss:0,
    lossRate:0,
    unknown:0,
    ready:1,
    readyRate:.5,
    rorCurrent:1,
    rorRate:.5
  };
  const evolutionSummary = {
    unique:2,
    observedCount:1,
    average:1,
    averageCoverage:50,
    total:2,
    eventRecords:2,
    specialConditionRecords:0,
    coverageCounts:{none:1,limited:0,partial:1,fleet:0},
    rows:[
      {key:"ANCHORING",label:"Anchoring",count:2,coveragePct:50,latestTime:Date.parse("2026-07-01"),latestDate:"2026-07-01"},
      {key:"SEA AND ANCHOR",label:"Sea and Anchor",count:0,coveragePct:0,latestTime:null,latestDate:"Not recorded"}
    ]
  };
  const ship = {
    name:"USS TEST",
    phase:"Basic Phase",
    sourceGeneratedAt:"2026-07-27T12:00:00Z",
    officers:{
      "OFFICER ONE":{name:"OFFICER ONE",level:"2",currencyCategory:"Current",daysSinceWatch:10,cumulativeBridgeHours:6,shipQual:true,approaching:true,rorTests:[]},
      "OFFICER TWO":{name:"OFFICER TWO",level:"1",currencyCategory:"Need",daysSinceWatch:60,cumulativeBridgeHours:4,shipQual:false,approaching:false,rorTests:[]}
    },
    logs:[
      {ship:"USS TEST",officer:"OFFICER ONE",watchstation:"OOD UW",month:"JUL 2026",hours:1.25,logId:"JUL-1"},
      {ship:"USS TEST",officer:"OFFICER TWO",watchstation:"JOOD UW",month:"JUL 2026",hours:2.75,logId:"JUL-2"},
      {ship:"USS TEST",officer:"OFFICER ONE",watchstation:"OOD UW",month:"AUG 2026",hours:.5,logId:"AUG-1"}
    ]
  };
  const phase = {
    phase:"Basic Phase",
    ships:1,
    officers:2,
    current:1,
    currentRate:.5,
    need:1,
    loss:0,
    level2PlusPeople:1,
    level2Plus:.5,
    shipQual:1,
    qualRate:.5,
    ready:1,
    readyRate:.5,
    rorCurrent:1,
    rorRate:.5
  };
  const reports = [{fileName:"test.csv",ship:"USS TEST",status:"Imported",logsAdded:3,warnings:[],errors:[],snapshots:1}];
  const rendered = [
    api.ultrawideFleetLens([metric], fleet),
    api.ultrawideDecisionBoardRail([metric]),
    api.ultrawideShipListRail([metric],[metric]),
    api.ultrawideEvolutionRail(evolutionSummary),
    api.ultrawideShipRail(ship,metric),
    api.ultrawideOfrpRail([phase],fleet),
    api.ultrawideExplorerRail(ship.logs,ship.logs.length),
    api.ultrawideImportsRail(reports),
    api.ultrawideReferencesRail()
  ];
  rendered.forEach((markup,index) => {
    assert.equal((markup.match(/class="ultrawide-mini-chart"/g) || []).length, 1, `lens ${index + 1} should contain one compact chart`);
    assert.doesNotMatch(markup, /NaN|Infinity/);
  });
  assert.match(rendered[2], /Lowest Current Rates in Filter/);
  assert.match(rendered[4], /Monthly Bridge Hours/);
  assert.match(rendered[4], /4\.0 h/);
  assert.match(rendered[4], /data-open-activity="month"/);
  assert.match(rendered[6], /Filtered Hours by Month/);
});

test("monthly bridge hours sum rows by month and keep chronological order", () => {
  const api = loadAppApi();
  const monthly = api.monthlyBridgeHoursByMonth([
    {month:"AUG 2026",hours:.5},
    {month:"JUL 2026",hours:1.25},
    {month:"JUL 2026",hours:2.75}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(monthly)), {"JUL 2026":4,"AUG 2026":.5});
  const chart = api.barsHtml(monthly, {
    shipKey:"USS TEST",
    type:"month",
    sort:"month",
    unit:"recorded bridge hours",
    valueFormatter:value => value.toFixed(1)
  });
  assert.ok(chart.indexOf("JUL 2026") < chart.indexOf("AUG 2026"));
  assert.match(chart, /Explain JUL 2026: 4\.0 recorded bridge hours/);
  assert.match(chart, /data-open-activity="month"/);
});

test("currency presentation uses the requested labels while internal categories stay stable", () => {
  const api = loadAppApi();
  assert.equal(api.currencyStatusLabel("Need"), "Requires Proficiency Watch");
  assert.equal(api.currencyStatusLabel("Loss"), "Lost Currency");
  assert.equal(api.currencyStatusLabel("Current"), "Current");
  assert.doesNotMatch(html, /Need Proficiency|Lost Proficiency/);
  assert.doesNotMatch(html, /Lowest Ship-Qualified Share|Highest Activity Depth/);
  assert.match(html, /Lowest Ship Qualification Rate/);
  assert.match(html, /Highest Logs per Watchstander/);
});

test("figures, evolutions, activity bars, and level tiles expose drilldown controls", () => {
  for (const contract of [
    "data-explain-figure",
    "data-open-evolution",
    "data-open-activity",
    "data-open-ship-level",
    "data-open-fleet-level",
    "function openFigureExplanation(control)",
    "function openEvolutionDrilldown(key, shipKey)",
    "function openActivityBreakdown(shipKey, type, label)",
    "function openShipLevelDrilldown(shipKey, level)",
    "function openFleetLevelDrilldown(level)"
  ]) assert.ok(html.includes(contract), `missing interaction contract: ${contract}`);
});

test("evolution totals merge participating watchstanders but preserve separate same-day sessions", () => {
  const api = loadAppApi();
  const evolution = "Sea and Anchor Detail (Day)";
  const log = (ship, officer, day, time, id) => ({
    ship,
    officer,
    month:"JUL 2026",
    watchDate:day,
    logId:id,
    watchstation:officer === "OFFICER ONE" ? "OOD UW" : "JOOD UW",
    events:evolution,
    rawText:evolution,
    rawRowData:time ? { COMMENTS:"2026-07-" + (day.startsWith("12") ? "12" : "13") + " " + time + " | Sea and Anchor Detail" } : {}
  });
  const logs = [
    log("USS ALPHA","OFFICER ONE","12 JUL","0600-1000","ONE2026071206001000"),
    log("USS ALPHA","OFFICER TWO","12 JUL","0600-1000","TWO2026071206001000"),
    log("USS ALPHA","OFFICER ONE","12 JUL","1400-1600","ONE2026071214001600"),
    log("USS ALPHA","OFFICER ONE","13 JUL","0600-1000","ONE2026071306001000"),
    log("USS BRAVO","OFFICER THREE","12 JUL","0600-1000","THREE2026071206001000"),
    log("USS ALPHA","OFFICER ONE","","","UNDATED-ONE"),
    log("USS ALPHA","OFFICER TWO","","","UNDATED-TWO")
  ];
  const row = api.evolutionRowsForLogs(logs,false).find(item => item.key === "SEA AND ANCHOR DETAIL DAY");
  assert.ok(row);
  assert.equal(row.count, 6);
  assert.equal(row.eventCount, 6);
  assert.equal(row.shipCount, 2);

  const groups = api.evolutionOccurrenceGroups(logs,"SEA AND ANCHOR DETAIL DAY");
  assert.equal(groups.length, 6);
  assert.equal(groups.find(group => group.sessionLabel === "0600-1000" && group.ship === "USS ALPHA" && group.dateLabel.startsWith("12 JUL")).officers.size, 2);

  const evidence = api.evolutionEvidenceTable(logs,"SEA AND ANCHOR DETAIL DAY");
  assert.match(evidence, /OFFICER ONE/);
  assert.match(evidence, /OFFICER TWO/);
  assert.match(evidence, /2 source rows/);
  assert.match(evidence, />0600-1000</);
});

test("render helpers output keyboard-native interactive elements", () => {
  const api = loadAppApi();
  const chart = api.evolutionChart([
    { key:"ANCHORING", label:"Anchoring", average:.5, coveragePct:50, shipCount:1 }
  ], 2);
  assert.match(chart, /<div class="evolution-chart-column"/);
  assert.match(chart, /<button type="button" class="evolution-chart-column-fill/);
  assert.doesNotMatch(chart, /<button[^>]+class="evolution-chart-column"/);
  assert.match(chart, /data-open-evolution="ANCHORING"/);
  assert.match(chart, /Select to see the calculation and evidence/);

  const table = api.evolutionTable([
    { key:"ANCHORING", label:"Anchoring", count:1, average:.5, coveragePct:50, shipCount:1, sourceTypes:["Event"], latestDate:"2026-07-01" }
  ], true, 2, "USS TEST");
  assert.match(table, /class="evolution-table-trigger"/);
  assert.match(table, /data-ship-key="USS TEST"/);

  const shipLevel = api.levelHeatCell("Level 2", 4, 10, "heat-l2", "USS TEST", "2");
  assert.match(shipLevel, /<button/);
  assert.match(shipLevel, /data-open-ship-level="2"/);
  assert.match(shipLevel, /data-ship-key="USS TEST"/);

  const fleetLevel = api.levelHeatCell("Level 3", 2, 10, "heat-l3", "", "3");
  assert.match(fleetLevel, /data-open-fleet-level="3"/);

  const activity = api.barsHtml({ "OOD UW":12 }, { shipKey:"USS TEST", type:"watchstation" });
  assert.match(activity, /class="bar-row activity-bar-row"/);
  assert.match(activity, /<button type="button" class="bar-fill activity-bar-button"/);
  assert.doesNotMatch(activity, /<button[^>]+class="bar-row/);
  assert.match(activity, /data-open-activity="watchstation"/);
  assert.match(activity, /data-activity-label="OOD UW"/);
});

test("explanation copy makes formulas and evidence boundaries explicit", () => {
  const api = loadAppApi();
  assert.match(api.figureExplanationText("Current").method, /divided by imported watchstanders/i);
  assert.match(api.figureExplanationText("Level 2+").method, /Level 2 plus Level 3/i);
  assert.match(api.figureExplanationText("Approaching Next Level").why, /not proof/i);
  assert.match(api.figureExplanationText("Average Evolutions / Ship").method, /including ships with zero/i);
  assert.match(api.figureExplanationText("Average Evolutions / Ship").included, /Different time periods on the same day remain separate/i);
  assert.match(api.figureExplanationText("MSA Pass Rate").method, /divided by all evaluated/i);
});

test("WAKE logo is fully embedded and does not depend on a separate image path", () => {
  assert.match(html, /<svg class="wake-coded-logo" data-wake-logo/);
  assert.match(appScript, /data:image\/svg\+xml;charset=utf-8/);
  assert.doesNotMatch(html, /WAKE\/WAKE LOGO\.png/);
});

test("ship imports accept only the five canonical OFRP phases", () => {
  const api = loadAppApi();
  const accepted = [
    ["basic", "Basic Phase"],
    ["ADVANCED PHASE", "Advanced Phase"],
    [" integrated ", "Integrated Phase"],
    ["Sustainment", "Sustainment Phase"],
    ["maintenance phase", "Maintenance Phase"]
  ];
  accepted.forEach(([input, expected]) => assert.equal(api.normalizeImportedPhase(input), expected));
  ["", "Unspecified", "Deployment Phase", "Maintenance Availability", "Basic / Advanced"].forEach(input => {
    assert.equal(api.normalizeImportedPhase(input), "", `${input || "blank"} should not be accepted`);
  });

  const header = ["TORIS_EXPORT_VERSION","Ship","OFRP Phase","Officer Name","Record Type","Watchstation","Log ID"];
  const invalid = api.importRows([
    header,
    ["TORIS_OOD_TRACKER_V1","USS TEST","Deployment Phase","TEST, JANE","WATCH_LOG","OOD UW","LOG-INVALID"]
  ], "invalid-phase.csv");
  assert.equal(invalid.status, "Rejected");
  assert.match(invalid.errors.join(" "), /Accepted phases are Basic, Advanced, Integrated, Sustainment, or Maintenance/i);
  assert.equal(Object.keys(api.getState().ships).length, 0);

  const missing = api.importRows([
    header,
    ["TORIS_OOD_TRACKER_V1","USS TEST","","TEST, JANE","WATCH_LOG","OOD UW","LOG-MISSING"]
  ], "missing-phase.csv");
  assert.equal(missing.status, "Rejected");
  assert.match(missing.errors.join(" "), /Every imported ship row must identify an OFRP phase/i);
  assert.equal(Object.keys(api.getState().ships).length, 0);

  const wakeJsonBase = {
    format:"WAKE_JSON_BACKUP",
    version:1,
    ship:"USS TEST",
    months:[],
    officers:{ "TEST, JANE":{ detectedLogs:[] } }
  };
  assert.throws(
    () => api.parseWakeJsonPayload(JSON.stringify(Object.assign({}, wakeJsonBase, { ofrpPhase:"Deployment Phase" })), "invalid.json"),
    /accepted OFRP phase: Basic, Advanced, Integrated, Sustainment, or Maintenance/i
  );
  assert.throws(
    () => api.parseWakeJsonPayload(JSON.stringify(wakeJsonBase), "missing.json"),
    /accepted OFRP phase/i
  );

  assert.throws(() => api.validateFleetBackupPayload({
    format:"FLEET_WAKE_BACKUP",
    version:2,
    ships:{
      "USS TEST":{
        name:"USS TEST",
        phase:"Deployment Phase",
        officers:{},
        logs:[],
        snapshots:[],
        sourceFiles:[]
      }
    },
    importReports:[],
    historyEvents:[]
  }), /must use an accepted OFRP phase/i);
});

test("phase changes reassign current ship data and generate one popup transition", () => {
  const api = loadAppApi();
  const header = ["TORIS_EXPORT_VERSION","Ship","OFRP Phase","Officer Name","Record Type","Watchstation","Log ID","Current Level","Month"];
  const rowsFor = (phase, logId) => [
    header,
    ["TORIS_OOD_TRACKER_V1","USS TEST",phase,"TEST, JANE","WATCH_LOG","OOD UW",logId,"0","JUL 2026"]
  ];

  const first = api.importRows(rowsFor("Basic", "LOG-BASIC"), "basic.csv");
  assert.equal(first.status, "Imported");
  assert.equal(first.phase, "Basic Phase");
  assert.equal(first.phaseChanged, false);

  const second = api.importRows(rowsFor("Advanced Phase", "LOG-ADVANCED"), "advanced.csv");
  assert.equal(second.status, "Imported");
  assert.equal(second.previousPhase, "Basic Phase");
  assert.equal(second.phase, "Advanced Phase");
  assert.equal(second.phaseChanged, true);
  assert.match(second.notes.join(" "), /all current ship data and analytics moved to the new phase/i);

  const ship = api.getState().ships["USS TEST"];
  assert.equal(ship.phase, "Advanced Phase");
  assert.ok(ship.logs.length > 0);
  assert.ok(ship.logs.every(log => log.phase === "Advanced Phase"));
  assert.deepEqual(Array.from(ship.snapshots, snapshot => snapshot.phase), ["Basic Phase","Advanced Phase"]);

  const changes = api.importedPhaseChanges([first, second]);
  assert.equal(changes.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(changes[0])),
    { ship:"USS TEST", previousPhase:"Basic Phase", phase:"Advanced Phase", fileName:"advanced.csv" }
  );
  assert.match(html, /function showImportedPhaseChanges\(changes\)/);
  assert.match(html, /Ship Phase Changed/);
});

test("L0 uses the same designation pattern as L1 through L3 throughout the app", () => {
  const api = loadAppApi();
  assert.equal(api.officerLevelLabel("0"), "L0");
  assert.equal(api.officerLevelLabel("1"), "L1");
  assert.equal(api.officerLevelLabel("2"), "L2");
  assert.equal(api.officerLevelLabel("3"), "L3");
  assert.equal(api.officerLevelLabel(""), "Unclassified");

  for (const stale of [
    "Foundational",
    "F (L0)",
    'watchstanderLevelSegment("F"',
    "Level 0/1",
    "L0/1",
    "Level 2/3",
    "L2/3"
  ]) assert.ok(!html.includes(stale), `stale level notation: ${stale}`);
  assert.match(html, /"L0","L1","L2","L3","Unclassified Level"/);
});
