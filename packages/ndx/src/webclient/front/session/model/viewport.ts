export type SessionViewportModel = {
  autoScrollEnabled: boolean;
  chatScrollTop: number;
};

export function createSessionViewportModel(): SessionViewportModel {
  return {
    autoScrollEnabled: true,
    chatScrollTop: 0
  };
}
