import type { NDXDatabase } from "../init/database.js";
import type { NDXSettingsResolvedModelConfig } from "../../common/settings/index.js";

export type NDXSelfcheckSubjectKind = "tool" | "hook";
export type NDXSelfcheckStatus = "open" | "reviewing" | "accepted" | "dismissed" | "resolved";
export type NDXSelfcheckCandidateStatus = "pending" | "analyzing" | "analyzed" | "skipped" | "failed";

export type NDXSelfcheckRow = {
  selfcheckid: string;
  subjectkind: NDXSelfcheckSubjectKind;
  subjectname: string;
  category: string;
  severity: string;
  status: NDXSelfcheckStatus;
  fingerprint: string;
  title: string;
  summary: string;
  evidence: unknown;
  recommendation: unknown;
  confidence: string | null;
  model: unknown;
  promptversion: string;
  analysiskind: string;
  llmraw: unknown;
  targetsessionid: string | null;
  targetdataid: string | null;
  targetiteration: number | null;
  targetcallid: string | null;
  targethookrunid: string | null;
  firstseenat: Date;
  lastseenat: Date;
  occurrencecount: number;
  sampledataids: string[];
  createdat: Date;
  updatedat: Date;
};

export type NDXSelfcheckCandidateRow = {
  candidateid: string;
  subjectkind: NDXSelfcheckSubjectKind;
  subjectname: string;
  analyzer: string;
  sessionid: string | null;
  calldataid: string | null;
  resultdataid: string | null;
  hookrunid: string | null;
  fingerprint: string;
  reason: string;
  evidence: unknown;
  status: NDXSelfcheckCandidateStatus;
  attemptcount: number;
  lastattemptat: Date | null;
  lasterror: string | null;
  createdat: Date;
  updatedat: Date;
};

export type NDXSelfcheckCursorRow = {
  analyzer: string;
  subjectkind: NDXSelfcheckSubjectKind;
  subjectname: string;
  lastdataid: string;
  settings: unknown;
  laststartedat: Date | null;
  lastcompletedat: Date | null;
  laststatus: string | null;
  lasterror: string | null;
  updatedat: Date;
};

export type NDXSelfcheckRunRow = {
  runid: string;
  analyzer: string;
  subjectkind: NDXSelfcheckSubjectKind;
  subjectname: string;
  startedat: Date;
  completedat: Date | null;
  fromdataid: string;
  todataid: string | null;
  scannedrows: number;
  createdcandidates: number;
  llmanalyses: number;
  createdchecks: number;
  dedupedchecks: number;
  status: string;
  error: string | null;
};

export type NDXSelfcheckRunMode = "extract" | "analyze" | "all";

export type NDXSelfcheckRunOptions = {
  userHome: string;
  mode?: NDXSelfcheckRunMode;
  batchSize?: number;
  maxLlmAnalyses?: number;
  maxEvidenceChars?: number;
  modelCaller?: NDXSelfcheckModelCaller;
};

export type NDXSelfcheckModelCaller = (input: {
  model: NDXSettingsResolvedModelConfig;
  promptVersion: string;
  candidate: NDXSelfcheckCandidateRow;
  evidenceText: string;
  database: NDXDatabase;
}) => Promise<string>;

export type NDXSelfcheckListInput = {
  status?: string;
  subjectkind?: string;
  subjectname?: string;
  limit?: number;
};
