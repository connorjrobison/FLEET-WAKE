const fs=require('node:fs');
const path=require('node:path');
const target=path.resolve(__dirname,'../../WAKE FLEET - Only Secure in FS Sharepoint-current.html');
let html=fs.readFileSync(target,'utf8');
const nl=html.includes('\r\n')?'\r\n':'\n';
const source=name=>fs.readFileSync(path.join(__dirname,name),'utf8').replace(/\r?\n/g,nl);
function replaceFunction(name,body,args='') {
  const re=new RegExp('^function '+name+'\\([^)]*\\) \\{[\\s\\S]*?^\\}','m');
  if(!re.test(html))throw Error('Missing '+name);
  html=html.replace(re,()=> 'function '+name+'('+args+') {'+nl+body+nl+'}');
}
const files=['command-progress-engine.js','command-progress-ui.js','command-fleet-views.js','command-action-views.js','command-evidence-views.js','calendar-comparison.js','activity-drilldown.js','daily-activity-model.js','daily-activity-chart.js','classic-renderers.js','compact-ui.js'];
const bundle='// BEGIN CO PROGRESSION BUNDLE'+nl+files.map(source).join(nl+nl)+nl+'// END CO PROGRESSION BUNDLE'+nl;
html=html.replace(/^\/\/ BEGIN CO PROGRESSION BUNDLE[\s\S]*?^\/\/ END CO PROGRESSION BUNDLE\r?\n/m,'');
html=html.replace(/\s*(?=async function boot\(\) \{)/,nl+nl);
html=html.replace('async function boot() {',()=>bundle+nl+'async function boot() {');
html=html.replace(/\/\* BEGIN CO PROGRESSION STYLES \*\/[\s\S]*?\/\* END CO PROGRESSION STYLES \*\/\r?\n/,'');
html=html.replace('</style>',()=> '/* BEGIN CO PROGRESSION STYLES */'+nl+source('command-progress.css')+nl+source('compact-ui.css')+nl+source('daily-activity-chart.css')+nl+'/* END CO PROGRESSION STYLES */'+nl+'</style>');
replaceFunction('renderDashboard','  compactRenderDashboard();');
replaceFunction('renderShips','  compactRenderShips();');
['HeatMaps','Performance','Evolutions','Ofrp','Explorer','Imports','References'].forEach(name=>replaceFunction('render'+name,'  classicRender'+name+'();'));
replaceFunction('homeCommandRibbon','  return classicHomeCommandRibbon();');
replaceFunction('shipProfileSummary','  return classicShipProfileSummary(m);','m');
replaceFunction('ultrawideFleetLens','  return classicUltrawideFleetLens(rows, aggregate);','rows, aggregate');
replaceFunction('ultrawideReferencesRail','  return classicUltrawideReferencesRail();');
const nav=[['dashboard','Fleet Overview'],['heatmaps','Ship List'],['references','References']];
html=html.replace(/<nav class="wake-main-nav" aria-label="Main navigation">[\s\S]*?<\/nav>/,()=>'<nav class="wake-main-nav" aria-label="Main navigation">'+nl+nav.map(([view,label])=>'<button class="wake-nav-btn'+(view==='dashboard'?' active':'')+'"'+(view==='dashboard'?' id="top-nav-overview" aria-current="page"':'')+' type="button" data-view="'+view+'">'+label+'</button>').join(nl)+nl+'<button class="btn" type="button" data-command-import="true">Import WAKE</button>'+nl+'</nav>');
html=html.replace(/const COACH_STEPS = \[[\s\S]*?\r?\n\];/,()=> 'const COACH_STEPS = '+source('classic-renderers.js').match(/const CLASSIC_COACH_STEPS = (\[[\s\S]*?\r?\n\]);/)[1]+';');
const hooks=['attachCommandEvents','attachCommandFleetEvents','attachCommandActionEvents','attachCommandEvidenceEvents','attachCompactFleetEvents','attachActivityDrilldownEvents','attachDailyActivityEvents'];
html=html.replace(/\s*\/\/ CO event hooks[\s\S]*?\/\/ END CO event hooks/,'');
html=html.replace('  observeGeneratedButtonTypes();',()=>nl+'  // CO event hooks'+nl+hooks.map(name=>'  '+name+'();').join(nl)+nl+'  // END CO event hooks'+nl+'  observeGeneratedButtonTypes();');
html=html.replace(/<title>[^<]+<\/title>/,'<title>WAKE Fleet Staff App</title>');
// Each tab replaces the visible view and starts at the top of its page.
html=html.replace(/  if \(host && previousView !== currentView\) \{\s*(?:window\.scrollTo\(\{top:0,left:0,behavior:"instant"\}\);\s*)*/,
  '  if (host && previousView !== currentView) {'+nl+'    window.scrollTo({top:0,left:0,behavior:"instant"});'+nl+'    ');
fs.writeFileSync(target,html,'utf8');
console.log('Embedded classic views, calendar comparisons, and interactive charts.');
