import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { NDXSessionAttachmentReference } from "../../common/protocol/index.js";

export type NDXSessionInputAttachmentData = {
  name: string;
  mimeType: string;
  size: number;
  data: string;
};

export async function writeSessionAttachments(
  projectHome: string,
  sessionid: string,
  attachments: NDXSessionInputAttachmentData[] = []
): Promise<NDXSessionAttachmentReference[]> {
  if (attachments.length === 0) {
    return [];
  }
  const sessionDirectory = path.posix.join(projectHome, ".ndx", "sessions", sessionid);
  await fs.mkdir(sessionDirectory, { recursive: true });
  const written: NDXSessionAttachmentReference[] = [];
  for (const attachment of attachments) {
    const bytes = Buffer.from(attachment.data, "base64");
    if (bytes.length !== attachment.size) {
      throw new Error(`Attachment size mismatch: ${attachment.name}`);
    }
    const fileName = `${randomUUID()}${fileExtension(attachment.name, attachment.mimeType)}`;
    const filePath = path.posix.join(sessionDirectory, fileName);
    await fs.writeFile(filePath, bytes, { flag: "wx" });
    written.push({
      kind: attachment.mimeType.toLowerCase().startsWith("image/") ? "image" : "file",
      path: filePath,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: bytes.length
    });
  }
  return written;
}

export function assertModelSupportsAttachments(model: { modalities?: Array<"text" | "image" | "file"> }, attachments: NDXSessionInputAttachmentData[] = []): void {
  if (attachments.length === 0) {
    return;
  }
  const modalities = new Set(model.modalities ?? ["text"]);
  for (const attachment of attachments) {
    const required = attachment.mimeType.toLowerCase().startsWith("image/") ? "image" : "file";
    if (!modalities.has(required)) {
      throw new Error(`Model does not declare ${required} modality support.`);
    }
  }
}

function fileExtension(name: string, mimeType: string): string {
  const match = name.match(/(\.[A-Za-z0-9]{1,16})$/);
  if (match) {
    return match[1]!.toLowerCase();
  }
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "text/plain") return ".txt";
  return ".bin";
}
