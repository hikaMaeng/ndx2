import { useSyncExternalStore } from "react";
import type { Emitter } from "ndx/webclient/front";

export function useModel<T extends Emitter>(model: T): T {
  useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
  return model;
}
