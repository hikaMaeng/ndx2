import { normalizeWebClientState, webclientDomain, type NDXAgentWebMetadataResponse, type NDXWebClientStateDocument } from "ndx/webclient/common";
import { SliceModel } from "../model/SliceModel.js";
import { cacheClientState, readCachedState, readOrCreateClientId } from "../storage/clientStateCache.js";
import { loadTranslation, type Translation } from "../i18n/translation.js";
import { putWebClientState } from "../api/app.js";
import type { SocketState } from "./socketState.js";

export class WebClientAppShellModel {
  readonly clientid = readOrCreateClientId();
  readonly sidebarOpen = new SliceModel(false);
  readonly leftSidebarWidth = new SliceModel(288);
  readonly clientState = new SliceModel<NDXWebClientStateDocument>(readCachedState());
  readonly metadata = new SliceModel<Partial<NDXAgentWebMetadataResponse>>({ version: "", surface: webclientDomain.surface });
  readonly sessionStatus = new SliceModel<SocketState>("checking");
  readonly stateSynced = new SliceModel(false);
  readonly notice = new SliceModel("");
  readonly sessionError = new SliceModel("");
  readonly translation = new SliceModel<Translation | null>(null);
  #translationLocale = "";

  constructor() {
    cacheClientState(this.clientState.value);
  }

  saveState(nextState: NDXWebClientStateDocument): void {
    const normalized = normalizeWebClientState(nextState);
    this.clientState.set(normalized);
    cacheClientState(normalized);
    void putWebClientState(this.clientid, normalized)
      .then(() => this.stateSynced.set(true))
      .catch(() => this.stateSynced.set(false));
  }

  changeLanguage(): void {
    this.saveState({
      ...this.clientState.value,
      locale: this.clientState.value.locale === "ko" ? "en" : "ko"
    });
  }

  loadCurrentTranslation(defaultVersionText: string): void {
    const locale = this.clientState.value.locale;
    if (this.#translationLocale === locale && this.translation.value) return;
    this.#translationLocale = locale;
    void loadTranslation(locale).then((nextTranslation) => {
      if (this.#translationLocale !== locale) return;
      this.translation.set(nextTranslation);
      this.metadata.set((current) => ({
        ...current,
        version: current.version || nextTranslation[defaultVersionText] || current.version,
        surface: current.surface || webclientDomain.surface
      }));
    });
  }

  openSidebar(): void {
    this.sidebarOpen.set(true);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  clearSessionError(): void {
    this.sessionError.set("");
  }
}

let appShellModel: WebClientAppShellModel | undefined;

export function getWebClientAppShellModel(): WebClientAppShellModel {
  appShellModel ??= new WebClientAppShellModel();
  return appShellModel;
}
