import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..", "..");
const threadId = "019f9f34-d7bf-7132-a57b-9c34a474b52e";
const outputDir = path.join(root, "outputs", threadId, "fleet_wake_30_ship_excel");
const previewDir = path.join(root, "work", "spreadsheets", "fleet-30-ship-excel", "generated-previews");
const manifestPath = path.join(root, "work", "spreadsheets", "fleet-30-ship-excel", "verification-manifest.json");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const shipNames = [
  "FREEDOM", "INDEPENDENCE", "FORT WORTH", "CORONADO", "MILWAUKEE", "JACKSON",
  "DETROIT", "MONTGOMERY", "LITTLE ROCK", "GABRIELLE GIFFORDS", "SIOUX CITY", "OMAHA",
  "WICHITA", "MANCHESTER", "BILLINGS", "TULSA", "INDIANAPOLIS", "CHARLESTON",
  "ST LOUIS", "CINCINNATI", "MINNEAPOLIS-SAINT PAUL", "KANSAS CITY", "COOPERSTOWN", "OAKLAND",
  "MARINETTE", "MOBILE", "NANTUCKET", "SAVANNAH", "BELOIT", "CANBERRA",
];

const phases = [
  "Maintenance Phase",
  "Basic Phase",
  "Advanced Phase",
  "Integrated Phase",
  "Sustainment Phase",
];

const officerCounts = [
  10, 14, 18, 20, 16, 22, 12, 17, 19, 15,
  24, 21, 11, 16, 23, 18, 20, 14, 13, 22,
  17, 25, 15, 21, 12, 18, 24, 16, 20, 23,
];

const evolutionCounts = [
  0, 8, 24, 48, 72, 0, 12, 30, 72, 60,
  0, 20, 6, 72, 55, 32, 0, 72, 10, 45,
  28, 72, 0, 64, 14, 36, 72, 52, 22, 72,
];

const experienceProfiles = [
  { label: "Very Junior", ratios: [0.65, 0.35, 0, 0] },
  { label: "Developing", ratios: [0.40, 0.45, 0.15, 0] },
  { label: "Level 2 Core", ratios: [0.15, 0.25, 0.60, 0] },
  { label: "Balanced", ratios: [0.20, 0.30, 0.35, 0.15] },
  { label: "Experienced", ratios: [0.08, 0.18, 0.44, 0.30] },
  { label: "Senior Heavy", ratios: [0.05, 0.10, 0.35, 0.50] },
];

const profileIndexes = [
  0, 3, 2, 4, 1, 5,
  2, 0, 4, 1, 5, 3,
  1, 5, 4, 2, 0, 3,
  2, 4, 1, 5, 0, 3,
  1, 3, 5, 2, 4, 0,
];

const eventCatalog = [
  "Aircraft Refueling",
  "Amphib OPS AAV",
  "Amphib OPS LCAC",
  "Amphib OPS LCU",
  "Anchoring",
  "ASO-A (Acoustic Sensor operator - Active)",
  "ASO-P (Acoustic Sensor operator - Passive)",
  "ASO-S (Acoustic Sensor operator - Sonobouy)",
  "Astern Refueling",
  "ASW Torpedo Evasion",
  "ASW Tracking",
  "ASW Weapons Employment",
  "AW Engagement with Guns",
  "AW Engagement with Point Defense",
  "AW Engagement with Standard Missiles",
  "BMD Exercise",
  "CMTQ Exercise",
  "Compliant Ops",
  "Conduct Small Boat Operations",
  "Coordinated AW",
  "CSW",
  "DDS-O (Dual Display Station-Operator)",
  "Deploy Swimmer",
  "DIVTACS",
  "DTE",
  "E-Drills",
  "E-Evolutions",
  "Emergency Towing",
  "Employ Air Assets",
  "Employ DCA",
  "E-MSFD",
  "EW C-ISRT Ops",
  "EW Tactical Ops",
  "H&SG Operator (Handling and Stowage Group operator)",
  "H&SG Safety Observer",
  "H&SG Supervisor",
  "High Speed Navigation",
  "Launch and Recover Aircraft",
  "Live Fire Exercise with Guns",
  "Live Fire Exercise with Point Defense",
  "Low Visibility Navigation",
  "Man Overboard Recovery (Boat)",
  "Man Overboard Recovery (Ship)",
  "Minehunting Operations",
  "Minesweeping Operations",
  "Mooring to a Buoy",
  "NIXIE Operations",
  "Non-Compliant Ops",
  "NSFS Mission Support",
  "Plane Guard (Day)",
  "Plane Guard (Night)",
  "Respond to a Loss of Navigation Sensors/Displays",
  "Respond to a Loss of Steering",
  "Restricted Waters Navigation",
  "SAR Exercise",
  "SAST Operator (Surface ASW Synthetic Trainer Operator)",
  "SAWO (Situational Awareness Workstation Officer)",
  "Sea and Anchor Detail (Day)",
  "Sea and Anchor Detail (Night)",
  "Strait Transit (Day)",
  "Strait Transit (Night)",
  "SW Engagement with Guns",
  "SW Engagement with Missile",
  "SW Engagement with Point Defense",
  "Underway from or Mooring to a Pier",
  "Underway Replenishment",
  "USWFCO (Undersea Warfare Fire Control Operator)",
  "VERTREP",
];

const specialConditionCatalog = [
  "General Quarters (Day)",
  "General Quarters (Night)",
  "Low Visibility (Day)",
  "Low Visibility (Night)",
  "Plane Guard (Day)",
  "Plane Guard (Night)",
  "Sea and Anchor Detail (Day)",
  "Sea and Anchor Detail (Night)",
  "Strait Transit (Day)",
  "Strait Transit (Night)",
];

const evolutionCatalog = Array.from(new Set([...eventCatalog, ...specialConditionCatalog]));
if (evolutionCatalog.length !== 72) throw new Error(`Expected 72 unique evolutions, found ${evolutionCatalog.length}.`);

const exportHeaders = [
  "TORIS_EXPORT_VERSION",
  "Record Type",
  "Ship",
  "OFRP Phase",
  "Months Captured",
  "Officer Name",
  "Rank",
  "Name Only",
  "Current Level",
  "Approaching Level",
  "Ship Qual",
  "Days Since Watch",
  "Currency Status",
  "OOD Q Hours Applied",
  "Cumulative Bridge Hours",
  "Total Hours Onboard",
  "Total Q Hrs",
  "Total UI Hrs",
  "Next Steps/Missing Reqs",
  "Watchstation",
  "Month",
  "Date/Day Logged",
  "Watch Date",
  "Log Type",
  "Raw Text Entry",
  "Events",
  "Special Conditions",
  "Hours",
  "Day Total Hours",
  "Area",
  "Fleet",
  "Traffic Density",
  "Sim",
  "Score",
  "Log ID",
  "Raw Row Data JSON",
  "Complete Log JSON",
  "Hours By Watchstation JSON",
  "Log Scores JSON",
  "Manual Requirements JSON",
  "ROR Tests JSON",
  "Proficiency Watches JSON",
  "Proficiency Watch Log IDs JSON",
  "CO Hours Requirement Override",
  "CO OOD Qualified",
  "MSA Records JSON",
  "Mariner Skills Log Annotation JSON",
  "Source Generated At",
];

const firstNames = [
  "ALEX", "AMELIA", "ANDRE", "ARIA", "BENJAMIN", "BIANCA", "CALEB", "CAMILA", "CHLOE", "DANIEL",
  "ELENA", "ELI", "ELLA", "ETHAN", "FATIMA", "GABRIEL", "GRACE", "HANNAH", "HENRY", "ISAAC",
  "JACK", "JASMINE", "JORDAN", "JULIA", "KAI", "LAYLA", "LEVI", "LILY", "LUCAS", "MARIA",
  "MASON", "MIA", "NATHAN", "NORA", "OLIVIA", "OMAR", "OWEN", "PRIYA", "ROBERT", "RYAN",
  "SAMUEL", "SOFIA", "THEO", "VALERIA", "VICTORIA", "WILLIAM", "XAVIER", "YASMIN",
];

const lastNames = [
  "ADAMS", "ALEXANDER", "BAILEY", "BAKER", "BELL", "BENNETT", "BROOKS", "BRYANT", "CARTER", "CHEN",
  "COLE", "COOPER", "DIAZ", "EDWARDS", "EVANS", "FOSTER", "GARCIA", "GOMEZ", "GONZALEZ", "GREEN",
  "GRIFFIN", "HARRIS", "HERNANDEZ", "HOWARD", "JACKSON", "JOHNSON", "KELLY", "KHAN", "LEE", "LOPEZ",
  "MARTIN", "MILLER", "MORGAN", "MURPHY", "NELSON", "PATEL", "PERRY", "POWELL", "PRICE", "RAMIREZ",
  "RIVERA", "ROBINSON", "RUSSELL", "SCOTT", "SULLIVAN", "THOMPSON", "TURNER", "WARD",
];

const levelRanks = {
  0: ["ENS", "ENS", "LTJG"],
  1: ["ENS", "LTJG", "LTJG"],
  2: ["LTJG", "LT", "LT"],
  3: ["LT", "LT", "LCDR"],
};

const navy = "#0B2A43";
const blue = "#176B9A";
const paleBlue = "#DCECF6";
const paleGray = "#EDF2F5";
const text = "#12212E";
const green = "#D9EAD3";
const red = "#F4CCCC";
const gold = "#F3D98B";
const white = "#FFFFFF";
const generatedAt = "2026-07-26T12:00:00-04:00";

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function countsFromRatios(total, ratios) {
  const raw = ratios.map(ratio => ratio * total);
  const counts = raw.map(Math.floor);
  let remaining = total - counts.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let cursor = 0; remaining > 0; cursor += 1, remaining -= 1) {
    counts[order[cursor % order.length].index] += 1;
  }
  return counts;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function excelColumn(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function safeFileName(value) {
  return value.replace(/[^A-Z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function coverageLabel(count) {
  if (count === 0) return "None";
  if (count <= 14) return "Sparse";
  if (count <= 36) return "Partial";
  if (count < 72) return "Broad";
  return "All 72";
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function officerHours(level, random) {
  const ranges = {
    0: [25, 95],
    1: [110, 290],
    2: [320, 760],
    3: [820, 1080],
  };
  const [minimum, maximum] = ranges[level];
  return round(minimum + random() * (maximum - minimum), 1);
}

function officerCurrencyDays(level, random) {
  if (level === 0) return Math.floor(65 + random() * 120);
  if (level === 1) return Math.floor(12 + random() * 105);
  if (level === 2) return Math.floor(4 + random() * 75);
  return Math.floor(2 + random() * 58);
}

function currencyStatus(days) {
  if (days < 45) return "Current";
  if (days <= 90) return "Need Currency (45-90 days)";
  return "Currency Loss (>90 days)";
}

function nextSteps(level, hours, evolutionCount) {
  if (level === 3) return "Maintain currency, proficiency watches, Basic Evolution scores, and Advanced Evolution logs.";
  if (level === 2) return `Continue Level 3 development; ${round(Math.max(0, 800 - hours), 1)} OOD Q hours remain and advanced evolution evidence is incomplete.`;
  if (level === 1) return `Continue Level 2 development; ${round(Math.max(0, 300 - hours), 1)} OOD Q hours remain and Basic Evolution evidence is incomplete.`;
  return evolutionCount === 0
    ? "Build OOD qualification hours and begin documented evolution participation."
    : "Build OOD qualification hours and complete missing level requirements.";
}

function officerName(shipIndex, officerIndex) {
  const last = lastNames[(shipIndex * 11 + officerIndex * 3) % lastNames.length];
  const first = firstNames[(shipIndex * 7 + officerIndex * 5) % firstNames.length];
  return `${last} ${first}`;
}

function buildShipScenario(shipIndex) {
  const random = mulberry32(20260726 + shipIndex * 7919);
  const hullNumber = shipIndex + 1;
  const ship = `USS ${shipNames[shipIndex]} (LCS-${hullNumber})`;
  const phase = phases[Math.floor(shipIndex / 6)];
  const profile = experienceProfiles[profileIndexes[shipIndex]];
  const officerCount = officerCounts[shipIndex];
  const levelCounts = countsFromRatios(officerCount, profile.ratios);
  const levels = shuffled(levelCounts.flatMap((count, level) => Array(count).fill(level)), random);
  const evolutionCount = evolutionCounts[shipIndex];
  const rotation = (shipIndex * 13) % evolutionCatalog.length;
  const rotatedCatalog = [...evolutionCatalog.slice(rotation), ...evolutionCatalog.slice(0, rotation)];
  const selectedEvolutions = evolutionCount === evolutionCatalog.length
    ? evolutionCatalog.slice()
    : rotatedCatalog.slice(0, evolutionCount);
  const officers = levels.map((level, officerIndex) => {
    const name = officerName(shipIndex, officerIndex);
    const rankChoices = levelRanks[level];
    const rank = rankChoices[Math.floor(random() * rankChoices.length)];
    const oodQHours = officerHours(level, random);
    const joodQHours = round(12 + random() * 88, 1);
    const connQHours = round(10 + random() * 70, 1);
    const uiHours = round(8 + random() * 64, 1);
    const cumulativeBridgeHours = round(oodQHours + joodQHours + connQHours, 1);
    const daysSinceWatch = officerCurrencyDays(level, random);
    const shipQualified = level > 0 || random() > 0.72;
    const approaching = level < 3 && (
      (level === 0 && oodQHours >= 75) ||
      (level === 1 && oodQHours >= 250) ||
      (level === 2 && oodQHours >= 700)
    );
    const rorScore = Math.floor(82 + random() * 19);
    const rorDate = new Date(Date.UTC(2026, 5, 20 - (officerIndex % 12)));
    const rorTests = [{
      date: formatDate(rorDate),
      score: rorScore,
      questions: 20,
      remediationConducted: rorScore < 90,
      source: "Synthetic fleet workbook scenario",
      daysAgo: 36 + (officerIndex % 12),
    }];
    const msaPassed = random() > (0.68 - level * 0.12);
    const msaRecords = officerIndex % 3 === 0 ? [{
      type: officerIndex % 2 === 0 ? "MSA 2" : "MSA 5",
      result: msaPassed ? "Pass" : "Fail",
      date: `2026-06-${String(8 + (officerIndex % 18)).padStart(2, "0")}`,
      score: msaPassed ? 88 + level * 3 : 64 + level * 4,
    }] : [];
    return {
      name,
      rank,
      level,
      oodQHours,
      joodQHours,
      connQHours,
      uiHours,
      cumulativeBridgeHours,
      daysSinceWatch,
      currency: currencyStatus(daysSinceWatch),
      shipQualified,
      approaching,
      rorTests,
      msaRecords,
    };
  });

  const rows = [];
  officers.forEach((officer, officerIndex) => {
    const logCount = 6 + officer.level * 3 + (officerIndex % 4);
    for (let logIndex = 0; logIndex < logCount; logIndex += 1) {
      const daysBack = 5 + ((shipIndex * 3 + officerIndex * 7 + logIndex * 11) % 170);
      const watchDate = new Date(Date.UTC(2026, 6, 26 - daysBack));
      const hours = round(2.5 + random() * 2.2, 1);
      const qualified = officer.shipQualified && (officer.level > 0 || random() > 0.5);
      const logId = `${safeFileName(ship)}_${safeFileName(officer.name)}_${formatDate(watchDate)}_${String(logIndex + 1).padStart(2, "0")}`;
      rows.push({
        officer,
        officerIndex,
        logIndex,
        watchDate,
        hours,
        qualified,
        events: [],
        specialConditions: [],
        score: "",
        logId,
      });
    }
  });

  selectedEvolutions.forEach((evolution, evolutionIndex) => {
    const row = rows[evolutionIndex % rows.length];
    const isEvent = eventCatalog.includes(evolution);
    const isSpecial = specialConditionCatalog.includes(evolution);
    if (isSpecial && (!isEvent || evolutionIndex % 3 === 0)) row.specialConditions.push(evolution);
    else row.events.push(evolution);
    const baseScore = row.officer.level === 3 ? 4 : row.officer.level === 2 ? 3 : row.officer.level === 1 ? 2 : 1;
    row.score = Math.min(5, baseScore + (evolutionIndex % 4 === 0 ? 1 : 0));
  });

  const monthsCaptured = Array.from(new Set(rows.map(row =>
    row.watchDate.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase()
  ))).sort();
  const exportRows = rows.map((row) => {
    const officer = row.officer;
    const month = row.watchDate.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
    const dayNumber = row.watchDate.getUTCDate();
    const weekday = row.watchDate.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
    const dateLabel = `${dayNumber} - ${weekday}`;
    const watchDateLabel = `${dayNumber} ${month.replace(/\s+\d{4}$/, "")}`;
    const eventText = row.events.join("; ");
    const specialText = row.specialConditions.join("; ");
    const qualification = row.qualified ? "Q" : "U/I";
    const logType = eventText ? "Event 1" : specialText ? "Spec Cond 1" : `Watch ${qualification}`;
    const rawText = eventText || specialText || `OOD UW ${row.qualified ? "Qualified" : "Under Instruction"} Watch`;
    const area = ["OPEN OCEAN", "COASTAL/OPAREA", "OCONUS"][((row.officerIndex + row.logIndex + shipIndex) % 3)];
    const traffic = ["Low", "Med", "High"][((row.logIndex + officer.level) % 3)];
    const hoursByWatchstation = {
      "OOD UW": { Q: officer.oodQHours, UI: officer.uiHours },
      "JOOD UW": { Q: officer.joodQHours, UI: round(officer.uiHours * 0.35, 1) },
      "CONN": { Q: officer.connQHours, UI: round(officer.uiHours * 0.25, 1) },
    };
    const rawRow = {
      "DAY OF WEEK*": dateLabel,
      "WATCH STANDER (LastName FirstName Rank/Rate)*": `${officer.name} ${officer.rank}`,
      "TOTAL HOURS": row.hours,
      "QUAL*": qualification,
      "AREA*": area,
      "FLEET*": "7",
      "TRAFFIC/WATCH COMPLEXITY*": traffic,
      "EVENTS": eventText,
      "SPECIAL CONDITIONS": specialText,
      "COMMENTS": `${formatDate(row.watchDate)} | Synthetic ${phase} scenario`,
    };
    const completeLog = {
      logId: row.logId,
      ws: "OOD UW",
      type: logType,
      val: rawText,
      hrs: row.hours,
      qual: qualification,
      month,
      dayStr: dateLabel,
      daysAgo: officer.daysSinceWatch,
      watchDate: watchDateLabel,
      events: row.events,
      specialConditions: row.specialConditions,
      score: row.score,
      syntheticScenario: true,
    };
    const logScores = row.score === "" ? {} : { [row.logId]: row.score };
    const values = {
      "TORIS_EXPORT_VERSION": "TORIS_OOD_TRACKER_V1",
      "Record Type": "WATCH_LOG",
      "Ship": ship,
      "OFRP Phase": phase,
      "Months Captured": monthsCaptured.join("; "),
      "Officer Name": officer.name,
      "Rank": officer.rank,
      "Name Only": officer.name,
      "Current Level": officer.level,
      "Approaching Level": officer.approaching ? "Yes" : "No",
      "Ship Qual": officer.shipQualified ? "Yes" : "No",
      "Days Since Watch": officer.daysSinceWatch,
      "Currency Status": officer.currency,
      "OOD Q Hours Applied": officer.oodQHours,
      "Cumulative Bridge Hours": officer.cumulativeBridgeHours,
      "Total Hours Onboard": round(officer.cumulativeBridgeHours + officer.uiHours, 1),
      "Total Q Hrs": officer.cumulativeBridgeHours,
      "Total UI Hrs": officer.uiHours,
      "Next Steps/Missing Reqs": nextSteps(officer.level, officer.oodQHours, evolutionCount),
      "Watchstation": "OOD UW",
      "Month": month,
      "Date/Day Logged": dateLabel,
      "Watch Date": watchDateLabel,
      "Log Type": logType,
      "Raw Text Entry": rawText,
      "Events": eventText,
      "Special Conditions": specialText,
      "Hours": row.hours,
      "Day Total Hours": row.hours,
      "Area": area,
      "Fleet": "7",
      "Traffic Density": traffic,
      "Sim": row.logIndex % 11 === 0 ? "Yes" : "",
      "Score": row.score,
      "Log ID": row.logId,
      "Raw Row Data JSON": JSON.stringify(rawRow),
      "Complete Log JSON": JSON.stringify(completeLog),
      "Hours By Watchstation JSON": JSON.stringify(hoursByWatchstation),
      "Log Scores JSON": JSON.stringify(logScores),
      "Manual Requirements JSON": "{}",
      "ROR Tests JSON": JSON.stringify(officer.rorTests),
      "Proficiency Watches JSON": "[]",
      "Proficiency Watch Log IDs JSON": "{}",
      "CO Hours Requirement Override": "No",
      "CO OOD Qualified": "No",
      "MSA Records JSON": JSON.stringify(officer.msaRecords),
      "Mariner Skills Log Annotation JSON": JSON.stringify({
        allWatchesAnnotated: evolutionCount === 72,
        attestedBy: "",
        attestedAt: "",
      }),
      "Source Generated At": generatedAt,
    };
    return exportHeaders.map(header => values[header] ?? "");
  });

  return {
    shipIndex,
    ship,
    phase,
    profile: profile.label,
    officerCount,
    levelCounts,
    evolutionCount,
    evolutionProfile: coverageLabel(evolutionCount),
    selectedEvolutions,
    officers,
    exportRows,
  };
}

function applyTitleStyle(range) {
  range.format = {
    fill: navy,
    font: { bold: true, color: white, size: 18 },
    verticalAlignment: "center",
  };
  range.format.rowHeight = 34;
}

function applyHeaderStyle(range) {
  range.format = {
    fill: blue,
    font: { bold: true, color: white },
    verticalAlignment: "center",
    wrapText: true,
    borders: {
      bottom: { style: "medium", color: navy },
    },
  };
  range.format.rowHeight = 30;
}

function writeShipProfile(sheet, scenario) {
  sheet.showGridLines = false;
  sheet.getRange("A1:F1").merge();
  sheet.getRange("A1").values = [[`${scenario.ship} | Synthetic Fleet WAKE Scenario`]];
  applyTitleStyle(sheet.getRange("A1:F1"));
  sheet.getRange("A2:F2").merge();
  sheet.getRange("A2").values = [["Designed for broad fleet testing: phase, experience, Level 3 presence, and evolution participation vary independently."]];
  sheet.getRange("A2:F2").format = {
    fill: paleBlue,
    font: { italic: true, color: text },
    wrapText: true,
  };
  sheet.getRange("A2:F2").format.rowHeight = 30;

  sheet.getRange("A4:A10").values = [
    ["Ship"],
    ["OFRP Phase"],
    ["Experience Profile"],
    ["Imported Officers"],
    ["Bridge Watch Logs"],
    ["Observed Evolutions"],
    ["Evolution Coverage"],
  ];
  sheet.getRange("A4:A10").format = {
    fill: paleGray,
    font: { bold: true, color: text },
  };
  sheet.getRange("B4").formulas = [["='WAKE Export'!C2"]];
  sheet.getRange("B5").formulas = [["='WAKE Export'!D2"]];
  sheet.getRange("B6").values = [[scenario.profile]];
  const officerEnd = 4 + scenario.officerCount;
  const exportEnd = 1 + scenario.exportRows.length;
  sheet.getRange("B7").formulas = [[`=COUNTA('Officer Summary'!A5:A${officerEnd})`]];
  sheet.getRange("B8").formulas = [[`=COUNTA('WAKE Export'!A2:A${exportEnd})`]];
  sheet.getRange("B9").formulas = [["=COUNTIF('Evolution Coverage'!C5:C76,\">0\")"]];
  sheet.getRange("B10").values = [[scenario.evolutionProfile]];
  sheet.getRange("B4:B10").format = { font: { bold: true, color: navy } };

  sheet.getRange("D4:F4").merge();
  sheet.getRange("D4").values = [["Watchstander Level Distribution"]];
  sheet.getRange("D4:F4").format = {
    fill: paleGray,
    font: { bold: true, color: text },
    horizontalAlignment: "center",
  };
  sheet.getRange("D5:E8").values = [
    ["Foundational (L0)", null],
    ["Level 1", null],
    ["Level 2", null],
    ["Level 3", null],
  ];
  for (let index = 0; index < 4; index += 1) {
    sheet.getRange(`E${5 + index}`).formulas = [[`=COUNTIF('Officer Summary'!C5:C${officerEnd},${index})`]];
  }
  sheet.getRange("D5:D8").format = { fill: paleBlue, font: { bold: true, color: text } };
  sheet.getRange("E5:E8").format = {
    font: { bold: true, color: navy, size: 15 },
    horizontalAlignment: "center",
    numberFormat: "0",
  };
  sheet.getRange("D10:F10").merge();
  sheet.getRange("D10").values = [["Level 3 OODs Present"]];
  sheet.getRange("D10:F10").format = {
    fill: paleGray,
    font: { bold: true, color: text },
    horizontalAlignment: "center",
  };
  sheet.getRange("D11:F12").merge();
  sheet.getRange("D11").formulas = [["=IF(E8>0,\"YES\",\"NO\")"]];
  sheet.getRange("D11:F12").format = {
    fill: scenario.levelCounts[3] > 0 ? green : gold,
    font: { bold: true, color: navy, size: 20 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };

  sheet.getRange("A13:F13").merge();
  sheet.getRange("A13").values = [["Scenario Notes"]];
  sheet.getRange("A13:F13").format = {
    fill: blue,
    font: { bold: true, color: white },
  };
  sheet.getRange("A14:F17").merge();
  const evolutionNote = scenario.evolutionCount === 0
    ? "This ship has watchstanding records but no documented events or special conditions."
    : scenario.evolutionCount === 72
      ? "This ship has documented every evolution in the 72-item Fleet WAKE catalog."
      : `This ship documents ${scenario.evolutionCount} of 72 catalog evolutions; unobserved items remain visible on the Evolution Coverage sheet.`;
  sheet.getRange("A14").values = [[
    `${evolutionNote} The experience mix is ${scenario.profile.toLowerCase()}, with ${scenario.levelCounts[3]} Level 3 OOD(s). Data is synthetic and intended for testing, training, and demonstration only.`
  ]];
  sheet.getRange("A14:F17").format = {
    fill: "#F7FAFC",
    font: { color: text },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "outside", style: "thin", color: "#B7C8D4" },
  };
  sheet.getRange("A14:F17").format.rowHeight = 24;
  sheet.getRange("A1:A17").format.columnWidth = 24;
  sheet.getRange("B1:B17").format.columnWidth = 30;
  sheet.getRange("C1:C17").format.columnWidth = 4;
  sheet.getRange("D1:D17").format.columnWidth = 24;
  sheet.getRange("E1:E17").format.columnWidth = 14;
  sheet.getRange("F1:F17").format.columnWidth = 14;
  sheet.freezePanes.freezeRows(2);
}

function writeOfficerSummary(sheet, scenario) {
  sheet.showGridLines = false;
  sheet.getRange("A1:J1").merge();
  sheet.getRange("A1").values = [[`${scenario.ship} | Officer Summary`]];
  applyTitleStyle(sheet.getRange("A1:J1"));
  sheet.getRange("A2:J2").merge();
  sheet.getRange("A2").values = [[`${scenario.phase} | ${scenario.profile} crew | ${scenario.officerCount} officers`]];
  sheet.getRange("A2:J2").format = { fill: paleBlue, font: { bold: true, color: text } };
  const headers = [
    "Officer", "Rank", "Current Level", "OOD Q Hours", "Cumulative Bridge Hours",
    "Days Since Watch", "Currency Status", "Ship Qualified", "Approaching", "Watch Logs",
  ];
  sheet.getRange("A4:J4").values = [headers];
  applyHeaderStyle(sheet.getRange("A4:J4"));
  const rows = scenario.officers.map(officer => [
    officer.name,
    officer.rank,
    officer.level,
    officer.oodQHours,
    officer.cumulativeBridgeHours,
    officer.daysSinceWatch,
    officer.currency,
    officer.shipQualified ? "Yes" : "No",
    officer.approaching ? "Yes" : "No",
    null,
  ]);
  const endRow = 4 + rows.length;
  sheet.getRange(`A5:J${endRow}`).values = rows;
  for (let row = 5; row <= endRow; row += 1) {
    sheet.getRange(`J${row}`).formulas = [[`=COUNTIF('WAKE Export'!F$2:F$${scenario.exportRows.length + 1},A${row})`]];
  }
  sheet.getRange(`C5:C${endRow}`).format.numberFormat = "0";
  sheet.getRange(`D5:E${endRow}`).format.numberFormat = "0.0";
  sheet.getRange(`F5:F${endRow}`).format.numberFormat = "0";
  sheet.getRange(`J5:J${endRow}`).format.numberFormat = "0";
  sheet.getRange(`A4:J${endRow}`).format.borders = {
    insideHorizontal: { style: "thin", color: "#D8E1E8" },
    bottom: { style: "thin", color: "#B7C8D4" },
  };
  sheet.getRange(`C5:C${endRow}`).conditionalFormats.add("colorScale", {
    colors: ["#E06666", "#F6B26B", "#93C47D"],
    thresholds: ["min", "50%", "max"],
  });
  sheet.getRange(`G5:G${endRow}`).conditionalFormats.add("containsText", {
    text: "Currency Loss",
    format: { fill: red, font: { bold: true, color: "#7A1C1C" } },
  });
  sheet.getRange(`G5:G${endRow}`).conditionalFormats.add("containsText", {
    text: "Current",
    format: { fill: green, font: { bold: true, color: "#245B24" } },
  });
  sheet.getRange("A1:A2").format.columnWidth = 24;
  sheet.getRange(`A4:A${endRow}`).format.columnWidth = 24;
  sheet.getRange(`B4:B${endRow}`).format.columnWidth = 10;
  sheet.getRange(`C4:C${endRow}`).format.columnWidth = 14;
  sheet.getRange(`D4:E${endRow}`).format.columnWidth = 19;
  sheet.getRange(`F4:F${endRow}`).format.columnWidth = 17;
  sheet.getRange(`G4:G${endRow}`).format.columnWidth = 48;
  sheet.getRange(`H4:I${endRow}`).format.columnWidth = 15;
  sheet.getRange(`J4:J${endRow}`).format.columnWidth = 12;
  sheet.freezePanes.freezeRows(4);
  const table = sheet.tables.add(`A4:J${endRow}`, true, "OfficerSummaryTable");
  table.style = "TableStyleMedium2";
  table.showBandedRows = true;
}

function writeWakeExport(sheet, scenario) {
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, 1, exportHeaders.length).values = [exportHeaders];
  applyHeaderStyle(sheet.getRangeByIndexes(0, 0, 1, exportHeaders.length));
  sheet.getRangeByIndexes(1, 0, scenario.exportRows.length, exportHeaders.length).values = scenario.exportRows;
  const endRow = scenario.exportRows.length + 1;
  const numericHeaders = [
    "Current Level", "Days Since Watch", "OOD Q Hours Applied", "Cumulative Bridge Hours",
    "Total Hours Onboard", "Total Q Hrs", "Total UI Hrs", "Hours", "Day Total Hours", "Score",
  ];
  numericHeaders.forEach(header => {
    const column = excelColumn(exportHeaders.indexOf(header));
    sheet.getRange(`${column}2:${column}${endRow}`).format.numberFormat = header === "Current Level" || header === "Days Since Watch" || header === "Score" ? "0" : "0.0";
  });
  sheet.getRange(`A1:${excelColumn(exportHeaders.length - 1)}${endRow}`).format.borders = {
    insideHorizontal: { style: "thin", color: "#E3E9ED" },
  };
  for (let index = 0; index < exportHeaders.length; index += 1) {
    const column = excelColumn(index);
    let width = 14;
    if (["Ship", "Officer Name", "Name Only", "Currency Status", "Next Steps/Missing Reqs", "Raw Text Entry", "Events", "Special Conditions"].includes(exportHeaders[index])) width = 25;
    if (exportHeaders[index].includes("JSON")) width = 30;
    const widthOverrides = {
      "TORIS_EXPORT_VERSION": 24,
      "Record Type": 17,
      "Ship": 27,
      "OFRP Phase": 22,
      "Months Captured": 55,
      "Officer Name": 24,
      "Name Only": 24,
      "Currency Status": 48,
      "Next Steps/Missing Reqs": 52,
      "Date/Day Logged": 19,
      "Raw Text Entry": 34,
      "Events": 36,
      "Special Conditions": 32,
    };
    if (widthOverrides[exportHeaders[index]]) width = widthOverrides[exportHeaders[index]];
    sheet.getRange(`${column}1:${column}${endRow}`).format.columnWidth = width;
  }
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(5);
  const table = sheet.tables.add(`A1:${excelColumn(exportHeaders.length - 1)}${endRow}`, true, "WakeExportTable");
  table.style = "TableStyleMedium2";
  table.showBandedRows = true;
}

function writeEvolutionCoverage(sheet, scenario) {
  sheet.showGridLines = false;
  sheet.getRange("A1:D1").merge();
  sheet.getRange("A1").values = [[`${scenario.ship} | Evolution Coverage`]];
  applyTitleStyle(sheet.getRange("A1:D1"));
  sheet.getRange("A2:D2").merge();
  sheet.getRange("A2").values = [["Counts are formula-driven from the Events and Special Conditions fields on the WAKE Export sheet."]];
  sheet.getRange("A2:D2").format = { fill: paleBlue, font: { italic: true, color: text } };
  sheet.getRange("A4:D4").values = [["Evolution", "Catalog Source", "Records", "Status"]];
  applyHeaderStyle(sheet.getRange("A4:D4"));
  const coverageRows = evolutionCatalog.map(evolution => [
    evolution,
    eventCatalog.includes(evolution) && specialConditionCatalog.includes(evolution)
      ? "Event + Special Condition"
      : eventCatalog.includes(evolution) ? "Event" : "Special Condition",
    null,
    null,
  ]);
  sheet.getRange("A5:D76").values = coverageRows;
  const eventColumn = excelColumn(exportHeaders.indexOf("Events"));
  const specialColumn = excelColumn(exportHeaders.indexOf("Special Conditions"));
  const exportEnd = scenario.exportRows.length + 1;
  for (let row = 5; row <= 76; row += 1) {
    const evolution = evolutionCatalog[row - 5].replaceAll("\"", "\"\"");
    sheet.getRange(`C${row}`).formulas = [[
      `=COUNTIF('WAKE Export'!$${eventColumn}$2:$${eventColumn}$${exportEnd},"${evolution}")+COUNTIF('WAKE Export'!$${specialColumn}$2:$${specialColumn}$${exportEnd},"${evolution}")`
    ]];
    sheet.getRange(`D${row}`).formulas = [[`=IF(C${row}>0,"Observed","Not Observed")`]];
  }
  sheet.getRange("C5:C76").format.numberFormat = "0";
  sheet.getRange("A4:D76").format.borders = {
    insideHorizontal: { style: "thin", color: "#D8E1E8" },
  };
  sheet.getRange("D5:D76").conditionalFormats.add("containsText", {
    text: "Not Observed",
    format: { fill: red, font: { bold: true, color: "#7A1C1C" } },
  });
  sheet.getRange("D5:D76").conditionalFormats.add("containsText", {
    text: "Observed",
    format: { fill: green, font: { bold: true, color: "#245B24" } },
  });
  sheet.getRange("A1:A76").format.columnWidth = 48;
  sheet.getRange("B1:B76").format.columnWidth = 25;
  sheet.getRange("C1:C76").format.columnWidth = 12;
  sheet.getRange("D1:D76").format.columnWidth = 18;
  sheet.freezePanes.freezeRows(4);
  const table = sheet.tables.add("A4:D76", true, "EvolutionCoverageTable");
  table.style = "TableStyleMedium2";
  table.showBandedRows = true;
}

async function buildWorkbook(scenario, shouldRender) {
  const workbook = Workbook.create();
  const profileSheet = workbook.worksheets.add("Ship Profile");
  const officerSheet = workbook.worksheets.add("Officer Summary");
  const exportSheet = workbook.worksheets.add("WAKE Export");
  const coverageSheet = workbook.worksheets.add("Evolution Coverage");
  writeWakeExport(exportSheet, scenario);
  writeOfficerSummary(officerSheet, scenario);
  writeEvolutionCoverage(coverageSheet, scenario);
  writeShipProfile(profileSheet, scenario);

  const formulaChecks = [
    ...profileSheet.getRange("B4:F12").values.flat(),
    ...officerSheet.getRange(`J5:J${4 + scenario.officerCount}`).values.flat(),
    ...coverageSheet.getRange("C5:D76").values.flat(),
  ];
  const formulaErrors = formulaChecks.filter(value =>
    typeof value === "string" && /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A)/i.test(value)
  );
  if (formulaErrors.length) {
    throw new Error(`${scenario.ship} contains formula errors: ${formulaErrors.join(", ")}`);
  }
  const observedFormulaCount = coverageSheet.getRange("C5:C76").values.flat().filter(value => Number(value) > 0).length;
  if (observedFormulaCount !== scenario.evolutionCount) {
    throw new Error(`${scenario.ship} expected ${scenario.evolutionCount} observed evolutions but formulas returned ${observedFormulaCount}.`);
  }
  const level3Formula = Number(profileSheet.getRange("E8").values[0][0]);
  if (level3Formula !== scenario.levelCounts[3]) {
    throw new Error(`${scenario.ship} expected ${scenario.levelCounts[3]} Level 3 OODs but summary returned ${level3Formula}.`);
  }

  if (shouldRender) {
    const renderSpecs = [
      { sheetName: "Ship Profile", range: "A1:F17" },
      { sheetName: "Officer Summary", range: `A1:J${Math.min(18, 4 + scenario.officerCount)}` },
      { sheetName: "WAKE Export", range: "A1:M15" },
      { sheetName: "Evolution Coverage", range: "A1:D24" },
    ];
    for (const spec of renderSpecs) {
      const preview = await workbook.render({
        sheetName: spec.sheetName,
        range: spec.range,
        scale: 1.25,
        format: "png",
      });
      await fs.writeFile(
        path.join(previewDir, `${String(scenario.shipIndex + 1).padStart(2, "0")}-${safeFileName(scenario.ship)}-${safeFileName(spec.sheetName)}.png`),
        new Uint8Array(await preview.arrayBuffer())
      );
    }
  }

  const outputName = `FLEET_WAKE_${String(scenario.shipIndex + 1).padStart(2, "0")}_${safeFileName(scenario.ship)}.xlsx`;
  const outputPath = path.join(outputDir, outputName);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
  await fs.rm(`${outputPath}.inspect.ndjson`, { force: true });
  return {
    ...scenario,
    file: outputName,
    outputPath,
    logRows: scenario.exportRows.length,
    level3Count: scenario.levelCounts[3],
    formulaErrorCount: formulaErrors.length,
    observedFormulaCount,
  };
}

const requestedLimit = Math.max(1, Math.min(shipNames.length, Number(process.argv[2] || shipNames.length)));
const renderIndexes = new Set([0, 1, 7, 14, 26]);
const results = [];
for (let shipIndex = 0; shipIndex < requestedLimit; shipIndex += 1) {
  const scenario = buildShipScenario(shipIndex);
  const result = await buildWorkbook(scenario, renderIndexes.has(shipIndex));
  results.push(result);
  console.log(JSON.stringify({
    built: result.file,
    phase: result.phase,
    profile: result.profile,
    officers: result.officerCount,
    level3: result.level3Count,
    evolutions: result.evolutionCount,
    logs: result.logRows,
  }));
}

const summary = {
  generatedAt,
  outputDir,
  requestedLimit,
  ships: results.map(result => ({
    ship: result.ship,
    phase: result.phase,
    profile: result.profile,
    officers: result.officerCount,
    levelCounts: result.levelCounts,
    level3Count: result.level3Count,
    evolutionCount: result.evolutionCount,
    evolutionProfile: result.evolutionProfile,
    logRows: result.logRows,
    file: result.file,
    formulaErrorCount: result.formulaErrorCount,
    observedFormulaCount: result.observedFormulaCount,
  })),
};
await fs.writeFile(manifestPath, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify({
  complete: true,
  files: results.length,
  manifestPath,
  outputDir,
}));
