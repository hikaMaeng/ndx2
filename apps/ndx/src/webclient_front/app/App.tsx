import React from "react";
import { getWebClientAppShellModel } from "ndx/webclient/front";
import { useWebClientBridge } from "./bridge/WebClientBridge";
import { MenuController, MenuPane } from "../menu/area/MenuController";
import { ModalLayer } from "../modal/ModalLayer";
import { MainSurface } from "../session/area/MainSurface";
import { LeftSidebarResizeHandle } from "./layout/LeftSidebarResizeHandle";
import { RSC } from "./resource";
import { useModel } from "../model/useModel";

export function App() {
  const app = getWebClientAppShellModel();
  const bridge = useWebClientBridge();
  const sidebarOpen = useModel(app.sidebarOpen).value;
  const leftSidebarWidth = useModel(app.leftSidebarWidth).value;
  const clientState = useModel(app.clientState).value;
  const metadata = useModel(app.metadata).value;
  const notice = useModel(app.notice).value;
  const sessionError = useModel(app.sessionError).value;
  const translation = useModel(app.translation).value;
  const stateRef = React.useRef(clientState);
  const t = translation ?? {};

  React.useEffect(() => {
    stateRef.current = clientState;
    document.documentElement.lang = clientState.locale;
  }, [clientState]);

  React.useEffect(() => {
    app.loadCurrentTranslation(RSC.APP_METADATA_VERSION_FALLBACK_TEXT);
  }, [clientState.locale]);

  return (
    <div className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <MenuController bridge={bridge} clientid={app.clientid} clientState={clientState} metadata={metadata} saveState={(nextState) => app.saveState(nextState)} setClientState={(update) => app.clientState.set(update)} setMetadata={(update) => app.metadata.set(update)} setNotice={(update) => app.notice.set(update)} setSessionError={(update) => app.sessionError.set(update)} setSessionStatus={(update) => app.sessionStatus.set(update)} setStateSynced={(update) => app.stateSynced.set(update)} stateRef={stateRef} t={t} onChangeLanguage={() => app.changeLanguage()} onClose={() => app.closeSidebar()}>
        <div className="flex h-full min-h-0">
          <div className="hidden h-full shrink-0 md:block" style={{ width: leftSidebarWidth }}><MenuPane idSuffix="desktop" /></div>
          <LeftSidebarResizeHandle width={leftSidebarWidth} onWidthChange={(width) => app.leftSidebarWidth.set(width)} />
          {sidebarOpen ? <div className="fixed inset-0 z-30 md:hidden"><button type="button" aria-label={t[RSC.APP_SHELL_MENU_CLOSE_BUTTON]} className="absolute inset-0 bg-black/60" onClick={() => app.closeSidebar()} /><div className="relative h-full w-72 max-w-[86vw]"><MenuPane idSuffix="mobile" /></div></div> : null}
          <MainSurface bridge={bridge} clientid={app.clientid} clientState={clientState} metadata={metadata} notice={notice} onOpenMenu={() => app.openSidebar()} saveState={(nextState) => app.saveState(nextState)} sessionError={sessionError} setNotice={(update) => app.notice.set(update)} setSessionError={(update) => app.sessionError.set(update)} setStateSynced={(update) => app.stateSynced.set(update)} stateRef={stateRef} t={t} />
        </div>
      </MenuController>
      <ModalLayer bridge={bridge} />
    </div>
  );
}
