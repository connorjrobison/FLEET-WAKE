import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = process.cwd();
const sourcePath = path.join(root, "WAKE", "USS_ARLEIGH_BURKE_MAY.xlsx");
const previewDir = path.join(root, "work", "spreadsheets", "fleet-30-ship-excel", "reference-previews");
await fs.mkdir(previewDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 18,
  tableMaxCellChars: 120,
});
console.log(summary.ndjson);

for (let index = 0; ; index += 1) {
  let sheet;
  try {
    sheet = workbook.worksheets.getItemAt(index);
  } catch {
    break;
  }
  if (!sheet) break;
  const used = sheet.getUsedRange();
  console.log(JSON.stringify({
    sheet: sheet.name,
    usedAddress: used ? used.address : null,
    rows: used ? used.rowCount : 0,
    columns: used ? used.columnCount : 0,
  }));
  if (!used) continue;
  const region = await workbook.inspect({
    kind: "region",
    sheetId: sheet.name,
    range: used.address,
    maxChars: 5000,
    tableMaxRows: 12,
    tableMaxCols: 20,
    tableMaxCellChars: 100,
  });
  console.log(region.ndjson);
  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const safeName = sheet.name.replace(/[^a-z0-9_-]+/gi, "_");
  await fs.writeFile(path.join(previewDir, `${String(index + 1).padStart(2, "0")}-${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
}
