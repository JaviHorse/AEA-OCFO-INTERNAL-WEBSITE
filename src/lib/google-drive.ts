import "server-only";
import { google, type drive_v3 } from "googleapis";
import { readFile } from "node:fs/promises";
import { env } from "./env";
import { extractDriveFolderId } from "./drive-url";
import { serviceClient } from "./supabase/server";
import type { FinanceRequest } from "./types";
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
  let credentials: { client_email: string; private_key: string };
  if (
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  ) {
    credentials = {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  } else {
    if (process.env.NODE_ENV === "production")
      throw new DriveError(
        "CONFIGURATION",
        "Configure the Google service account in production environment variables.",
      );
    try {
      credentials = JSON.parse(await readFile("GDrive_key.json", "utf8"));
    } catch {
      throw new DriveError(
        "CONFIGURATION",
        "Google Drive credentials could not be loaded.",
      );
    }
  }
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: process.env.GOOGLE_IMPERSONATED_USER || undefined,
  });
  return {
    api: google.drive({ version: "v3", auth }),
    email: credentials.client_email,
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
export async function createFolder(name: string, parentId: string) {
  const { api } = await driveClient();
  const res = await api.files.create({
    requestBody: { name, mimeType: FOLDER, parents: [parentId] },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id)
    throw new DriveError(
      "COPY_FAILED",
      "Google Drive did not return a destination folder.",
    );
  return res.data.id;
}
async function ensureFolder(name: string, parentId: string) {
  const { api } = await driveClient();
  const escaped = name.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const res = await api.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = '${FOLDER}' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? createFolder(name, parentId);
}
export async function ensureFiscalYearFolder(label: string) {
  const { data } = await serviceClient()
    .from("organization_settings")
    .select("value")
    .eq("key", "google_drive_root_folder_id")
    .maybeSingle();
  return ensureFolder(label, data?.value ?? env().GOOGLE_DRIVE_ROOT_FOLDER_ID);
}
export const ensureDepartmentFolder = (code: string, parent: string) =>
  ensureFolder(code, parent);
export const ensureProjectOrNonProjectFolder = (name: string, parent: string) =>
  ensureFolder(name, parent);
export const ensureRequestFolder = (reference: string, parent: string) =>
  ensureFolder(reference, parent);
export async function buildOfficialFolderStructure(r: FinanceRequest) {
  const db = serviceClient();
  const [{ data: year }, { data: dept }, { data: project }] = await Promise.all(
    [
      db
        .from("fiscal_years")
        .select("label")
        .eq("id", r.fiscal_year_id)
        .single(),
      db.from("departments").select("code").eq("id", r.department_id).single(),
      r.project_id
        ? db.from("projects").select("name").eq("id", r.project_id).single()
        : Promise.resolve({ data: null }),
    ],
  );
  const yearFolder = await ensureFiscalYearFolder(year!.label);
  const deptFolder = await ensureDepartmentFolder(dept!.code, yearFolder);
  const projectFolder = await ensureProjectOrNonProjectFolder(
    project?.name ?? "Non-Project",
    deptFolder,
  );
  const folder = await ensureRequestFolder(r.reference_code!, projectFolder);
  await ensureFolder("OCFO Review", folder);
  await ensureFolder("Final - Approved Documents", folder);
  const submitted = await ensureFolder("Submitted Requirements", folder);
  return {
    folder,
    submitted,
    url: `https://drive.google.com/drive/folders/${folder}`,
  };
}
export async function copyFolderContents(
  source: string,
  destination: string,
  requestId: string,
  batch: string,
  depth = 0,
) {
  if (depth > 12)
    throw new DriveError(
      "DEPTH",
      "The submission contains too many nested folder levels.",
    );
  const { api } = await driveClient();
  const db = serviceClient();
  for (const file of await listFolderFiles(source)) {
    if (file.mimeType === "application/vnd.google-apps.shortcut")
      throw new DriveError(
        "SHORTCUT",
        "Drive shortcuts cannot be archived. Replace them with actual files.",
      );
    if (file.mimeType === FOLDER) {
      const folder = await ensureFolder(file.name ?? "Folder", destination);
      await copyFolderContents(file.id!, folder, requestId, batch, depth + 1);
      continue;
    }
    const { data: existing } = await db
      .from("drive_documents")
      .select("official_file_id")
      .eq("request_id", requestId)
      .eq("source_file_id", file.id!)
      .eq("archive_batch", batch)
      .maybeSingle();
    if (existing) continue;
    const copied = await api.files.copy({
      fileId: file.id!,
      requestBody: {
        name: file.name,
        parents: [destination],
        appProperties: { aeaRequest: requestId, aeaSource: file.id! },
      },
      fields: "id,name,mimeType,webViewLink,modifiedTime",
      supportsAllDrives: true,
    });
    const { error } = await db.from("drive_documents").insert({
      request_id: requestId,
      archive_batch: batch,
      source_modified_time: file.modifiedTime,
      official_modified_time: copied.data.modifiedTime,
      source_file_id: file.id,
      official_file_id: copied.data.id,
      file_name: copied.data.name,
      mime_type: copied.data.mimeType,
      official_file_url:
        copied.data.webViewLink ??
        `https://drive.google.com/file/d/${copied.data.id}/view`,
      copied_at: new Date().toISOString(),
    });
    if (error)
      throw new DriveError(
        "METADATA_FAILED",
        "File copied but database metadata failed. Contact OCFO before retrying.",
      );
  }
}
export async function archiveRequest(r: FinanceRequest) {
  const db = serviceClient();
  try {
    const folders = await buildOfficialFolderStructure(r);
    const { error: metaError } = await db
      .from("requests")
      .update({
        official_folder_id: folders.folder,
        official_folder_url: folders.url,
        drive_copy_status: "COPYING",
        drive_copy_started_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (metaError) throw new Error("Could not store destination folder.");
    const revision = await ensureFolder(
      `Submission ${r.archive_batch}`,
      folders.submitted,
    );
    await copyFolderContents(
      r.source_folder_id!,
      revision,
      r.id,
      r.archive_batch,
    );
    const { error } = await db
      .from("requests")
      .update({
        drive_copy_status: "COPIED",
        copied_at: new Date().toISOString(),
        drive_error_message: null,
      })
      .eq("id", r.id);
    if (error) throw new Error("Could not save archive result.");
    await db
      .from("discrepancies")
      .update({
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
        resolution_notes: "Official archive completed.",
      })
      .eq("entity_id", r.id)
      .eq("code", "DRIVE_COPY_FAILED")
      .eq("status", "OPEN");
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof DriveError
        ? error.message
        : "Official Drive archival failed. Check folder write permissions and Shared Drive storage configuration, then retry from the request page.";
    await db
      .from("requests")
      .update({ drive_copy_status: "FAILED", drive_error_message: message })
      .eq("id", r.id);
    const { data: existingIssue } = await db
      .from("discrepancies")
      .select("id")
      .eq("entity_id", r.id)
      .eq("code", "DRIVE_COPY_FAILED")
      .eq("status", "OPEN")
      .maybeSingle();
    if (!existingIssue)
      await db.from("discrepancies").insert({
        fiscal_year_id: r.fiscal_year_id,
        department_id: r.department_id,
        code: "DRIVE_COPY_FAILED",
        severity: "CRITICAL",
        entity_type: "requests",
        entity_id: r.id,
        description: message,
      });
    return { ok: false, message };
  }
}
