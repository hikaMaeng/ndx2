export type SessionConnectionModel = {
  connectionToken?: string;
  attached: boolean;
  historyRequested: boolean;
  historyLoaded: boolean;
  skillListRequested: boolean;
  lastAttachedAt?: string;
};

export function createSessionConnectionModel(): SessionConnectionModel {
  return {
    attached: false,
    historyRequested: false,
    historyLoaded: false,
    skillListRequested: false
  };
}
