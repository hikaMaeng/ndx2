export const NDX_AGENT_LANGUAGES = ["en", "ko"] as const;

export type NDXAgentLanguage = (typeof NDX_AGENT_LANGUAGES)[number];

export const DEFAULT_NDX_AGENT_LANGUAGE: NDXAgentLanguage = "en";

export const NDX_AGENT_RESOURCE = Object.freeze({
  TURN_HOOK_REQUEST_RECEIVED_STOPPED_MESSAGE: "turn.hook.requestReceived.stopped.message",
  TURN_HOOK_CONTEXT_PREPARED_STOPPED_MESSAGE: "turn.hook.contextPrepared.stopped.message",
  TURN_HOOK_TOOL_CALLED_STOPPED_MESSAGE: "turn.hook.toolCalled.stopped.message",
  TURN_HOOK_TOOL_RESULTS_COLLECTED_STOPPED_MESSAGE: "turn.hook.toolResultsCollected.stopped.message",
  TURN_LOOP_DETECTION_STOPPED_MESSAGE: "turn.loopDetection.stopped.message",
  TURN_MODEL_PROGRESS_MESSAGE: "turn.modelProgress.message",
  TURN_ITERATION_LIMIT_EMPTY_RESPONSE_MESSAGE: "turn.iterationLimit.emptyResponse.message",
  TURN_ITERATION_LIMIT_SYSTEM_MESSAGE: "turn.iterationLimit.system.message",
  PROTOCOL_INVALID_JSON_ERROR: "protocol.invalidJson.error",
  PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR: "protocol.sessionGrant.unavailable.error",
  PROTOCOL_SESSION_ALREADY_RUNNING_ERROR: "protocol.session.alreadyRunning.error",
  PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR: "protocol.session.unsupportedMessage.error",
  PROTOCOL_SESSION_CREATE_TARGET_REQUIRED_ERROR: "protocol.session.createTargetRequired.error",
  PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR: "protocol.projectPath.outsideWorkspace.error",
  PROTOCOL_SESSION_CREATE_PROJECT_MISMATCH_ERROR: "protocol.session.createProjectMismatch.error",
  PROTOCOL_SKILL_LIST_PROJECT_REQUIRED_ERROR: "protocol.skillList.projectRequired.error",
  PROTOCOL_SESSION_RENAME_UNAVAILABLE_ERROR: "protocol.session.renameUnavailable.error",
  PROTOCOL_SESSION_RENAME_FAILED_ERROR: "protocol.session.renameFailed.error",
  PROTOCOL_SESSION_DELETE_UNAVAILABLE_ERROR: "protocol.session.deleteUnavailable.error",
  PROTOCOL_SESSION_DELETE_FAILED_ERROR: "protocol.session.deleteFailed.error",
  PROTOCOL_SESSION_ATTACH_UNAVAILABLE_ERROR: "protocol.session.attachUnavailable.error",
  PROTOCOL_SESSION_ATTACH_PROJECT_MISMATCH_ERROR: "protocol.session.attachProjectMismatch.error",
  PROTOCOL_SESSION_GRANT_REQUIRED_ERROR: "protocol.sessionGrant.required.error",
  PROTOCOL_ACCOUNT_SELECTION_REQUIRED_ERROR: "protocol.accountSelection.required.error",
  PROTOCOL_ACCOUNT_SELECTION_UNKNOWN_USER_ERROR: "protocol.accountSelection.unknownUser.error",
  PROTOCOL_PROJECT_CONFIG_REQUIRED_ERROR: "protocol.projectConfig.required.error",
  WEB_DATABASE_UNAVAILABLE_ERROR: "web.database.unavailable.error",
  WEB_PATH_REQUIRED_ERROR: "web.path.required.error",
  WEB_PROJECT_PATH_MISMATCH_ERROR: "web.projectPath.mismatch.error",
  WEB_SESSION_NOT_FOUND_ERROR: "web.session.notFound.error",
  WEB_SESSION_INPUT_SOCKET_REQUIRED_ERROR: "web.sessionInput.socketRequired.error",
  WEB_SESSION_INTERRUPT_SOCKET_REQUIRED_ERROR: "web.sessionInterrupt.socketRequired.error",
  WEB_CLIENT_ID_INVALID_ERROR: "web.clientid.invalid.error",
  WEB_ISACTIVE_REQUIRED_ERROR: "web.isactive.required.error",
  WEB_PROVIDER_TITLE_URL_REQUIRED_ERROR: "web.provider.titleUrlRequired.error",
  WEB_PROVIDER_NOT_FOUND_ERROR: "web.provider.notFound.error",
  WEB_MODEL_REQUIRED_ERROR: "web.model.required.error",
  WEB_MODEL_SYNC_FAILED_ERROR: "web.model.syncFailed.error"
} as const);

export type NDXAgentResourceKey = (typeof NDX_AGENT_RESOURCE)[keyof typeof NDX_AGENT_RESOURCE];

export type NDXAgentResourceBundle = Partial<Record<NDXAgentResourceKey | string, string>>;

export type NDXAgentResourceResolver = (key: NDXAgentResourceKey, options?: { language?: unknown; values?: Record<string, string | number> }) => string;

export const DEFAULT_NDX_AGENT_RESOURCES: Record<NDXAgentLanguage, Record<NDXAgentResourceKey, string>> = {
  en: {
    [NDX_AGENT_RESOURCE.TURN_HOOK_REQUEST_RECEIVED_STOPPED_MESSAGE]: "The request-received hook stopped the turn.",
    [NDX_AGENT_RESOURCE.TURN_HOOK_CONTEXT_PREPARED_STOPPED_MESSAGE]: "The context-prepared hook stopped the turn.",
    [NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_CALLED_STOPPED_MESSAGE]: "The tool-called hook stopped the turn.",
    [NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_RESULTS_COLLECTED_STOPPED_MESSAGE]: "The tool-results-collected hook stopped the turn.",
    [NDX_AGENT_RESOURCE.TURN_LOOP_DETECTION_STOPPED_MESSAGE]: "A repetitive work loop was detected, so the current turn was stopped.\n\n{reason}",
    [NDX_AGENT_RESOURCE.TURN_MODEL_PROGRESS_MESSAGE]: "The model request has been running for {elapsedSeconds}s. Local models can be slow; interrupt the session if you do not want to keep waiting.",
    [NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_EMPTY_RESPONSE_MESSAGE]: "The agent reached the tool iteration limit ({maxIterations}) and could not produce a final response.",
    [NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_SYSTEM_MESSAGE]: "The agent has reached the {maxIterations} tool-iteration limit. Do not call tools. Provide the final user-facing assistant response now, summarizing what was completed and any remaining issue.",
    [NDX_AGENT_RESOURCE.PROTOCOL_INVALID_JSON_ERROR]: "Message must be JSON.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR]: "Session is not attached to this socket.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ALREADY_RUNNING_ERROR]: "Session is already running; interrupt it before sending another request.",
    [NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR]: "Unsupported session message.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_TARGET_REQUIRED_ERROR]: "Session create requires userid and projectName.",
    [NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR]: "projectName must name a direct workspace child folder.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_PROJECT_MISMATCH_ERROR]: "Session create project identity does not match this request.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SKILL_LIST_PROJECT_REQUIRED_ERROR]: "Skill list requires a negotiated project or an attached session id.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_RENAME_UNAVAILABLE_ERROR]: "Session is not available for this rename request.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_RENAME_FAILED_ERROR]: "Session rename failed.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_DELETE_UNAVAILABLE_ERROR]: "Session is not available for this delete request.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_DELETE_FAILED_ERROR]: "Session delete failed.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_UNAVAILABLE_ERROR]: "Session is not available for this attach request.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_PROJECT_MISMATCH_ERROR]: "Session project identity does not match this attach request.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_REQUIRED_ERROR]: "Session is not attached to this socket.",
    [NDX_AGENT_RESOURCE.PROTOCOL_ACCOUNT_SELECTION_REQUIRED_ERROR]: "Account selection is required before any other work.",
    [NDX_AGENT_RESOURCE.PROTOCOL_ACCOUNT_SELECTION_UNKNOWN_USER_ERROR]: "Selected userid does not exist.",
    [NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_CONFIG_REQUIRED_ERROR]: "projectName is required in one project.configure message.",
    [NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR]: "Database is not available.",
    [NDX_AGENT_RESOURCE.WEB_PATH_REQUIRED_ERROR]: "Path is required.",
    [NDX_AGENT_RESOURCE.WEB_PROJECT_PATH_MISMATCH_ERROR]: "Project path does not match the requested project id.",
    [NDX_AGENT_RESOURCE.WEB_SESSION_NOT_FOUND_ERROR]: "Session is not found.",
    [NDX_AGENT_RESOURCE.WEB_SESSION_INPUT_SOCKET_REQUIRED_ERROR]: "Session input must be sent through an attached WebSocket session.",
    [NDX_AGENT_RESOURCE.WEB_SESSION_INTERRUPT_SOCKET_REQUIRED_ERROR]: "Session interrupt must be sent through an attached WebSocket session.",
    [NDX_AGENT_RESOURCE.WEB_CLIENT_ID_INVALID_ERROR]: "clientid must be a uuid.",
    [NDX_AGENT_RESOURCE.WEB_ISACTIVE_REQUIRED_ERROR]: "isactive is required.",
    [NDX_AGENT_RESOURCE.WEB_PROVIDER_TITLE_URL_REQUIRED_ERROR]: "title and url are required.",
    [NDX_AGENT_RESOURCE.WEB_PROVIDER_NOT_FOUND_ERROR]: "Provider not found.",
    [NDX_AGENT_RESOURCE.WEB_MODEL_REQUIRED_ERROR]: "Model is required.",
    [NDX_AGENT_RESOURCE.WEB_MODEL_SYNC_FAILED_ERROR]: "Failed to fetch {endpoints}: {message}"
  },
  ko: {
    [NDX_AGENT_RESOURCE.TURN_HOOK_REQUEST_RECEIVED_STOPPED_MESSAGE]: "요청 접수 훅이 턴을 중단했습니다.",
    [NDX_AGENT_RESOURCE.TURN_HOOK_CONTEXT_PREPARED_STOPPED_MESSAGE]: "컨텍스트 준비 훅이 턴을 중단했습니다.",
    [NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_CALLED_STOPPED_MESSAGE]: "도구 호출 훅이 턴을 중단했습니다.",
    [NDX_AGENT_RESOURCE.TURN_HOOK_TOOL_RESULTS_COLLECTED_STOPPED_MESSAGE]: "도구 결과 취합 훅이 턴을 중단했습니다.",
    [NDX_AGENT_RESOURCE.TURN_LOOP_DETECTION_STOPPED_MESSAGE]: "반복적인 작업 루프가 감지되어 현재 턴을 중단했습니다.\n\n{reason}",
    [NDX_AGENT_RESOURCE.TURN_MODEL_PROGRESS_MESSAGE]: "모델 요청이 {elapsedSeconds}초 동안 진행 중입니다. 로컬 모델은 느릴 수 있습니다. 더 기다리지 않으려면 세션을 인터럽트하세요.",
    [NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_EMPTY_RESPONSE_MESSAGE]: "작업 반복 한도({maxIterations}회)에 도달해 최종 답변을 생성하지 못했습니다.",
    [NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_SYSTEM_MESSAGE]: "에이전트가 도구 반복 한도 {maxIterations}회에 도달했습니다. 도구를 호출하지 말고, 완료한 작업과 남은 문제를 요약해 사용자에게 보여줄 최종 답변을 지금 작성하세요.",
    [NDX_AGENT_RESOURCE.PROTOCOL_INVALID_JSON_ERROR]: "메시지는 JSON이어야 합니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_UNAVAILABLE_ERROR]: "이 소켓에 연결된 세션이 아닙니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ALREADY_RUNNING_ERROR]: "세션이 이미 실행 중입니다. 다른 요청을 보내기 전에 인터럽트하세요.",
    [NDX_AGENT_RESOURCE.PROTOCOL_UNSUPPORTED_SESSION_MESSAGE_ERROR]: "지원하지 않는 세션 메시지입니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_TARGET_REQUIRED_ERROR]: "세션 생성에는 userid와 projectName이 필요합니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR]: "projectName은 워크스페이스 직계 자식 폴더명이어야 합니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_CREATE_PROJECT_MISMATCH_ERROR]: "세션 생성 프로젝트 ID가 요청과 일치하지 않습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SKILL_LIST_PROJECT_REQUIRED_ERROR]: "스킬 목록에는 협상된 프로젝트 또는 연결된 세션 ID가 필요합니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_RENAME_UNAVAILABLE_ERROR]: "이 이름 변경 요청에 사용할 수 있는 세션이 없습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_RENAME_FAILED_ERROR]: "세션 이름 변경에 실패했습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_DELETE_UNAVAILABLE_ERROR]: "이 삭제 요청에 사용할 수 있는 세션이 없습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_DELETE_FAILED_ERROR]: "세션 삭제에 실패했습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_UNAVAILABLE_ERROR]: "이 연결 요청에 사용할 수 있는 세션이 없습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_ATTACH_PROJECT_MISMATCH_ERROR]: "세션 프로젝트 ID가 연결 요청과 일치하지 않습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_SESSION_GRANT_REQUIRED_ERROR]: "이 소켓에 연결된 세션이 아닙니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_ACCOUNT_SELECTION_REQUIRED_ERROR]: "다른 작업 전에 계정 선택이 필요합니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_ACCOUNT_SELECTION_UNKNOWN_USER_ERROR]: "선택한 userid가 존재하지 않습니다.",
    [NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_CONFIG_REQUIRED_ERROR]: "하나의 project.configure 메시지에 projectName이 필요합니다.",
    [NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR]: "데이터베이스를 사용할 수 없습니다.",
    [NDX_AGENT_RESOURCE.WEB_PATH_REQUIRED_ERROR]: "path가 필요합니다.",
    [NDX_AGENT_RESOURCE.WEB_PROJECT_PATH_MISMATCH_ERROR]: "프로젝트 경로가 요청한 프로젝트 ID와 일치하지 않습니다.",
    [NDX_AGENT_RESOURCE.WEB_SESSION_NOT_FOUND_ERROR]: "세션을 찾을 수 없습니다.",
    [NDX_AGENT_RESOURCE.WEB_SESSION_INPUT_SOCKET_REQUIRED_ERROR]: "세션 입력은 연결된 WebSocket 세션으로 보내야 합니다.",
    [NDX_AGENT_RESOURCE.WEB_SESSION_INTERRUPT_SOCKET_REQUIRED_ERROR]: "세션 인터럽트는 연결된 WebSocket 세션으로 보내야 합니다.",
    [NDX_AGENT_RESOURCE.WEB_CLIENT_ID_INVALID_ERROR]: "clientid는 uuid여야 합니다.",
    [NDX_AGENT_RESOURCE.WEB_ISACTIVE_REQUIRED_ERROR]: "isactive가 필요합니다.",
    [NDX_AGENT_RESOURCE.WEB_PROVIDER_TITLE_URL_REQUIRED_ERROR]: "title과 url이 필요합니다.",
    [NDX_AGENT_RESOURCE.WEB_PROVIDER_NOT_FOUND_ERROR]: "프로바이더를 찾을 수 없습니다.",
    [NDX_AGENT_RESOURCE.WEB_MODEL_REQUIRED_ERROR]: "model이 필요합니다.",
    [NDX_AGENT_RESOURCE.WEB_MODEL_SYNC_FAILED_ERROR]: "{endpoints}에서 모델 목록을 가져오지 못했습니다: {message}"
  }
};

export function isNDXAgentLanguage(value: unknown): value is NDXAgentLanguage {
  return typeof value === "string" && NDX_AGENT_LANGUAGES.includes(value as NDXAgentLanguage);
}

export function normalizeNDXAgentLanguage(value: unknown, fallback: NDXAgentLanguage = DEFAULT_NDX_AGENT_LANGUAGE): NDXAgentLanguage {
  if (isNDXAgentLanguage(value)) {
    return value;
  }
  if (typeof value === "string") {
    const base = value.toLowerCase().split("-")[0];
    if (isNDXAgentLanguage(base)) {
      return base;
    }
  }
  return fallback;
}

export function createNDXAgentResourceResolver(resources: Partial<Record<NDXAgentLanguage, NDXAgentResourceBundle>> = {}): NDXAgentResourceResolver {
  return (key, options = {}) => {
    const language = normalizeNDXAgentLanguage(options.language);
    const text = resources[language]?.[key] ?? DEFAULT_NDX_AGENT_RESOURCES[language][key] ?? DEFAULT_NDX_AGENT_RESOURCES.en[key] ?? key;
    return Object.entries(options.values ?? {}).reduce((current, [name, value]) => current.replaceAll(`{${name}}`, String(value)), text);
  };
}
