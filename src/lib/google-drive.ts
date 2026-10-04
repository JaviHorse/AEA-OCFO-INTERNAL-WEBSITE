import "server-only";
import { withTiming } from "./performance";
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
  const { auth, email } = await googleAuth([
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
  return {
    api: google.drive({ version: "v3", auth }),
    email,
  };
}
export async function getFileMetadata(
  id: string,
  client?: Awaited<ReturnType<typeof driveClient>>,
) {
  const { api } = client ?? (await driveClient());
  try {
    return (
      await withTiming("drive.metadata", () =>
        api.files.get(
          {
            fileId: id,
            fields:
              "id,name,mimeType,webViewLink,modifiedTime,driveId,capabilities",
            supportsAllDrives: true,
          },
          { timeout: 15000, retry: false },
        ),
      )
    ).data;
  } catch {
    throw new DriveError(
      "INACCESSIBLE",
      "The finance integration cannot read this folder. Share it with the integration account and validate again.",
    );
  }
}
export async function listFolderFiles(
  id: string,
  client?: Awaited<ReturnType<typeof driveClient>>,
  previewLimit?: number,
) {
  const { api } = client ?? (await driveClient());
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withTiming("drive.files", () =>
      api.files.list(
        {
          q: `'${id.replaceAll("'", "")}' in parents and trashed = false`,
          fields:
            "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,shortcutDetails)",
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          pageSize: previewLimit ? Math.min(previewLimit, 100) : 100,
          pageToken,
        },
        { timeout: 15000, retry: false },
      ),
    );
    files.push(...(res.data.files ?? []));
    if (previewLimit && files.length >= previewLimit)
      return files.slice(0, previewLimit);
    pageToken = res.data.nextPageToken ?? undefined;
    if (pageToken && files.length >= 2000)
      throw new DriveError(
        "TOO_LARGE",
        "This folder contains too many files to validate. Use a folder containing only this request’s supporting documents.",
      );
  } while (pageToken);
  return files;
}
export async function verifyFolderAccess(
  id: string,
  client?: Awaited<ReturnType<typeof driveClient>>,
) {
  const meta = await getFileMetadata(id, client);
  if (meta.mimeType !== FOLDER)
    throw new DriveError(
      "NOT_FOLDER",
      "The link points to a file, not a folder.",
    );
  return meta;
}
export async function validateSubmissionFolder(url: string) {
  const id = extractDriveFolderId(url);
  const client = await driveClient();
  const meta = await verifyFolderAccess(id, client);
  const files = await listFolderFiles(id, client);
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
