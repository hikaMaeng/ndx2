export type SkillScope = "user" | "repo" | "system";

export type SkillMetadata = {
  name: string;
  description: string;
  pathToSkillMd: string;
  root: string;
  scope: SkillScope;
};

export type SkillRoot = {
  path: string;
  scope: SkillScope;
};

export type Budget = {
  kind: "tokens" | "characters";
  limit: number;
};

export type SkillLine = {
  name: string;
  description: string;
  path: string;
};

export type AvailableSkills = {
  skillRootLines: string[];
  skillLines: string[];
  totalCount: number;
  includedCount: number;
  omittedCount: number;
  truncatedDescriptionChars: number;
  truncatedDescriptionCount: number;
  warningMessage?: string;
};
