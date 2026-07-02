export type EncodedAttachment = {
  name: string;
  mimeType: string;
  size: number;
  data: string;
};

export function modelSupportsAttachmentMimeType(modalities: Array<"text" | "image" | "file"> | undefined, mimeType: string): boolean {
  const supported = new Set(modalities ?? ["text"]);
  return supported.has((mimeType || "application/octet-stream").toLowerCase().startsWith("image/") ? "image" : "file");
}

export function modelAttachmentInputAccept(modalities: Array<"text" | "image" | "file"> | undefined): string | undefined {
  const supported = new Set(modalities ?? ["text"]);
  return supported.has("image") && !supported.has("file") ? "image/*" : undefined;
}

export function clipboardAttachmentFiles(clipboardData: Pick<DataTransfer, "files" | "items">): File[] {
  const files = Array.from(clipboardData.files ?? []);
  if (files.length > 0) return files;

  const attachments: File[] = [];
  Array.from(clipboardData.items ?? []).forEach((item, index) => {
    if (item.kind !== "file" || !item.type.toLowerCase().startsWith("image/")) return;
    const file = item.getAsFile();
    if (!file) return;
    if (file.name) {
      attachments.push(file);
      return;
    }
    const mimeType = file.type || item.type || "image/png";
    attachments.push(new File([file], `clipboard-image-${index + 1}.${clipboardImageExtension(mimeType)}`, {
      type: mimeType,
      lastModified: file.lastModified
    }));
  });
  return attachments;
}

export async function encodeAttachments(attachments: Array<{ file: File; name: string; mimeType: string; size: number }>): Promise<EncodedAttachment[]> {
  const encoded = [];
  for (const attachment of attachments) {
    const buffer = await attachment.file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
    }
    encoded.push({
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      data: btoa(binary)
    });
  }
  return encoded;
}

function clipboardImageExtension(mimeType: string): string {
  const subtype = mimeType.toLowerCase().split("/", 2)[1]?.split(/[;+]/u, 1)[0];
  return subtype && /^[a-z0-9]+$/u.test(subtype) ? subtype : "png";
}
