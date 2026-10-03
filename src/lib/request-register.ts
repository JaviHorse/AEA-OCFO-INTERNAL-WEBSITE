import type { FinanceRequest } from "./types";
import { human } from "./finance";
import { extractDriveFolderId } from "./drive-url";

export const REGISTER_HEADERS = ["Reference", "Request", "Amount", "Status", "Updated", "Action"];
export function registerConfig() {
  return {
    spreadsheetId: process.env.GOOGLE_REQUESTS_SPREADSHEET_ID || "14jREzzAI_Wi_EpLbdK2x_3sN5TNDIc3XCmp01l7jLGo",
    sheetId: Number(process.env.GOOGLE_REQUESTS_SHEET_ID || "0"),
  };
}
export function registerUrl() {
  const { spreadsheetId, sheetId } = registerConfig();
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}
type RegisterCell = {
  userEnteredValue: { stringValue?: string; numberValue?: number };
  note?: string;
  userEnteredFormat?: { textFormat?: { link: { uri: string } }; numberFormat?: { type: string; pattern: string } };
};
export function requestRegisterCells(r: FinanceRequest, appUrl: string, note = ""): RegisterCell[] {
  if (!r.reference_code || r.status === "DRAFT") throw new Error("Only submitted requests belong in the register.");
  const base = new URL(appUrl);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Invalid application URL.");
  const folder = r.source_folder_url ? `https://drive.google.com/drive/folders/${extractDriveFolderId(r.source_folder_url)}` : undefined;
  const text = (value: string) => ({ userEnteredValue: { stringValue: value } });
  return [
    { ...text(r.reference_code), userEnteredFormat: { textFormat: { link: { uri: new URL(`/requests/${r.id}`, base).href } } } },
    { ...text(r.title), note },
    { userEnteredValue: { numberValue: Number(r.amount) }, userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: '"₱"#,##0.00;"₱"-#,##0.00' } } },
    text(human(r.status)),
    text(new Date(r.updated_at ?? r.submitted_at ?? r.created_at).toISOString()),
    folder ? { ...text("Open Requirements"), userEnteredFormat: { textFormat: { link: { uri: folder } } } } : text("No folder provided"),
  ];
}
