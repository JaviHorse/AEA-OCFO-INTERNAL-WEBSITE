import "server-only";
import { google, type sheets_v4 } from "googleapis";
import { googleAuth } from "./google-auth";
import {
  REGISTER_HEADERS,
  registerConfig,
  requestRegisterCells,
} from "./request-register";
import type { FinanceRequest } from "./types";

export async function sheetsClient() {
  const { auth, email } = await googleAuth([
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
  return { api: google.sheets({ version: "v4", auth }), email };
}
export async function inspectRegister(api: sheets_v4.Sheets) {
  const { spreadsheetId, sheetId } = registerConfig();
  if (!Number.isInteger(sheetId) || sheetId < 0)
    throw new Error("Invalid request register tab ID.");
  const { data } = await api.spreadsheets.get(
    { spreadsheetId, fields: "sheets.properties" },
    { timeout: 15000 },
  );
  const sheet = data.sheets?.find(
    (s) => s.properties?.sheetId === sheetId,
  )?.properties;
  if (!sheet?.title || !sheet.gridProperties?.rowCount)
    throw new Error("The request register tab does not exist.");
  const title = `'${sheet.title.replaceAll("'", "''")}'`;
  const header = await api.spreadsheets.values.get(
    { spreadsheetId, range: `${title}!A1:F1` },
    { timeout: 15000 },
  );
  if (
    JSON.stringify(header.data.values?.[0]) !== JSON.stringify(REGISTER_HEADERS)
  )
    throw new Error(
      "Request register headers must be Reference, Request, Amount, Status, Updated, Action. Run the Sheets setup first.",
    );
  return {
    spreadsheetId,
    sheetId,
    title,
    rowCount: sheet.gridProperties.rowCount,
  };
}
// Caller holds the database's global Sheets lease. Searching references also
// makes retries safe after a write succeeds but its acknowledgment is lost.
export async function writeRegisterRequest(
  api: sheets_v4.Sheets,
  r: FinanceRequest,
  appUrl: string,
  note: string,
  beforeWrite: () => Promise<void>,
) {
  const target = await inspectRegister(api);
  let row: number | undefined;
  let lastOccupied = 1;
  const references = new Set<string>();
  for (let start = 2; start <= target.rowCount; start += 1000) {
    const end = Math.min(target.rowCount, start + 999);
    const { data } = await api.spreadsheets.values.get(
      {
        spreadsheetId: target.spreadsheetId,
        range: `${target.title}!A${start}:A${end}`,
        valueRenderOption: "UNFORMATTED_VALUE",
      },
      { timeout: 15000 },
    );
    for (const [i, values] of (data.values ?? []).entries()) {
      if (values[0]) {
        lastOccupied = start + i;
        const reference = String(values[0]);
        if (references.has(reference))
          throw new Error(
            "Duplicate request references found in the register.",
          );
        references.add(reference);
      }
      if (values[0] === r.reference_code) {
        if (row)
          throw new Error(
            "Duplicate request references found in the register. Finance must resolve the duplicate before syncing.",
          );
        row = start + i;
      }
    }
  }
  row ??= lastOccupied + 1;
  // Do not overwrite neighboring finance data, even if column A was cleared.
  const existing =
    row <= target.rowCount
      ? await api.spreadsheets.values.get(
          {
            spreadsheetId: target.spreadsheetId,
            range: `${target.title}!A${row}:F${row}`,
            valueRenderOption: "UNFORMATTED_VALUE",
          },
          { timeout: 15000 },
        )
      : { data: { values: [] } };
  if (
    existing.data.values?.[0]?.some((v) => v !== "" && v !== null) &&
    existing.data.values[0][0] !== r.reference_code
  )
    throw new Error("The destination row contains unrelated data.");
  await beforeWrite();
  const requests: sheets_v4.Schema$Request[] = [];
  if (row > target.rowCount)
    requests.push({
      appendDimension: {
        sheetId: target.sheetId,
        dimension: "ROWS",
        length: 1000,
      },
    });
  requests.push({
    updateCells: {
      range: {
        sheetId: target.sheetId,
        startRowIndex: row - 1,
        endRowIndex: row,
        startColumnIndex: 0,
        endColumnIndex: 6,
      },
      rows: [{ values: requestRegisterCells(r, appUrl, note) }],
      fields:
        "userEnteredValue,note,userEnteredFormat.textFormat.link,userEnteredFormat.numberFormat",
    },
  });
  await api.spreadsheets.batchUpdate(
    { spreadsheetId: target.spreadsheetId, requestBody: { requests } },
    { timeout: 15000 },
  );
  return row;
}
