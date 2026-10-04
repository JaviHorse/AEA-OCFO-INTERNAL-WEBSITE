import "server-only";
import { google, type drive_v3 } from "googleapis";
import { googleAuth } from "./google-auth";
import { extractDriveFolderId } from "./drive-url";
export { extractDriveFolderId };
const FOLDER = "application/vnd.google-apps.folder";
export class DriveError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function driveClient() {
  const { auth, email } = await googleAuth(["https://www.googleapis.com/auth/drive.readonly"]);
  return {
    api: google.drive({ version: "v3", auth }),
    email,
  };
}
export async function getFileMetadata(id: string) {
  const { api } = await driveClient();
  try {
    return (
      await api.files.get({
        fileId: id,
        fields:
          "id,name,mimeType,webViewLink,modifiedTime,driveId,capabilities",
        supportsAllDrives: true,
      })
    ).data;
  } catch {
    throw new DriveError(
      "INACCESSIBLE",
      "The finance integration cannot read this folder. Share it with the integration account and validate again.",
    );
  }
}
export async function listFolderFiles(id: string) {
  const { api } = await driveClient();
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const res = await api.files.list({
      q: `'${id.replaceAll("'", "")}' in parents and trashed = false`,
      fields:
        "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,shortcutDetails)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 100,
      pageToken,
    });
    files.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}
export async function verifyFolderAccess(id: string) {
  const meta = await getFileMetadata(id);
  if (meta.mimeType !== FOLDER)
    throw new DriveError(
      "NOT_FOLDER",
      "The link points to a file, not a folder.",
    );
  return meta;
}
export async function validateSubmissionFolder(url: string) {
  const id = extractDriveFolderId(url);
  const meta = await verifyFolderAccess(id);
  const files = await listFolderFiles(id);
  if (!files.length)
    throw new DriveError(
      "EMPTY",
      "This folder is empty. Add your required documents first.",
    );
  if (files.some((f) => f.mimeType === "application/vnd.google-apps.shortcut"))
    throw new DriveError(
      "SHORTCUT",
      "Replace Drive shortcuts with the actual supporting files before submitting.",
    );
  return {
    id,
    name: meta.name,
    files: files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
    documentDetection: "MANUAL_VERIFICATION_REQUIRED",
  };
}
