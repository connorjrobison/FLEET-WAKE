const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, 'WAKE FLEET - Only Secure in FS Sharepoint-current.html');
let html = fs.readFileSync(target, 'utf8');
const nl = html.includes('\r\n') ? '\r\n' : '\n';
function source(name) { return fs.readFileSync(path.join(__dirname,name),'utf8').replace(/\r?\n/g,nl); }
function replaceFunction(name, body) {
  const expression = new RegExp('^function '+name+'\\(\\) \\{[\\s\\S]*?^\\}', 'm');
  if(!expression.test(html)) throw new Error('Missing renderer '+name);
  html = html.replace(expression, 'function '+name+'() {'+nl+body+nl+'}');
}
const files=['command-progress-engine.js','command-progress-ui.js','command-fleet-views.js','command-action-views.js','command-evidence-views.js'];
const available=files.filter(file=>fs.existsSync(path.join(__dirname,file)));
const bundle='// BEGIN CO PROGRESSION BUNDLE'+nl+available.map(source).join(nl+nl)+nl+'// END CO PROGRESSION BUNDLE'+nl;
html=html.replace(/^\/\/ BEGIN CO PROGRESSION BUNDLE[\s\S]*?^\/\/ END CO PROGRESSION BUNDLE\r?\n/m,'');
html=html.replace(/\s*(?=async function boot\(\) \{)/,nl+nl);
html=html.replace('async function boot() {',()=>bundle+nl+'async function boot() {');
const css='/* BEGIN CO PROGRESSION STYLES */'+nl+source('command-progress.css')+nl+'/* END CO PROGRESSION STYLES */'+nl;
html=html.replace(/\/\* BEGIN CO PROGRESSION STYLES \*\/[\s\S]*?\/\* END CO PROGRESSION STYLES \*\/\r?\n/,'');
html=html.replace('</style>',()=>css+'</style>');
replaceFunction('renderDashboard',`  const host = document.getElementById("view-dashboard");
  const rows = categorizedShipMetrics(allShipMetrics());
  const aggregate = fleetAggregateMetrics(rows);
  host.innerHTML = commandWorkspace() + homeCommandRibbon() + (allShips().length
    ? '<details class="command-supporting"><summary>Supporting current-source totals: levels, training outcomes, and recorded activity</summary>' + fleetOverviewFigures(rows, aggregate) + assessmentOutcomePanel(aggregate, rows) + '</details>' : '');`);
replaceFunction('renderHeatMaps','  commandRenderShipList();');
replaceFunction('renderShips','  commandRenderShipDetail();');
replaceFunction('renderOfrp','  commandRenderOfrp();');
if(available.includes('command-action-views.js')) {
  replaceFunction('renderPerformance','  commandRenderRecovery();');
  replaceFunction('renderEvolutions','  commandRenderTraining();');
}
if(available.includes('command-evidence-views.js')) {
  replaceFunction('renderImports','  commandRenderImports();');
  replaceFunction('renderReferences','  commandRenderReferences();');
  replaceFunction('renderExplorer','  commandRenderExplorer();');
}
const nav=[['dashboard','Command Review'],['heatmaps','Ship Progress'],['performance','Currency & Recovery'],['evolutions','Training Evidence'],['ofrp','OFRP Review'],['explorer','Evidence Search'],['imports','Upload History'],['references','Guide']];
html=html.replace(/<nav class="wake-main-nav" aria-label="Main navigation">[\s\S]*?<\/nav>/,()=>'<nav class="wake-main-nav" aria-label="Main navigation">'+nl+nav.map(([view,label])=>'      <button class="wake-nav-btn'+(view==='dashboard'?' active':'')+'"'+(view==='dashboard'?' id="top-nav-overview" aria-current="page"':'')+' type="button" data-view="'+view+'">'+label+'</button>').join(nl)+nl+'      <button class="btn" type="button" data-command-import="true">Import WAKE</button>'+nl+'    </nav>');
html=html.replace(/const activeTopView = .*?;/,'const activeTopView = currentView === "ships" ? "heatmaps" : currentView;');
html=html.replace('function attachEvents() {','function attachEvents() {');
const hooks=['attachCommandEvents','attachCommandFleetEvents'];
if(available.includes('command-action-views.js'))hooks.push('attachCommandActionEvents');
if(available.includes('command-evidence-views.js'))hooks.push('attachCommandEvidenceEvents');
html=html.replace(/\s*\/\/ CO event hooks[\s\S]*?\/\/ END CO event hooks/,'');
html=html.replace('  observeGeneratedButtonTypes();',()=>nl+'  // CO event hooks'+nl+hooks.map(name=>'  '+name+'();').join(nl)+nl+'  // END CO event hooks'+nl+'  observeGeneratedButtonTypes();');
// Preserve established input IDs, import delegates, backup actions, and persistence.
html=html.replace(/<h2>Start Here<\/h2>/g,'<h2>Data &amp; reports</h2>');
html=html.replace(/>Ship List<\/button>/g,'>Ship Progress</button>');
html=html.replace(/>Decision Board<\/button>/g,'>Currency &amp; Recovery</button>');
html=html.replace(/>Evolutions<\/button>/g,'>Training Evidence</button>');
html=html.replace(/>OFRP Analysis<\/button>/g,'>OFRP Review</button>');
html=html.replace('>All Data<span>Filter and export imported bridge rows','>Evidence Search<span>Filter and export imported bridge rows');
html=html.replace('>Import Report<span>Validation results and file summaries','>Upload History<span>Validation results and file summaries');
html=html.replace('>Export Current Status PDF<span>Leader-ready WAKE status brief','>Export Current Source Summary<span>Current-source supporting figures');
html=html.replace('<title>WAKE Fleet Staff App</title>','<title>WAKE Fleet — Command Evidence</title>');
const coach=[
  {id:'import',title:'Establish the source record',category:'WAKE Inputs',selector:'[data-command-import]',action:'import',launchLabel:'Import WAKE Data',why:'The source export date anchors the ship observation.',do:'Upload WAKE ship JSON or CSV files using the existing import workflow.',look:'Upload History distinguishes new observations, backfills, corrections, repeats, and rejected files.',tip:'An upload date cannot replace a missing source date.'},
  {id:'dashboard',title:'What changed since last time?',category:'Command Review',selector:'[data-view="dashboard"]',action:'dashboard',launchLabel:'Open Command Review',why:'Gross losses and recoveries can cancel out in endpoint totals.',do:'Select a ship and compare previous reports, a period of months, or a chosen baseline date.',look:'Read actual source dates and open named evidence behind each count.',tip:'Missing months and first observations do not establish zero change.'},
  {id:'heatmaps',title:'Which ships progressed?',category:'Ship Progress',selector:'[data-view="heatmaps"]',action:'heatmaps',launchLabel:'Open Ship Progress',why:'Ship-level source dates and roster sizes make changes interpretable.',do:'Compare observed movement and select a ship for its complete progression review.',look:'Roster additions and absences are separate from currency and level changes.',tip:'Matching uses normalized ship and person names.'},
  {id:'performance',title:'Who needs attention now?',category:'Currency and Recovery',selector:'[data-view="performance"]',action:'performance',launchLabel:'Open Currency and Recovery',why:'Currency can age after the latest export.',do:'Review the named attention queue, unknown evidence, and next-30-day thresholds.',look:'Source age and the no-new-watch assumption are visible beside the figures.',tip:'Upload a new report to confirm actual status.'},
  {id:'evolutions',title:'Is training rebuilding proficiency?',category:'Training Evidence',selector:'[data-view="evolutions"]',action:'evolutions',launchLabel:'Open Training Evidence',why:'Recorded activity supports a review but does not by itself prove proficiency.',do:'Select a ship and month; inspect activity, observed progression, and separately dated assessment outcomes.',look:'Use scoped evolution controls to open the rows behind counts.',tip:'Watch hours count once; event evidence does not multiply hours.'},
  {id:'ofrp',title:'Did proficiency improve through the phase?',category:'OFRP Review',selector:'[data-view="ofrp"]',action:'ofrp',launchLabel:'Open OFRP Review',why:'Phase changes can change a group’s composition.',do:'Review the same ships grouped by their baseline phase and inspect phase transitions.',look:'Actual comparison intervals and missing baselines remain visible.',tip:'A recorded phase association does not prove causation.'},
  {id:'explorer',title:'What evidence supports the change?',category:'Evidence Search',selector:'[data-view="explorer"]',action:'explorer',launchLabel:'Open Evidence Search',why:'Every briefing needs a way back to records.',do:'Filter retained activity by ship, person, month, or exact recorded watch date.',look:'Exported rows match the selected evidence filters.',tip:'Month-only and undated activity are not exact-day evidence.'},
  {id:'backup',title:'Preserve the command record',category:'Handoff',selector:'[data-view="imports"]',action:'backup',launchLabel:'Export Fleet Backup',why:'Retained observations support future comparisons.',do:'Review Upload History, export the selected CO brief or evidence CSV, and retain a Fleet Backup.',look:'The existing save status reports local and SharePoint synchronization.',tip:'Current-source summaries and period-change briefs answer different questions.'}
];
html=html.replace(/const COACH_STEPS = \[[\s\S]*?\r?\n\];/,()=> 'const COACH_STEPS = '+JSON.stringify(coach,null,2).replace(/\n/g,nl)+';');
fs.writeFileSync(target,html,'utf8');
console.log('Embedded '+available.length+' command modules into standalone Fleet WAKE.');
