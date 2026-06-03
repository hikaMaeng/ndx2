import React from "react";
import type { NDXSessionClientRequestClosedMessage, NDXSessionClientResponseMessage } from "ndx/common/protocol";
import type { SessionSocketClient } from "../socket/sessionSocket";
import { AskUserQuestionDialog } from "./AskUserQuestionDialog";
import { askUserQuestionResponse, initialAskUserQuestionDraft } from "./askUserQuestionProtocol";
import type { AskUserQuestionDraft, AskUserQuestionRequest } from "./types";

export function useAskUserQuestionController({
  getSocket,
  t
}: {
  getSocket: () => SessionSocketClient | null;
  t: Record<string, string>;
}) {
  const [request, setRequest] = React.useState<AskUserQuestionRequest | undefined>();
  const [draft, setDraft] = React.useState<AskUserQuestionDraft>({ attachments: {}, selected: {}, text: {} });
  const draftRef = React.useRef(draft);

  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  React.useEffect(() => () => {
    for (const attachment of Object.values(draftRef.current.attachments).flat()) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }, []);

  const onClientRequest = (message: AskUserQuestionRequest) => {
    if (message.request.kind !== "askUserQuestion") return;
    for (const attachment of Object.values(draft.attachments).flat()) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setRequest(message);
    setDraft(initialAskUserQuestionDraft(message));
  };

  const onClientRequestClosed = (message: NDXSessionClientRequestClosedMessage) => {
    setRequest((current) => {
      if (current?.requestId !== message.requestId) return current;
      for (const attachment of Object.values(draft.attachments).flat()) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return undefined;
    });
  };

  const updateSelected = (questionId: string, value: string) => {
    setDraft((current) => ({ ...current, selected: { ...current.selected, [questionId]: value } }));
  };

  const updateText = (questionId: string, value: string) => {
    setDraft((current) => ({ ...current, text: { ...current.text, [questionId]: value } }));
  };

  const addAttachments = (questionId: string, files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setDraft((current) => ({
      ...current,
      attachments: {
        ...current.attachments,
        [questionId]: [
          ...(current.attachments[questionId] ?? []),
          ...imageFiles.map((file, index) => ({
            file,
            id: `${Date.now()}-${index}-${file.name || "image"}`,
            mimeType: file.type || "image/png",
            name: file.name || `pasted-image-${index + 1}.png`,
            previewUrl: URL.createObjectURL(file),
            size: file.size
          }))
        ].slice(0, 8)
      }
    }));
  };

  const removeAttachment = (questionId: string, attachmentId: string) => {
    setDraft((current) => {
      const removed = current.attachments[questionId]?.find((attachment) => attachment.id === attachmentId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return {
        ...current,
        attachments: {
          ...current.attachments,
          [questionId]: (current.attachments[questionId] ?? []).filter((attachment) => attachment.id !== attachmentId)
        }
      };
    });
  };

  const submit = () => {
    if (!request) return;
    void (async () => {
      const response: Omit<NDXSessionClientResponseMessage, "type" | "language"> = {
        requestId: request.requestId,
        connectionToken: request.connectionToken,
        response: await askUserQuestionResponse(request, draft)
      };
      if (getSocket()?.sendClientResponse(response)) {
        for (const attachment of Object.values(draft.attachments).flat()) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
        setRequest(undefined);
      }
    })();
  };

  const cancel = () => {
    if (!request) return;
    const response: Omit<NDXSessionClientResponseMessage, "type" | "language"> = {
      requestId: request.requestId,
      connectionToken: request.connectionToken,
      response: {
        kind: "askUserQuestion",
        answers: Object.fromEntries(request.request.questions.map((question) => [question.id, { answers: [] }]))
      }
    };
    if (getSocket()?.sendClientResponse(response)) {
      for (const attachment of Object.values(draft.attachments).flat()) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setRequest(undefined);
    }
  };

  return {
    onClientRequest,
    onClientRequestClosed,
    dialog: request
      ? <AskUserQuestionDialog request={request} draft={draft} t={t} onAddAttachments={addAttachments} onCancel={cancel} onRemoveAttachment={removeAttachment} onSubmit={submit} onTextChange={updateText} onSelectedChange={updateSelected} />
      : null
  };
}
