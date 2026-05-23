export type NDXProjectTarget = "local";

export type NDXProjectRow = {
  projectid: string;
  target: NDXProjectTarget;
  path: string;
  title: string;
};

export type NDXProjectInput = {
  target?: string;
  path: string;
  title?: string;
};
