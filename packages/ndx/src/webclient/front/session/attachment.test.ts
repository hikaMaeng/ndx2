import assert from "node:assert/strict";
import test from "node:test";
import { modelAttachmentInputAccept, modelSupportsAttachmentMimeType } from "./attachment.js";

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
