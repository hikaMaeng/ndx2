import type { NDXSessionSkillSummary } from "ndx/common/protocol";

export type SessionCapabilitiesModel = {
  availableSkills: NDXSessionSkillSummary[];
};

export function createSessionCapabilitiesModel(): SessionCapabilitiesModel {
  return {
    availableSkills: []
  };
}
