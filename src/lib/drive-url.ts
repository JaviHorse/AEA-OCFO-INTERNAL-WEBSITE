export function extractDriveFolderId(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid Google Drive folder URL.");
  }
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com")
    throw new Error("Use an HTTPS drive.google.com folder URL.");
  const match = url.pathname.match(
    /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)\/?$/,
  );
  const id = match?.[1];
  if (!id || id.length < 10)
    throw new Error(
      "Use a Google Drive folder link, not a document or file link.",
    );
  return id;
}
