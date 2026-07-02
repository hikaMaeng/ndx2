import assert from "node:assert/strict";
import test from "node:test";
import { clipboardAttachmentFiles, modelAttachmentInputAccept, modelSupportsAttachmentMimeType } from "./attachment.js";

test("modelSupportsAttachmentMimeType treats missing modalities as text-only", () => {
  assert.equal(modelSupportsAttachmentMimeType(undefined, "image/png"), false);
  assert.equal(modelSupportsAttachmentMimeType(undefined, "text/plain"), false);
});

test("modelSupportsAttachmentMimeType separates image and file modalities", () => {
  assert.equal(modelSupportsAttachmentMimeType(["text", "image"], "image/png"), true);
  assert.equal(modelSupportsAttachmentMimeType(["text", "image"], "application/pdf"), false);
  assert.equal(modelSupportsAttachmentMimeType(["text", "file"], "image/png"), false);
  assert.equal(modelSupportsAttachmentMimeType(["text", "file"], "application/pdf"), true);
});

test("modelAttachmentInputAccept narrows only image-only models", () => {
  assert.equal(modelAttachmentInputAccept(["text"]), undefined);
  assert.equal(modelAttachmentInputAccept(["text", "image"]), "image/*");
  assert.equal(modelAttachmentInputAccept(["text", "file"]), undefined);
  assert.equal(modelAttachmentInputAccept(["text", "image", "file"]), undefined);
});

test("clipboardAttachmentFiles uses clipboard files when the browser exposes them", () => {
  const image = new File(["a"], "image.png", { type: "image/png" });
  const text = new File(["b"], "note.txt", { type: "text/plain" });
  assert.deepEqual(clipboardAttachmentFiles({ files: [image, text] as unknown as FileList, items: [] as unknown as DataTransferItemList }), [image, text]);
});

test("clipboardAttachmentFiles extracts image blobs from clipboard items", () => {
  const image = new File(["a"], "", { type: "image/png", lastModified: 123 });
  const result = clipboardAttachmentFiles({
    files: [] as unknown as FileList,
    items: [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => image }
    ] as unknown as DataTransferItemList
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, "clipboard-image-2.png");
  assert.equal(result[0]?.type, "image/png");
  assert.equal(result[0]?.lastModified, 123);
});

test("clipboardAttachmentFiles ignores non-image item blobs when files are absent", () => {
  const result = clipboardAttachmentFiles({
    files: [] as unknown as FileList,
    items: [
      { kind: "file", type: "text/plain", getAsFile: () => new File(["a"], "note.txt", { type: "text/plain" }) }
    ] as unknown as DataTransferItemList
  });
  assert.deepEqual(result, []);
});
