import install from "./getting-started/install.md?raw";
import firstSession from "./getting-started/first-session.md?raw";
import vibeWorkflow from "./getting-started/vibe-coding-workflow.md?raw";
import webclientUi from "./getting-started/webclient-ui.md?raw";
import composerAttachments from "./getting-started/composer-attachments.md?raw";
import modelProviderSettings from "./getting-started/model-provider-settings.md?raw";
import architectureOverview from "./architecture/overview.md?raw";
import accountsLifecycle from "./architecture/accounts-lifecycle.md?raw";
import runtimeBoundaries from "./architecture/runtime-boundaries.md?raw";
import postgresSessionData from "./architecture/postgres-session-data.md?raw";
import promptCache from "./architecture/prompt-prefix-cache.md?raw";
import turnLoop from "./architecture/turn-loop.md?raw";
import contextAssembly from "./architecture/context-assembly.md?raw";
import responseApi from "./architecture/response-api.md?raw";
import sessionSocket from "./architecture/session-socket.md?raw";
import sessionSchemaSearch from "./architecture/session-schema-search.md?raw";
import webclientApi from "./architecture/webclient-api.md?raw";
import protocolMessages from "./architecture/protocol-messages.md?raw";
import tools from "./capabilities/tools.md?raw";
import functionTools from "./capabilities/function-tools.md?raw";
import basetoolsReference from "./capabilities/basetools-reference.md?raw";
import skills from "./capabilities/skills.md?raw";
import hooks from "./capabilities/hooks.md?raw";
import hookEvents from "./capabilities/hook-events.md?raw";
import systemHooks from "./capabilities/system-hooks.md?raw";
import interactiveFunctions from "./capabilities/interactive-functions.md?raw";
import promptRewriteSessionHistory from "./capabilities/prompt-rewrite-session-history.md?raw";
import chatMode from "./capabilities/chat-mode.md?raw";
import dockerPgvector from "./operations/docker-pgvector.md?raw";
import pgvectorPublish from "./operations/pgvector-publish.md?raw";
import monorepo from "./operations/monorepo.md?raw";
import serverPaths from "./operations/server-paths.md?raw";
import runtimeSettings from "./operations/runtime-settings.md?raw";
import runtimeVolumeContract from "./operations/runtime-volume-contract.md?raw";
import licensingProvenance from "./operations/licensing-provenance.md?raw";
import npmLauncher from "./operations/npm-launcher.md?raw";
import testingAudit from "./operations/testing-and-audit.md?raw";
import sourceMap from "./reference/source-map.md?raw";
import sourceInventory from "./reference/source-inventory.md?raw";
import repositoryDocs from "./reference/repository-docs.md?raw";
import documentationPlan from "./reference/documentation-plan.md?raw";

export type DocumentEntry = {
  id: string;
  title: string;
  description: string;
  markdown: string;
};

export type DocumentSection = {
  id: string;
  title: string;
  entries: DocumentEntry[];
};

export const documentSections: DocumentSection[] = [
  {
    id: "getting-started",
    title: "사용자 설치와 바이브코딩",
    entries: [
      {
        id: "install",
        title: "설치와 실행",
        description: "npm 설치, Docker 실행, 첫 접속 경로.",
        markdown: install
      },
      {
        id: "first-session",
        title: "첫 세션 만들기",
        description: "프로젝트 선택, 모델 설정, 세션 시작 절차.",
        markdown: firstSession
      },
      {
        id: "vibe-coding-workflow",
        title: "바이브코딩 작업 흐름",
        description: "요구사항에서 검증까지 반복 작업 방식.",
        markdown: vibeWorkflow
      },
      {
        id: "webclient-ui",
        title: "웹 클라이언트 UI 흐름",
        description: "왼쪽 메뉴, 세션 화면, right sidebar 흐름.",
        markdown: webclientUi
      },
      {
        id: "composer-attachments",
        title: "Composer, 첨부, 스킬 멘션",
        description: "입력, 파일/이미지 첨부, $skill mention.",
        markdown: composerAttachments
      },
      {
        id: "model-provider-settings",
        title: "모델과 Provider 설정",
        description: "provider, model, modality, context size 설정.",
        markdown: modelProviderSettings
      }
    ]
  },
  {
    id: "architecture",
    title: "아키텍처와 인프라",
    entries: [
      {
        id: "overview",
        title: "전체 구조",
        description: "Turbo, 앱/패키지 경계, 서버 표면.",
        markdown: architectureOverview
      },
      {
        id: "accounts-lifecycle",
        title: "Account 생명주기",
        description: "default ndev, identity, deletion cascade.",
        markdown: accountsLifecycle
      },
      {
        id: "runtime-boundaries",
        title: "런타임 권한 경계",
        description: "agent authority, webclient, settings, socket 책임.",
        markdown: runtimeBoundaries
      },
      {
        id: "postgres-session-data",
        title: "PostgreSQL 세션 데이터",
        description: "session, sessiondata, chat, sessionsearch.",
        markdown: postgresSessionData
      },
      {
        id: "prompt-prefix-cache",
        title: "프롬프트 prefix-cache 계약",
        description: "모델 요청 순서와 예외 규칙.",
        markdown: promptCache
      },
      {
        id: "turn-loop",
        title: "턴 루프",
        description: "세션 실행 순서, interruption, 반복 종료.",
        markdown: turnLoop
      },
      {
        id: "context-assembly",
        title: "컨텍스트 조립",
        description: "developer/user/environment/history 조립 규칙.",
        markdown: contextAssembly
      },
      {
        id: "response-api",
        title: "Responses API 계층",
        description: "모델 provider request/stream/payload 정규화.",
        markdown: responseApi
      },
      {
        id: "session-socket",
        title: "세션 WebSocket",
        description: "브라우저 연결, grant, event fan-out.",
        markdown: sessionSocket
      },
      {
        id: "session-schema-search",
        title: "세션 스키마와 검색",
        description: "session/sessiondata/sessionsearch와 검색 모드.",
        markdown: sessionSchemaSearch
      },
      {
        id: "webclient-api",
        title: "Webclient HTTP API",
        description: "metadata, workspace, project, chat route 구조.",
        markdown: webclientApi
      },
      {
        id: "protocol-messages",
        title: "Protocol 메시지",
        description: "identity, account, session socket, client request 메시지.",
        markdown: protocolMessages
      }
    ]
  },
  {
    id: "capabilities",
    title: "도구, 스킬, 훅",
    entries: [
      {
        id: "tools",
        title: "내장 도구",
        description: "process/function tool, basetools, allowlist.",
        markdown: tools
      },
      {
        id: "function-tools",
        title: "함수 도구 상세",
        description: "askUserQuestion, session_history 내부 계약.",
        markdown: functionTools
      },
      {
        id: "basetools-reference",
        title: "내장 Basetools 레퍼런스",
        description: "bash, read_file, grep_search, edit, web 도구 입력과 기준.",
        markdown: basetoolsReference
      },
      {
        id: "skills",
        title: "스킬 시스템",
        description: "사용자/프로젝트/내장 스킬 로딩 방식.",
        markdown: skills
      },
      {
        id: "hooks",
        title: "턴 훅",
        description: "hook event, effect, stop-turn 정책.",
        markdown: hooks
      },
      {
        id: "hook-events",
        title: "Hook 이벤트 상세",
        description: "event별 실행 시점, effect merge, process hook.",
        markdown: hookEvents
      },
      {
        id: "system-hooks",
        title: "System Hook 동작",
        description: "skill marker, cot reminder, inline image, loop detection.",
        markdown: systemHooks
      },
      {
        id: "interactive-functions",
        title: "상호작용 함수 도구",
        description: "askUserQuestion, session_history.",
        markdown: interactiveFunctions
      },
      {
        id: "prompt-rewrite-session-history",
        title: "rewriter marker와 session_history 사용법",
        description: "프롬프트 재작성과 세션 검색 사용 예시.",
        markdown: promptRewriteSessionHistory
      },
      {
        id: "chat-mode",
        title: "Chat 모드",
        description: "프로젝트 세션과 분리된 chat 권한과 도구 정책.",
        markdown: chatMode
      }
    ]
  },
  {
    id: "operations",
    title: "운영과 검증",
    entries: [
      {
        id: "docker-pgvector",
        title: "Docker와 pgvector",
        description: "컨테이너, 볼륨, Korean FTS 이미지.",
        markdown: dockerPgvector
      },
      {
        id: "pgvector-publish",
        title: "pgvector 이미지 배포",
        description: "GHCR multiarch base image publish 절차.",
        markdown: pgvectorPublish
      },
      {
        id: "monorepo",
        title: "모노레포 운영",
        description: "Yarn PnP, Turbo, 코드 배치 규칙.",
        markdown: monorepo
      },
      {
        id: "server-paths",
        title: "서버 경로 매핑",
        description: "host, WSL, container path 정규화.",
        markdown: serverPaths
      },
      {
        id: "runtime-settings",
        title: "런타임 설정",
        description: "settings.json, iteration, embeddings, prompt rewrite 설정.",
        markdown: runtimeSettings
      },
      {
        id: "runtime-volume-contract",
        title: "Runtime Volume 계약",
        description: "/ndx 단일 볼륨, workspace, pgvector, i18n overlay.",
        markdown: runtimeVolumeContract
      },
      {
        id: "licensing-provenance",
        title: "라이선스와 Provenance",
        description: "미정 license, upstream notice, provenance 정책.",
        markdown: licensingProvenance
      },
      {
        id: "npm-launcher",
        title: "npm 런처",
        description: "최종 사용자 Docker launcher와 compose template.",
        markdown: npmLauncher
      },
      {
        id: "testing-and-audit",
        title: "테스트와 문서 검수",
        description: "문서 완료 여부를 코드로 확인하는 기준.",
        markdown: testingAudit
      }
    ]
  },
  {
    id: "reference",
    title: "참조와 장기 계획",
    entries: [
      {
        id: "source-map",
        title: "소스 맵",
        description: "apps, packages, root 운영 파일 색인.",
        markdown: sourceMap
      },
      {
        id: "source-inventory",
        title: "소스 인벤토리",
        description: "코드 스캔 기반 앱/패키지 디렉터리 목록.",
        markdown: sourceInventory
      },
      {
        id: "repository-docs",
        title: "Repository Docs 맵",
        description: "루트 docs와 앱 문서 사이트의 역할 분리.",
        markdown: repositoryDocs
      },
      {
        id: "documentation-plan",
        title: "문서화 절차 계획",
        description: "수십 단계 문서화 백로그와 완료 조건.",
        markdown: documentationPlan
      }
    ]
  }
];

export function findDocument(sectionId: string | null, documentId: string | null): DocumentEntry {
  const section = documentSections.find((item) => item.id === sectionId) ?? documentSections[0];
  return section?.entries.find((item) => item.id === documentId) ?? section?.entries[0] ?? documentSections[0]!.entries[0]!;
}

export function documentPath(sectionId: string, documentId: string): string {
  return `/docs/${sectionId}/${documentId}`;
}
