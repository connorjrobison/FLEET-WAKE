// Familiar Fleet WAKE views retained from the SharePoint application before the redesign.
function classicRenderDashboard() {
  const host = document.getElementById("view-dashboard");
  const fleet = fleetMetrics();
  const baseMetrics = allShipMetrics();
  const rows = categorizedShipMetrics(baseMetrics);
  const aggregate = fleetAggregateMetrics(rows);
  if (!fleet.shipCount) {
    host.innerHTML =
      "<div class=\"dashboard-hero\" data-walkthrough-step=\"dashboard\"><h1 class=\"view-title\">Fleet Overview</h1><p>Import WAKE ship data to begin.</p></div>" +
      homeCommandRibbon() +
      emptyState("No fleet data loaded. Import one WAKE CSV export or WAKE JSON working copy per ship.") +
      ultrawideNoDataRail("Fleet Overview");
    return;
  }
  host.innerHTML =
    topbar("Fleet Overview", "Simple fleet figures, level distribution, training outcomes, and drill-to-evidence data.") +
    homeCommandRibbon() +
    fleetDataPosturePanel(rows) +
    "<div class=\"fleet-overview-stack\">" +
    "<section class=\"analytics-panel\" id=\"level-layout-home\"><h3>Fleet Level Distribution</h3><p>Total L0, L1, L2, L3, and Unclassified watchstanders across the imported fleet.</p>" + levelDistributionPanel(rows) + "</section>" +
    fleetOverviewFigures(rows, aggregate) +
    assessmentOutcomePanel(aggregate, rows) + "</div>" +
    ultrawideFleetLens(rows, aggregate);
}

function classicRenderHeatMaps() {
  const host = document.getElementById("view-heatmaps");
  const focusState = captureRerenderFocus(host);
  const baseMetrics = allShipMetrics();
  const metrics = withOperationalMetrics(baseMetrics);
  if (!metrics.length) {
    host.innerHTML = topbar("Ship List", "Horizontal ship data view of OFRP phase, levels, currency, qualifications, ROR, activity, and outcomes.") + emptyState("No ships imported.") + ultrawideNoDataRail("Ship List");
    restoreRerenderFocus(host, focusState);
    return;
  }
  const rows = filteredHeatmapMetrics(metrics);
  const postureContext = heatmapFilters.posture ? " Showing only " + heatmapFilters.posture + " ships." : "";
  host.innerHTML =
    ultrawideShipListRail(metrics,rows) +
    "<div class=\"card roster-workspace-card fleet-ship-list-card\" data-walkthrough-step=\"heatmap-list\">" +
    "<div class=\"roster-workspace-head\"><div><span class=\"section-kicker\">Fleet Roster</span><h2 class=\"card-header\" style=\"margin-bottom:2px;\">Ship List</h2><p>Each ship is one horizontal row with its imported levels, currency, qualifications, ROR, hours, logs, and outcomes." + h(postureContext) + "</p></div>" +
    "<button class=\"btn secondary fleet-overview-return\" type=\"button\" data-view=\"dashboard\">Fleet Overview</button></div>" +
    shipListSummary(rows) +
    heatmapControlPanel(metrics, rows.length) +
    (rows.length ? shipListTable(rows, "shipList") : emptyState("No ships match the current filters.")) +
    "</div>";
  restoreRerenderFocus(host, focusState);
}

function classicRenderShips() {
  const host = document.getElementById("view-ships");
  const ships = allShips();
  if (!ships.length) {
    host.innerHTML = topbar("Ships", "Review each imported ship.") + emptyState("No ships imported.") + ultrawideNoDataRail("Ship View");
    return;
  }
  if (!selectedShipKey || !state.ships[selectedShipKey]) selectedShipKey = keyFor(ships[0].name);
  const ship = state.ships[selectedShipKey];
  const m = shipMetrics(ship);
  const options = ships.map(item => "<option value=\"" + h(keyFor(item.name)) + "\"" + (keyFor(item.name) === selectedShipKey ? " selected" : "") + ">" + h(item.name) + "</option>").join("");
  const controls = "<select id=\"ship-select\">" + options + "</select>";
  host.innerHTML =
    topbar("Ship View", "Overall ship data with roster and evidence available through the ship actions.", controls) +
    shipProfileHero(m) +
    shipEvolutionPanel(ship) +
    shipProfileSummary(m) +
    "<div class=\"ship-profile-secondary\">" +
    "<div class=\"card\"><div class=\"section-title\"><h3>Watchstation Activity</h3><span>Select a bar to see its logs</span></div>" + barsHtml(m.byWatchstation, { shipKey:keyFor(ship.name), type:"watchstation" }) + "</div>" +
    "<div class=\"card\"><div class=\"section-title\"><h3>Monthly Bridge Hours</h3><span>Select a bar to see its logs and recorded hours</span></div>" + barsHtml(monthlyBridgeHoursByMonth(bridgeLogsForShip(ship)), { shipKey:keyFor(ship.name), type:"month", sort:"month", unit:"recorded bridge hours", valueFormatter:value => fmt(value,1) }) + "</div>" +
    "</div>" +
    ultrawideShipRail(ship,m);
}

function classicRenderPerformance() {
  const host = document.getElementById("view-performance");
  const metrics = allShipMetrics();
  if (!metrics.length) {
    host.innerHTML = topbar("Watchstander Decision Board", "See which ships need qualified watchstander depth and which ships set the fleet benchmark.") + emptyState("No ships imported.") + ultrawideNoDataRail("Decision Board");
    return;
  }
  host.innerHTML =
    topbar("Watchstander Decision Board", "Compare every ship's watchstander levels and qualified depth, then open the underlying ship data.") +
    performanceGraph(metrics) +
    ultrawideDecisionBoardRail(metrics);
}

function classicRenderEvolutions() {
  const host = document.getElementById("view-evolutions");
  if (!host) return;
  const summary = evolutionSummary(allLogs(), allShips().length, true);
  host.innerHTML =
    topbar("Evolutions", "Average evolution activity with bar colors showing the share of imported ships that recorded each evolution.") +
    "<div class=\"evolution-summary-grid\">" +
      evolutionSummaryCard("Tracked Evolutions", summary.unique, summary.observedCount + " have at least one current fleet record", "event") +
      evolutionSummaryCard("Average Evolutions / Ship", formatEvolutionAverage(summary.average), "Distinct evolution sessions divided by all imported ships", "event") +
      evolutionSummaryCard("Average Fleet Coverage", formatEvolutionCoverage(summary.averageCoverage), "Mean share of ships represented across tracked evolutions", "warn") +
      evolutionSummaryCard("Fleet-Wide Evolutions", summary.coverageCounts.fleet, "Recorded by at least 95% of imported ships", "good") +
      evolutionSummaryCard("Not Yet Observed", summary.coverageCounts.none, "Red bars recorded by 0% of imported ships", "bad") +
    "</div>" +
    "<section class=\"card evolution-chart-card\"><div class=\"section-title\"><h3>Fleet Evolution Average</h3><span>" + h(summary.unique.toLocaleString()) + " tracked evolutions</span></div><p class=\"plain-explain\">Bar height is the average distinct sessions per imported ship. Watchstanders on the same ship, date, and watch period count together; separate time periods on the same day remain separate evolutions. Bar color is fleet participation: red at 0%, orange from 1-49%, yellow from 50-94%, and green at 95% or greater. Ships with zero records remain in every average.</p>" + evolutionCoverageLegend(summary) + evolutionChart(summary.rows, summary.shipCount) +
    "<div class=\"evolution-detail-block\"><div class=\"section-title\"><h3>Evolution Averages</h3><span>Average, ship coverage, and latest date</span></div>" + evolutionTable(summary.rows, true, summary.shipCount) + "</div></section>" +
    ultrawideEvolutionRail(summary);
}

function classicRenderOfrp() {
  const host = document.getElementById("view-ofrp");
  const metrics = allShipMetrics();
  if (!metrics.length) {
    host.innerHTML = topbar("OFRP Phase Comparison", "Compare phases on the same weighted watchstander measures.") + emptyState("No ships imported.") + ultrawideNoDataRail("OFRP Analysis");
    return;
  }
  const rows = phaseSummaryRows(metrics);
  const fleet = fleetAggregateMetrics(metrics);
  host.innerHTML =
    topbar("OFRP Phase Comparison", "Compare phases, see where phase outcomes diverge, and open the ships behind every point.") +
    "<div class=\"command-analytics-page\">" +
    "<section class=\"command-chart-panel\"><div class=\"command-chart-head\"><div><h3>Weighted Phase Comparison</h3><p>Every rate uses the people in that phase, not an average of ship percentages. The marker inside each bar is the weighted fleet baseline; select a phase to open its ships.</p></div></div>" + ofrpPhaseComparisonMatrix(rows, fleet) + "</section>" +
    "<section class=\"command-chart-panel\"><div class=\"command-chart-head\"><div><h3>Watchstander Level Mix by Phase</h3><p>Each phase is normalized to 100%, revealing whether changes between phases are coming from a deeper senior bench or a larger developing population.</p></div>" + watchstanderLevelLegend() + "</div><div class=\"command-chart-scroll\">" + ofrpPhaseLevelChart(rows) + "</div></section>" +
    "<section class=\"command-chart-panel\"><div class=\"command-chart-head\"><div><h3>Phase Relationship Map</h3><p>Current currency and Level 2+ depth are plotted together. Phases in the upper-right outperform the fleet on both; phases in the lower-left trail the fleet on both.</p></div></div><div class=\"command-chart-scroll\">" + ofrpPhaseRelationshipMap(rows, fleet) + "</div>" +
    "<p class=\"chart-method-note\">Each ship is assigned to its currently reported OFRP phase. Historical logs may span earlier periods; WAKE Fleet does not infer the phase in effect for each event.</p></section>" +
    "<details class=\"analysis-disclosure\"><summary>Open complete OFRP phase data</summary>" + ofrpCompleteDataTable(rows) + "</details>" +
    "</div>" +
    ultrawideOfrpRail(rows,fleet);
}

function classicRenderExplorer() {
  const host = document.getElementById("view-explorer");
  const focusState = captureRerenderFocus(host);
  const logs = filteredLogs();
  if (!allLogs().length) {
    host.innerHTML = topbar("All Data Explorer", "Search and filter every imported bridge watch row.") + emptyState("No bridge watch rows imported.") + ultrawideNoDataRail("Data Explorer");
    restoreRerenderFocus(host, focusState);
    return;
  }
  const shipOpts = allShips().map(ship => "<option value=\"" + h(ship.name) + "\">" + h(ship.name) + "</option>").join("");
  const phaseOpts = sortPhaseNames(unique(allShipMetrics().map(m => m.phase))).map(v => "<option value=\"" + h(v) + "\">" + h(v) + "</option>").join("");
  const exportControl = "<button class=\"btn secondary\" id=\"explorer-export-btn\" type=\"button\"" + (logs.length ? "" : " disabled aria-disabled=\"true\"") + ">Export Filtered Rows</button>";
  host.innerHTML =
    topbar("All Data Explorer", logs.length.toLocaleString() + " matching rows from " + allLogs().length.toLocaleString() + " imported bridge logs.", exportControl) +
    "<div class=\"filters\">" +
    selectFilter("ship", "All ships", shipOpts) +
    selectFilter("phase", "All phases", phaseOpts) +
    selectFilter("month", "All months", filterOptions("month")) +
    selectFilter("watchstation", "All watchstations", filterOptions("watchstation")) +
    selectFilter("level", "All levels", "<option value=\"Blank\">Blank</option><option value=\"0\">0</option><option value=\"1\">1</option><option value=\"2\">2</option><option value=\"3\">3</option>") +
    selectFilter("currency", "All currency", "<option value=\"Current\">Current</option><option value=\"Need\">Requires Proficiency Watch</option><option value=\"Loss\">Lost Currency</option>") +
    selectFilter("area", "All areas", filterOptions("area")) +
    selectFilter("traffic", "All traffic", filterOptions("traffic")) +
    "<input aria-label=\"Search imported rows\" id=\"filter-search\" placeholder=\"Search officer, ship, log text\" type=\"search\" value=\"" + h(explorerFilters.search) + "\">" +
    "<button class=\"admin-roster-reset\" id=\"explorer-reset\" type=\"button\">Clear filters</button>" +
    "<div aria-atomic=\"true\" aria-live=\"polite\" class=\"admin-roster-count\" id=\"explorer-count\" role=\"status\">" + h(logs.length.toLocaleString()) + " of " + h(allLogs().length.toLocaleString()) + " rows shown</div>" +
    "</div>" +
    "<div class=\"card\"><div class=\"section-title\"><h3>Imported Watch Rows</h3><span>" + h(logs.length.toLocaleString()) + " matching rows</span></div>" + (logs.length ? logsTable(logs) : emptyState("No imported rows match the current filters.")) + "</div>" +
    ultrawideExplorerRail(logs,allLogs().length);
  restoreRerenderFocus(host, focusState);
}

function classicRenderImports() {
  const host = document.getElementById("view-imports");
  const reports = (state.importReports || []).slice().reverse();
  host.innerHTML =
    topbar("Import Report", "Validation results and per-file summaries.") +
    (reports.length ? "<div class=\"import-log\">" + reports.map(report => {
      const kind = report.errors && report.errors.length ? "error" : (report.warnings && report.warnings.length ? "warn" : "");
      return "<div class=\"import-item " + kind + "\"><strong>" + h(report.fileName) + " - " + h(report.status) + "</strong>" +
        "<div>" + h(report.sourceType || "WAKE CSV") + " | " + h(report.ship || "No ship") + " | " + h(report.phase || "No phase") + " | " + h(report.officers || 0) + " officers | " + h((report.logsAdded || 0).toLocaleString()) + " bridge logs added | " + h(report.duplicateLogs || 0) + " log duplicates ignored | " + h(report.msaRecordsAdded || 0) + " MSA outcomes added | " + h(report.msaRecordsUpdated || 0) + " MSA outcomes corrected | " + h(report.duplicateMsaRecords || 0) + " MSA duplicates ignored | " + h(report.nonBridgeRowsSkipped || 0) + " non-bridge skipped | " + h(report.snapshots || 0) + " snapshots | " + h(report.historyEvents || 0) + " movement events</div>" +
        (report.errors && report.errors.length ? "<ul>" + report.errors.map(e => "<li>" + h(e) + "</li>").join("") + "</ul>" : "") +
        (report.warnings && report.warnings.length ? "<ul>" + unique(report.warnings).map(w => "<li>" + h(w) + "</li>").join("") + "</ul>" : "") +
        (report.notes && report.notes.length ? "<ul>" + unique(report.notes).map(note => "<li>Info: " + h(note) + "</li>").join("") + "</ul>" : "") +
        "</div>";
    }).join("") + "</div>" : emptyState("No imports yet.")) +
    ultrawideImportsRail(reports);
}

function classicRenderReferences() {
  const host = document.getElementById("view-references");
  if (!host) return;
  host.innerHTML =
    topbar("References", "WAKE Fleet guide, metric definitions, and common workflows.") +
    "<div class=\"card roster-workspace-card\">" +
      "<div class=\"roster-workspace-head\"><div><h2 class=\"card-header\" style=\"margin-bottom:2px;\">WAKE Fleet Guide</h2><p>Use the same WAKE workflow at fleet scale: import, review the overview, open the roster-style Ship List, then drill into evidence.</p></div></div>" +
      "<div class=\"reference-guide-grid\">" +
        referenceGuideCard("Metric Scope", [
          "WAKE Fleet reads WAKE ship CSV exports and WAKE JSON working copies, then keeps OOD, JOOD, and CONN bridge watch data.",
          "Fleet metrics aggregate ships, bridge watchstanders, logs, levels, currency, ROR, and OFRP phase posture.",
          "Ship detail and officer profiles remain drilldowns; Fleet Overview stays an aggregated commander picture."
        ]) +
        referenceGuideCard("Core Workflow", [
          "Import one WAKE CSV export or WAKE JSON working copy per ship from Start Here.",
          "Use Start Here first, then scan the simple figures at the top of Fleet Overview.",
          "Use Evolutions to compare average activity and ship coverage. Red means 0%, orange means 1-49%, yellow means 50-94%, and green means at least 95% of imported ships recorded the evolution.",
          "Use Ship List to scan one horizontal data row per ship, filter the imported measures, and open ship-level evidence."
        ]) +
        referenceGuideCard("Exports And Backups", [
          "Export Fleet Backup preserves the local WAKE Fleet working state.",
          "Full Fleet CSV exports ship, officer, watch log, and phase summary rows for analysis.",
          "Current Status PDF creates a leader-ready WAKE-branded status report."
        ]) +
        referenceGuideCard("Readiness Terms", [
          "Current, Requires Proficiency Watch, and Lost Currency are derived from imported WAKE bridge watchstander currency posture.",
          "Level 2+ shows depth of more experienced WAKE watchstanders across the imported force.",
          "ROR coverage requires a dated passing score of 90% or higher within 365 days. Undated or future-dated passing records are flagged Needs review."
        ]) +
        referenceGuideCard("Direct Data & Governance", [
          "WAKE Fleet reports imported totals, counts, and rates; it does not create a composite fleet or ship risk score.",
          "WAKE JSON submitted hours are counted once from each base watch row; related event and special-condition evidence does not inflate watchstander or fleet totals.",
          "OFRP comparisons group each ship under its current reported phase. Logs and MSA outcomes can span imported capture periods and are not treated as event-time phase evidence.",
          "Approaching Next Level is an hours-based progression indicator, not an approval queue or proof that every advancement gate is complete.",
          "Source timestamps, import warnings, and explicit Unknown values remain visible so missing evidence cannot appear favorable."
        ]) +
        referenceGuideCard("Data Confidence", [
          "Set the expected ship count and freshness threshold from Fleet Overview so missing data cannot look green.",
          "High confidence requires configured coverage, current ship imports, no recent rejection, and comparable snapshots for most ships.",
          "Training outcome rates with fewer than 10 evaluated MSA attempts are directional only."
        ]) +
      "</div>" +
    "</div>" +
    ultrawideReferencesRail();
}

function classicHomeCommandRibbon() {
  const hasData = allShips().length > 0;
  const quality = fleetDataQuality(allShipMetrics());
  return "<div class=\"card overview-start-card admin-command-card\" data-walkthrough-step=\"dashboard\">" +
    "<div class=\"overview-start-head\">" +
      "<div class=\"overview-start-title\"><h2>Start Here</h2><p>" + h(hasData ? "Refresh ship data or open a fleet workflow." : "Import fleet data first, then use the common review tools.") + "</p></div>" +
      "<div class=\"overview-start-actions\">" +
        "<button class=\"btn btn-export start-primary\" id=\"admin-import-btn\" type=\"button\">Import WAKE Data</button>" +
        "<button class=\"start-secondary start-backup\" id=\"admin-export-btn\" type=\"button\">Export Backup</button>" +
        "<button class=\"start-secondary\" id=\"admin-roster-btn\" type=\"button\" data-view=\"heatmaps\">Ship List</button>" +
        "<button class=\"start-secondary\" id=\"admin-decision-btn\" type=\"button\" data-view=\"performance\">Decision Board</button>" +
        "<button class=\"start-secondary\" id=\"admin-evolutions-btn\" type=\"button\" data-view=\"evolutions\">Evolutions</button>" +
        "<button class=\"start-secondary\" id=\"admin-ofrp-btn\" type=\"button\" data-view=\"ofrp\">OFRP Analysis</button>" +
        "<details class=\"more-actions\"><summary class=\"start-secondary\">More Actions</summary><div class=\"more-actions-menu\">" +
          "<button class=\"admin-command-btn\" id=\"coach-btn\" type=\"button\">Interactive Coach<span>Guided fleet workflow</span></button>" +
          "<button class=\"admin-command-btn\" type=\"button\" data-view=\"references\">References / User Guide<span>Metric definitions and workflow notes</span></button>" +
          "<button class=\"admin-command-btn\" id=\"admin-data-btn\" type=\"button\" data-view=\"explorer\">All Data<span>Filter and export imported bridge rows</span></button>" +
          "<button class=\"admin-command-btn\" id=\"admin-import-report-btn\" type=\"button\" data-view=\"imports\">Import Report<span>Validation results and file summaries</span></button>" +
          "<button class=\"admin-command-btn\" id=\"restore-btn\" type=\"button\">Import Fleet Backup<span>Restore a saved WAKE Fleet working copy</span></button>" +
          "<button class=\"admin-command-btn\" id=\"full-csv-btn\" type=\"button\">Export Full Fleet CSV<span>Ship, officer, log, and phase rows</span></button>" +
          "<button class=\"admin-command-btn\" id=\"pdf-report-btn\" type=\"button\">Export Current Status PDF<span>Leader-ready WAKE status brief</span></button>" +
          "<button class=\"admin-command-btn\" id=\"filtered-export-btn\" type=\"button\">Export Filtered Rows<span>Current All Data Explorer rows</span></button>" +
          "<button class=\"admin-command-btn danger\" id=\"clear-btn\" type=\"button\">Clear Uploaded Data<span>Reset local fleet data</span></button>" +
        "</div></details>" +
      "</div>" +
    "</div>" +
    "<label class=\"drop-zone\" id=\"drop-zone\" for=\"file-input\"><strong>Import WAKE ship data</strong><span>Drop WAKE CSV or JSON files here, or select files.</span></label>" +
    dataHealthStrip(quality) +
  "</div>";
}

function classicShipProfileSummary(m) {
  const total = Math.max(0, asNumber(m.officerCount));
  const level2Plus = asNumber(m.levels && m.levels["2"]) + asNumber(m.levels && m.levels["3"]);
  return "<section class=\"card ship-profile-summary\"><div class=\"ship-profile-summary-head\"><div><h3>Overall Ship Data</h3><p>Latest roster · currency aged to today, assuming no later watch.</p></div></div><div class=\"ship-profile-data-grid\">" +
    shipProfileStat("Watchstanders", total, m.bridgeWatchstanders + " bridge watchstanders", "blue") +
    shipProfileStat("Current", total ? pct(m.current / total) : "N/A", m.current + " of " + total, "blue") +
    shipProfileStat("Unknown Currency", m.unknown, m.unknown ? "Missing or invalid currency evidence" : "All currency records assessed", m.unknown ? "warn" : "blue") +
    shipProfileStat("Level 2+", total ? pct(level2Plus / total) : "N/A", level2Plus + " at Level 2 or 3", "blue") +
    shipProfileStat("Ship Qualified", total ? pct(m.shipQual / total) : "N/A", m.shipQual + " of " + total, "blue") +
    shipProfileStat("Requires Proficiency Watch", m.need, total ? pct(m.need / total) + " of watchstanders" : "No watchstanders", m.need ? "warn" : "good") +
    shipProfileStat("Lost Currency", m.loss, total ? pct(m.loss / total) + " of watchstanders" : "No watchstanders", m.loss ? "bad" : "good") +
    shipProfileStat("Approaching Next Level", m.readyToLevelUp, total ? pct(m.readyToLevelUp / total) + " of watchstanders" : "N/A", "blue") +
    shipProfileStat("ROR Coverage", total ? pct(m.rorRate) : "N/A", m.rorCurrent + " with current ROR", "blue") +    shipProfileStat("Average Hours", fmt(m.avgHours,1), "Cumulative bridge hours per watchstander", "blue") +    shipProfileStat("All-Time Level Ups", m.allTimeLevelUps, "Recorded across snapshots", "good") +
    shipProfileStat("All-Time Lost Currency", m.allTimeLost, "Unique watchstanders seen with lost currency", m.allTimeLost ? "bad" : "good") +
    shipProfileStat("Currency Restored", m.restoredProficiency, "Recorded recoveries", "good") +
    "</div></section>";
}

function classicUltrawideFleetLens(rows, aggregate) {
  const normalized = phaseNormalizedMetrics(rows || []);
  const quality = fleetDataQuality(normalized);
  const movement = leadershipMovementSummary();
  const lowestLevel2 = normalized.slice().sort((a,b) => asNumber(a.level2Plus) - asNumber(b.level2Plus) || String(a.ship).localeCompare(String(b.ship)));
  const lowestQualification = normalized.slice().sort((a,b) => asNumber(a.qualRate) - asNumber(b.qualRate) || String(a.ship).localeCompare(String(b.ship)));
  const activityDepth = normalized.slice().sort((a,b) => asNumber(b.logsPerOfficer) - asNumber(a.logsPerOfficer) || String(a.ship).localeCompare(String(b.ship)));
  const core =
    ultrawideRailStats([
      { label:"Current", value:aggregate.officers ? pct(aggregate.current / aggregate.officers) : "N/A", detail:aggregate.current + " of " + aggregate.officers, attrs:figureAttrs("Current", aggregate.officers ? pct(aggregate.current / aggregate.officers) : "N/A", aggregate.current + " of " + aggregate.officers + " watchstanders", "fleet", "", "ultrawide") },
      { label:"Level 2+", value:aggregate.officers ? pct(aggregate.level2PlusPeople / aggregate.officers) : "N/A", detail:aggregate.level2PlusPeople + " people", attrs:figureAttrs("Level 2+", aggregate.officers ? pct(aggregate.level2PlusPeople / aggregate.officers) : "N/A", aggregate.level2PlusPeople + " at Level 2 or 3", "fleet", "", "ultrawide") },
      { label:"Ship Qualified", value:aggregate.officers ? pct(aggregate.shipQual / aggregate.officers) : "N/A", detail:aggregate.shipQual + " people", attrs:figureAttrs("Ship Qualified", aggregate.officers ? pct(aggregate.shipQual / aggregate.officers) : "N/A", aggregate.shipQual + " ship-qualified watchstanders", "fleet", "", "ultrawide") },
      { label:"ROR Coverage", value:aggregate.officers ? pct(aggregate.rorCurrent / aggregate.officers) : "N/A", detail:aggregate.rorCurrent + " current", attrs:figureAttrs("ROR Coverage", aggregate.officers ? pct(aggregate.rorCurrent / aggregate.officers) : "N/A", aggregate.rorCurrent + " with current ROR", "fleet", "", "ultrawide") }
    ]) +
    ultrawideMiniBarChart("Currency Posture", [
      { label:"Current", value:aggregate.current, max:aggregate.officers, display:aggregate.current, tone:"good", attrs:figureAttrs("Current", aggregate.current, aggregate.officers ? pct(aggregate.current / aggregate.officers) + " of watchstanders" : "N/A", "fleet", "", "ultrawide") },
      { label:"Requires Proficiency Watch", value:aggregate.need, max:aggregate.officers, display:aggregate.need, tone:"warn", attrs:figureAttrs("Requires Proficiency Watch", aggregate.need, aggregate.officers ? pct(aggregate.need / aggregate.officers) + " of watchstanders" : "N/A", "fleet", "", "ultrawide") },
      { label:"Lost Currency", value:aggregate.loss, max:aggregate.officers, display:aggregate.loss, tone:"bad", attrs:figureAttrs("Lost Currency", aggregate.loss, aggregate.officers ? pct(aggregate.loss / aggregate.officers) + " of watchstanders" : "N/A", "fleet", "", "ultrawide") },
      { label:"Unknown", value:aggregate.unknown, max:aggregate.officers, display:aggregate.unknown, attrs:figureAttrs("Unknown Currency", aggregate.unknown, aggregate.officers ? pct(aggregate.unknown / aggregate.officers) + " of watchstanders" : "N/A", "fleet", "", "ultrawide") }
    ], "Counts use the imported fleet watchstander denominator.") +
    ultrawideRailSection("Lowest Level 2+ Share", ultrawideShipEntries(lowestLevel2, row => pct(row.level2Plus), row => row.phase, 6)) +
    ultrawideRailSection("Open full comparison", "<button class=\"btn secondary\" type=\"button\" data-view=\"performance\">Decision Board</button>");
  const tierTwo =
    ultrawideRailStats([
      { label:"Requires Proficiency Watch", value:aggregate.need, detail:aggregate.officers ? pct(aggregate.need / aggregate.officers) : "N/A", attrs:figureAttrs("Requires Proficiency Watch", aggregate.need, aggregate.officers ? pct(aggregate.need / aggregate.officers) + " of watchstanders" : "N/A", "fleet", "", "ultrawide") },
      { label:"Lost Currency", value:aggregate.loss, detail:aggregate.officers ? pct(aggregate.loss / aggregate.officers) : "N/A", attrs:figureAttrs("Lost Currency", aggregate.loss, aggregate.officers ? pct(aggregate.loss / aggregate.officers) + " of watchstanders" : "N/A", "fleet", "", "ultrawide") }
    ]) +
    ultrawideRailSection("Lowest Ship Qualification Rate", ultrawideShipEntries(lowestQualification, row => pct(row.qualRate), row => row.phase, 7), "Ship-qualified watchstanders divided by imported bridge watchstanders.");
  const tierThree =
    ultrawideRailStats([
      { label:"Bridge Logs", value:aggregate.logs.toLocaleString(), detail:fmt(aggregate.logsPerOfficer,1) + " per watchstander", attrs:figureAttrs("Bridge Logs", aggregate.logs.toLocaleString(), "All imported bridge watch logs", "fleet", "", "ultrawide") },
      { label:"Bridge Hours", value:fmt(aggregate.totalHours,1), detail:fmt(aggregate.avgHours,1) + " per watchstander", attrs:figureAttrs("Bridge Hours", fmt(aggregate.totalHours,1), "Cumulative imported bridge hours", "fleet", "", "ultrawide") }
    ]) +
    ultrawideRailSection("Highest Logs per Watchstander", ultrawideShipEntries(activityDepth, row => fmt(row.logsPerOfficer,1), row => row.phase + " · logs / person", 8), "Imported bridge logs divided by imported bridge watchstanders.");
  const tierFour =
    ultrawideRailStats([
      { label:"Data Confidence", value:quality.label, detail:quality.coverageText },
      { label:"Stale / Unverified", value:quality.staleShips.length, detail:quality.staleAfterDays + "-day threshold" },
      { label:"Comparable Ships", value:quality.comparableShips, detail:"With snapshot pairs" },
      { label:"L2 Gained / Reduced", value:movement.level2Gained + " / " + movement.level2Reduced, detail:"Latest comparable snapshots" }
    ]) +
    ultrawideRailSection("Freshness Review", ultrawideRailEntries((quality.staleShips || []).slice(0,9).map(ship => ({
      label:ship.name,
      meta:ship.sourceGeneratedAt ? fleetDateTime(ship.sourceGeneratedAt) : "Source timestamp missing",
      value:ship.phase || "Unspecified",
      attrs:" data-open-ship=\"" + h(keyFor(ship.name)) + "\""
    })), "No stale or unverified ship exports."));
  return ultrawideWorkspaceRail(
    "Fleet Lens",
    "Direct fleet measures, currency posture, qualification, and activity remain beside the overview.",
    core,
    tierTwo,
    tierThree,
    "ultrawide-fleet-lens",
    tierFour
  );
}

function classicUltrawideReferencesRail() {
  const metrics = allShipMetrics();
  const levelTotals = ["0","1","2","3"].map(level => ({
    level,
    count:metrics.reduce((sum,row) => sum + asNumber(row.levels && row.levels[level]),0)
  }));
  const watchstanders = metrics.reduce((sum,row) => sum + asNumber(row.officerCount),0);
  const core =
    ultrawideRailSection("Quick Navigation", "<div class=\"ultrawide-rail-link-grid\"><button class=\"btn secondary\" type=\"button\" data-view=\"dashboard\">Fleet Overview</button><button class=\"btn secondary\" type=\"button\" data-view=\"heatmaps\">Ship List</button><button class=\"btn secondary\" type=\"button\" data-view=\"evolutions\">Evolutions</button><button class=\"btn secondary\" type=\"button\" data-view=\"ofrp\">OFRP Analysis</button></div>") +
    ultrawideMiniBarChart("Live Fleet Level Distribution", levelTotals.map(row => ({
      label:"L" + row.level,
      value:row.count,
      max:watchstanders,
      display:row.count,
      attrs:" data-open-fleet-level=\"" + h(row.level) + "\""
    })), "Current imported watchstanders at each WAKE level.") +
    ultrawideRailSection("Primary denominator", "<p class=\"ultrawide-rail-note\">Fleet rates use imported bridge watchstanders. OFRP rates use watchstanders assigned to each ship's currently reported phase.</p>");
  const tierTwo =
    ultrawideRailSection("Metric Guardrails", "<p class=\"ultrawide-rail-note\">Current, Requires Proficiency Watch, and Lost Currency come from imported currency evidence. Level 2+ is Level 2 plus Level 3. Approaching is an hours-based indicator, not proof of advancement eligibility.</p>") +
    ultrawideRailSection("Evolution Counting", "<p class=\"ultrawide-rail-note\">Watchstanders on the same ship, date, and watch period count together. Separate periods on the same day remain separate occurrences.</p>");
  const tierThree =
    ultrawideRailSection("Evidence Workflow", "<div class=\"ultrawide-rail-link-grid\"><button class=\"btn secondary\" type=\"button\" data-view=\"performance\">Decision Board</button><button class=\"btn secondary\" type=\"button\" data-view=\"explorer\">All Data Explorer</button><button class=\"btn secondary\" type=\"button\" data-view=\"imports\">Import Report</button></div>") +
    ultrawideRailSection("Data Handling", "<p class=\"ultrawide-rail-note\">Names, watch records, and exported products remain command data. Use the visible timestamps and warnings when evaluating completeness.</p>");
  const tierFour =
    ultrawideRailSection("Command Workflow", "<div class=\"ultrawide-rail-link-grid\"><button class=\"btn secondary\" type=\"button\" data-view=\"ships\">Current Ship View</button><button class=\"btn secondary\" type=\"button\" data-view=\"performance\">Qualified Depth</button><button class=\"btn secondary\" type=\"button\" data-view=\"evolutions\">Evolution Coverage</button><button class=\"btn secondary\" type=\"button\" data-view=\"imports\">Data Confidence</button></div>") +
    ultrawideRailSection("SharePoint Boundary", "<p class=\"ultrawide-rail-note\">Large-screen presentation changes do not alter the configured SharePoint lists, persistence payload, or live polling cadence.</p>");
  return ultrawideWorkspaceRail("Reference Desk", "Workflow shortcuts, live level distribution, and calculation guardrails stay beside the full guide.", core, tierTwo, tierThree, "", tierFour);
}

const CLASSIC_COACH_STEPS = [
  { id:"import", title:"Import Ship Data", category:"Start", selector:"#drop-zone", action:"import", launchLabel:"Import WAKE Data", why:"WAKE Fleet accepts each ship's WAKE CSV export or WAKE JSON working copy.", do:"Import one file per ship. The OFRP phase must be Basic, Advanced, Integrated, Sustainment, or Maintenance. Re-importing later exports creates snapshots for history without duplicating bridge logs.", look:"The import report should show source type, ship, phase, bridge officers, bridge logs, snapshots, and movement events.", tip:"Use repeated exports over time to build all-time level-up and lost-currency history." },
  { id:"dashboard", title:"Fleet Overview", category:"Leader Home", selector:"[data-walkthrough-step='dashboard']", action:"dashboard", launchLabel:"Open Overview", why:"This is the high-level fleet picture across imported bridge watchstanders.", do:"Start with the simple fleet figures and level distribution, then use the shortcuts for deeper review.", look:"The overview stays aggregated and data-first. Ship names appear in Ship List or after a category drilldown.", tip:"Overview numbers remain bridge-only and do not change imported WAKE data." },
  { id:"performance", title:"Watchstander Decision Board", category:"Command View", selector:"button[data-view='performance']", action:"performance", launchLabel:"Open Decision Board", why:"This board shows which ships are short on qualified senior watchstander depth and which ships are setting the fleet benchmark.", do:"Scan the qualified-depth map first, then use the level ladder to understand the watchstander mix behind each ship.", look:"The map runs from red in the lower-left to green in the upper-right. Dashed lines are weighted fleet averages, marker size is the imported watchstander population, and every ship mark opens its full data.", tip:"Red ships need support on both qualified share and Level 2+ depth; green ships are potential benchmark and mentoring sources. Orange and yellow identify the specific measure that needs work." },
  { id:"evolutions", title:"Fleet Evolutions", category:"Training Activity", selector:"#admin-evolutions-btn", action:"evolutions", launchLabel:"Open Evolutions", why:"This workspace compares average evolution activity and fleet participation across the standard WAKE/TORIS evolution catalog.", do:"Compare average-height bars and use the red, orange, yellow, and green coverage key to find fleet gaps.", look:"Bar height is the average distinct sessions per imported ship. Participating watchstanders in the same date and watch period count together, while separate same-day periods remain separate. Bar color is the percentage of imported ships with at least one occurrence, including red zero-coverage evolutions.", tip:"Use the table below the chart for each average, ship-coverage percentage, source, and latest date." },
  { id:"heatmaps", title:"Ship List", category:"Ship Scan", selector:"[data-walkthrough-step='heatmap-list']", action:"heatmaps", launchLabel:"Open Ship List", why:"The Ship List is the detailed horizontal table for ship-by-ship evidence.", do:"Filter the list as needed, then click anywhere on a ship row to open that ship.", look:"Each ship occupies one row with L0 through L3 plus Unclassified, currency, qualification, ROR, hours, logs, and outcome data shown across the page.", tip:"Use Ship List when the fleet overview needs ship-by-ship detail." },
  { id:"ship", title:"Ship Drilldown", category:"Ship Detail", selector:".ship-list-table", action:"ship", launchLabel:"Open First Ship", why:"The ship view connects fleet analytics to an individual ship's overall data and supporting evidence.", do:"Open a ship row to see its full-width level distribution and overall data, then use the ship actions for roster, logs, ROR, activity, OFRP context, or history.", look:"The default ship screen stays on summary figures; detailed roster and evidence open only when requested.", tip:"Use the action buttons at the top of the ship view for supporting records." },
  { id:"ofrp", title:"OFRP Phase Comparison", category:"Phase", selector:"button[data-view='ofrp']", action:"ofrp", launchLabel:"Open OFRP Analysis", why:"This view compares the OFRP phases on the same weighted watchstander measures.", do:"Compare the baseline bars, level-mix chart, and phase relationship map, then select any phase to open its ships.", look:"Each phase rate is weighted by its watchstanders; the marker in each comparison bar is the weighted fleet baseline.", tip:"Use the relationship map to separate a phase-level pattern from a single-ship problem, then drill into the filtered Ship List." },
  { id:"explorer", title:"All Data Explorer", category:"Evidence", selector:"button[data-view='explorer']", action:"explorer", launchLabel:"Open Explorer", why:"The explorer exposes every imported bridge watch row for filtering and export.", do:"Filter by ship, phase, month, watchstation, level, currency, area, traffic, or text search.", look:"Use filtered export when staff needs a focused data pull.", tip:"The explorer uses deduplicated latest bridge log rows." },
  { id:"backup", title:"Exports And History", category:"Protect Work", selector:"#admin-export-btn", action:"backup", launchLabel:"Export Backup", why:"WAKE Fleet stores data offline in browser storage and IndexedDB, and can export leader-ready products.", do:"Use Export Backup for data protection, Full Fleet CSV for analysis, and Current Status PDF for a polished WAKE-logo brief.", look:"Snapshots and history events are included in backup JSON; full CSV includes ship, officer, watch log, and phase summary rows.", tip:"The import report is the audit trail for what changed." }
];
