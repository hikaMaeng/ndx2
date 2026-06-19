import type { NDXAgentModelFolderPatchDraftResponse } from "ndx/webclient/common";
import { SliceModel } from "../model/SliceModel.js";
import type { ModelUpdate } from "../model/SliceModel.js";

export type SettingsTab = "modelCatalog" | "modelPatch" | "embedding" | "runtime" | "tools" | "hooks" | "selfcheck" | "websearch" | "other";

export type LocalFileHandleModel = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }>;
};

export type LocalDirectoryHandleModel = {
  name: string;
  values: () => AsyncIterable<LocalFileHandleModel | { name: string; kind?: string }>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<LocalFileHandleModel>;
  removeEntry?: (name: string) => Promise<void>;
  queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

export type LocalFolderSnapshotModel = {
  name: string;
  ggufFiles: string[];
  existingModelYaml?: string;
};

export class SettingsSurfaceModel {
  readonly activeTab = new SliceModel<SettingsTab>("modelCatalog");
  readonly modelFolder = new SliceModel<LocalFolderSnapshotModel | undefined>(undefined);
  readonly targetFolderName = new SliceModel("");
  readonly targetHandle = new SliceModel<LocalDirectoryHandleModel | undefined>(undefined);
  readonly publisher = new SliceModel("local");
  readonly baseModelKey = new SliceModel("");
  readonly aliasModelKey = new SliceModel("");
  readonly template = new SliceModel("");
  readonly draft = new SliceModel<NDXAgentModelFolderPatchDraftResponse | undefined>(undefined);
  readonly pending = new SliceModel<"model" | "target" | "draft" | "write" | "restore" | "">("");
  readonly error = new SliceModel("");
  readonly message = new SliceModel("");

  resetStatus(): void {
    this.error.set("");
    this.message.set("");
  }
}

let settingsSurfaceModel: SettingsSurfaceModel | undefined;
const settingsSlices = new Map<string, SliceModel<unknown>>();

export function getSettingsSurfaceModel(): SettingsSurfaceModel {
  settingsSurfaceModel ??= new SettingsSurfaceModel();
  return settingsSurfaceModel;
}

export function getSettingsSlice<T>(key: string, initial: T): SliceModel<T> {
  let slice = settingsSlices.get(key) as SliceModel<T> | undefined;
  if (!slice) {
    slice = new SliceModel<T>(initial);
    settingsSlices.set(key, slice as SliceModel<unknown>);
  }
  return slice;
}

export type SettingsStateSetter<T> = (update: ModelUpdate<T>) => void;
