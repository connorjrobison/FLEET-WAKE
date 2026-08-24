import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..", "..");
const threadId = "019f9f34-d7bf-7132-a57b-9c34a474b52e";
const outputDir = path.join(root, "outputs", threadId, "fleet_wake_30_ship_excel");
const manifestPath = path.join(scriptDir, "verification-manifest.json");
const reportPath = path.join(scriptDir, "validation-report.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const directoryFiles = (await fs.readdir(outputDir)).sort();
const xlsxFiles = directoryFiles.filter(file => file.toLowerCase().endsWith(".xlsx"));
const nonXlsxFiles = directoryFiles.filter(file => !file.toLowerCase().endsWith(".xlsx"));

if (manifest.ships.length !== 30) throw new Error(`Manifest contains ${manifest.ships.length} ships, expected 30.`);
if (xlsxFiles.length !== 30) throw new Error(`Output folder contains ${xlsxFiles.length} Excel files, expected 30.`);
if (nonXlsxFiles.length !== 0) throw new Error(`Output folder contains unexpected support files: ${nonXlsxFiles.join(", ")}`);

const requiredSheets = ["Ship Profile", "Officer Summary", "WAKE Export", "Evolution Coverage"];
const requiredHeaders = [
  "TORIS_EXPORT_VERSION", "Record Type", "Ship", "OFRP Phase", "Officer Name",
  "Current Level", "Days Since Watch", "Watchstation", "Events", "Special Conditions",
  "Hours", "Log ID", "Hours By Watchstation JSON", "Source Generated At",
];
const formulaErrorPattern = /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A)/i;
const shipResults = [];
const allLogIds = new Set();

for (const expected of manifest.ships) {
  const workbookPath = path.join(outputDir, expected.file);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
  const sheetNames = [];
  for (let index = 0; index < requiredSheets.length; index += 1) {
    sheetNames.push(workbook.worksheets.getItemAt(index).name);
  }
  if (JSON.stringify(sheetNames) !== JSON.stringify(requiredSheets)) {
    throw new Error(`${expected.file} sheets were ${sheetNames.join(", ")}.`);
  }

  const profile = workbook.worksheets.getItem("Ship Profile");
  const officers = workbook.worksheets.getItem("Officer Summary");
  const wakeExport = workbook.worksheets.getItem("WAKE Export");
  const coverage = workbook.worksheets.getItem("Evolution Coverage");
  const profileValues = profile.getRange("B4:F12").values.flat();
  const formulaErrors = profileValues.filter(value => typeof value === "string" && formulaErrorPattern.test(value));
  const officerEnd = 4 + expected.officers;
  const officerValues = officers.getRange(`A5:J${officerEnd}`).values;
  const coverageValues = coverage.getRange("A5:D76").values;
  const coverageErrors = coverageValues.flat().filter(value => typeof value === "string" && formulaErrorPattern.test(value));
  formulaErrors.push(...coverageErrors);
  if (formulaErrors.length) throw new Error(`${expected.file} has formula errors: ${formulaErrors.join(", ")}`);

  const exportUsed = wakeExport.getUsedRange();
  const exportValues = exportUsed.values;
  const headers = exportValues[0].map(value => String(value ?? ""));
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  requiredHeaders.forEach(header => {
    if (headerIndex[header] == null) throw new Error(`${expected.file} is missing required header ${header}.`);
  });
  const dataRows = exportValues.slice(1).filter(row => row.some(value => value !== null && value !== ""));
  if (dataRows.length !== expected.logRows) {
    throw new Error(`${expected.file} has ${dataRows.length} data rows, expected ${expected.logRows}.`);
  }
  const seenOfficers = new Set();
  const seenLevel3 = new Set();
  const seenEvolutions = new Set();
  const workbookLogIds = new Set();
  for (const row of dataRows) {
    const recordType = String(row[headerIndex["Record Type"]] ?? "");
    const ship = String(row[headerIndex["Ship"]] ?? "");
    const phase = String(row[headerIndex["OFRP Phase"]] ?? "");
    const officer = String(row[headerIndex["Officer Name"]] ?? "");
    const level = Number(row[headerIndex["Current Level"]]);
    const watchstation = String(row[headerIndex["Watchstation"]] ?? "");
    const logId = String(row[headerIndex["Log ID"]] ?? "");
    if (recordType !== "WATCH_LOG") throw new Error(`${expected.file} contains non-WATCH_LOG data.`);
    if (ship !== expected.ship) throw new Error(`${expected.file} contains ship ${ship}, expected ${expected.ship}.`);
    if (phase !== expected.phase) throw new Error(`${expected.file} contains phase ${phase}, expected ${expected.phase}.`);
    if (!officer) throw new Error(`${expected.file} contains a blank officer.`);
    if (![0, 1, 2, 3].includes(level)) throw new Error(`${expected.file} contains invalid level ${row[headerIndex["Current Level"]]}.`);
    if (watchstation !== "OOD UW") throw new Error(`${expected.file} contains unexpected watchstation ${watchstation}.`);
    if (!logId || workbookLogIds.has(logId)) throw new Error(`${expected.file} contains a blank or duplicate Log ID.`);
    workbookLogIds.add(logId);
    const fleetLogKey = `${expected.ship}|${logId}`;
    if (allLogIds.has(fleetLogKey)) throw new Error(`Duplicate fleet log key ${fleetLogKey}.`);
    allLogIds.add(fleetLogKey);
    seenOfficers.add(officer);
    if (level === 3) seenLevel3.add(officer);
    for (const field of ["Events", "Special Conditions"]) {
      String(row[headerIndex[field]] ?? "")
        .split(/[;\n|]+/)
        .map(value => value.trim())
        .filter(Boolean)
        .forEach(value => seenEvolutions.add(value.toUpperCase()));
    }
  }
  if (seenOfficers.size !== expected.officers) {
    throw new Error(`${expected.file} contains ${seenOfficers.size} unique officers, expected ${expected.officers}.`);
  }
  if (seenLevel3.size !== expected.level3Count) {
    throw new Error(`${expected.file} contains ${seenLevel3.size} Level 3 OODs, expected ${expected.level3Count}.`);
  }
  if (seenEvolutions.size !== expected.evolutionCount) {
    throw new Error(`${expected.file} contains ${seenEvolutions.size} unique evolutions, expected ${expected.evolutionCount}.`);
  }
  const coverageObserved = coverageValues.filter(row => Number(row[2]) > 0).length;
  if (coverageObserved !== expected.evolutionCount) {
    throw new Error(`${expected.file} coverage sheet reports ${coverageObserved} evolutions, expected ${expected.evolutionCount}.`);
  }
  const profileOfficerCount = Number(profile.getRange("B7").values[0][0]);
  const profileLogCount = Number(profile.getRange("B8").values[0][0]);
  const profileEvolutionCount = Number(profile.getRange("B9").values[0][0]);
  const profileLevel3Count = Number(profile.getRange("E8").values[0][0]);
  if (profileOfficerCount !== expected.officers) throw new Error(`${expected.file} profile officer formula mismatch.`);
  if (profileLogCount !== expected.logRows) throw new Error(`${expected.file} profile log formula mismatch.`);
  if (profileEvolutionCount !== expected.evolutionCount) throw new Error(`${expected.file} profile evolution formula mismatch.`);
  if (profileLevel3Count !== expected.level3Count) throw new Error(`${expected.file} profile Level 3 formula mismatch.`);

  const errorScan = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 20 },
    summary: `formula error scan for ${expected.ship}`,
  });
  const errorScanText = String(errorScan.ndjson || "");
  if (/"match":true|\"matches\":\[[^\]]*\{/.test(errorScanText)) {
    throw new Error(`${expected.file} formula error scan returned a match.`);
  }

  shipResults.push({
    file: expected.file,
    ship: expected.ship,
    phase: expected.phase,
    profile: expected.profile,
    officers: seenOfficers.size,
    level3: seenLevel3.size,
    evolutions: seenEvolutions.size,
    logs: dataRows.length,
    sheets: sheetNames,
    formulaErrors: 0,
  });
  console.log(JSON.stringify({ validated: expected.file, officers: seenOfficers.size, level3: seenLevel3.size, evolutions: seenEvolutions.size, logs: dataRows.length }));
}

function frequency(values) {
  return Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]));
}

const phaseCounts = frequency(shipResults.map(result => result.phase));
const experienceCounts = frequency(shipResults.map(result => result.profile));
const level3Present = shipResults.filter(result => result.level3 > 0).length;
const level3Absent = shipResults.filter(result => result.level3 === 0).length;
const noEvolutionShips = shipResults.filter(result => result.evolutions === 0).length;
const allEvolutionShips = shipResults.filter(result => result.evolutions === 72).length;
const evolutionValues = shipResults.map(result => result.evolutions);
const officerValues = shipResults.map(result => result.officers);

for (const phase of ["Maintenance Phase", "Basic Phase", "Advanced Phase", "Integrated Phase", "Sustainment Phase"]) {
  if (phaseCounts[phase] !== 6) throw new Error(`${phase} count is ${phaseCounts[phase]}, expected 6.`);
}
if (Object.keys(experienceCounts).length !== 6 || Object.values(experienceCounts).some(count => count !== 5)) {
  throw new Error(`Experience profile counts are not evenly varied: ${JSON.stringify(experienceCounts)}.`);
}
if (level3Present !== 15 || level3Absent !== 15) throw new Error(`Level 3 presence split is ${level3Present}/${level3Absent}, expected 15/15.`);
if (noEvolutionShips !== 5) throw new Error(`No-evolution ship count is ${noEvolutionShips}, expected 5.`);
if (allEvolutionShips !== 7) throw new Error(`All-evolution ship count is ${allEvolutionShips}, expected 7.`);
if (Math.min(...officerValues) !== 10 || Math.max(...officerValues) !== 25) throw new Error("Officer population range is not 10-25.");
if (new Set(evolutionValues).size < 20) throw new Error("Evolution coverage does not have enough distinct values.");

const report = {
  validatedAt: new Date().toISOString(),
  outputDir,
  workbookCount: shipResults.length,
  unexpectedSupportFiles: nonXlsxFiles,
  phaseCounts,
  experienceCounts,
  level3Present,
  level3Absent,
  noEvolutionShips,
  allEvolutionShips,
  distinctEvolutionCounts: new Set(evolutionValues).size,
  minimumEvolutionCount: Math.min(...evolutionValues),
  maximumEvolutionCount: Math.max(...evolutionValues),
  minimumOfficerCount: Math.min(...officerValues),
  maximumOfficerCount: Math.max(...officerValues),
  totalWatchLogs: shipResults.reduce((sum, result) => sum + result.logs, 0),
  allFormulaScansPassed: shipResults.every(result => result.formulaErrors === 0),
  ships: shipResults,
};
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ complete: true, reportPath, ...report, ships: undefined }));
