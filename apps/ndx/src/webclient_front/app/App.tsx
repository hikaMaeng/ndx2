import React from "react";
import { getWebClientAppShellModel } from "ndx/webclient/front";
import { useWebClientBridge } from "./bridge/WebClientBridge";
import { MenuController, MenuPane } from "../menu/area/MenuController";
import { ModalLayer } from "../modal/ModalLayer";
import { MainSurface } from "../session/area/MainSurface";
import { LeftSidebarResizeHandle } from "./layout/LeftSidebarResizeHandle";
import { RSC } from "./resource";
import { useModel } from "../model/useModel";
import { Button } from "../components/ui";

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
  const appActions = React.useMemo(() => ({
    changeLanguage: () => app.changeLanguage(),
    closeSidebar: () => app.closeSidebar(),
    openSidebar: () => app.openSidebar(),
    saveState: (nextState: typeof clientState) => app.saveState(nextState),
    setClientState: (update: Parameters<typeof app.clientState.set>[0]) => app.clientState.set(update),
    setMetadata: (update: Parameters<typeof app.metadata.set>[0]) => app.metadata.set(update),
    setNotice: (update: Parameters<typeof app.notice.set>[0]) => app.notice.set(update),
    setSessionError: (update: Parameters<typeof app.sessionError.set>[0]) => app.sessionError.set(update),
    setSessionStatus: (update: Parameters<typeof app.sessionStatus.set>[0]) => app.sessionStatus.set(update),
    setStateSynced: (update: Parameters<typeof app.stateSynced.set>[0]) => app.stateSynced.set(update)
  }), [app]);

  React.useEffect(() => {
    stateRef.current = clientState;
    document.documentElement.lang = clientState.locale;
  }, [clientState]);

  React.useEffect(() => {
    app.loadCurrentTranslation(RSC.APP_METADATA_VERSION_FALLBACK_TEXT);
  }, [clientState.locale]);

  return (
    <div className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <MenuController bridge={bridge} clientid={app.clientid} clientState={clientState} metadata={metadata} saveState={appActions.saveState} setClientState={appActions.setClientState} setMetadata={appActions.setMetadata} setNotice={appActions.setNotice} setSessionError={appActions.setSessionError} setSessionStatus={appActions.setSessionStatus} setStateSynced={appActions.setStateSynced} stateRef={stateRef} t={t} onChangeLanguage={appActions.changeLanguage} onClose={appActions.closeSidebar}>
        <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
          <div className="hidden h-full shrink-0 md:block" style={{ width: leftSidebarWidth }}><MenuPane idSuffix="desktop" /></div>
          <LeftSidebarResizeHandle width={leftSidebarWidth} onWidthChange={(width) => app.leftSidebarWidth.set(width)} />
          {sidebarOpen ? <div className="fixed inset-0 z-30 md:hidden"><Button type="button" aria-label={t[RSC.APP_SHELL_MENU_CLOSE_BUTTON]} className="absolute inset-0 bg-black/60" onClick={() => app.closeSidebar()} /><div className="relative h-full w-72 max-w-[86vw]"><MenuPane idSuffix="mobile" /></div></div> : null}
          <MainSurface bridge={bridge} clientid={app.clientid} clientState={clientState} metadata={metadata} notice={notice} onOpenMenu={appActions.openSidebar} saveState={appActions.saveState} sessionError={sessionError} setNotice={appActions.setNotice} setSessionError={appActions.setSessionError} setStateSynced={appActions.setStateSynced} stateRef={stateRef} t={t} />
        </div>
      </MenuController>
      <ModalLayer bridge={bridge} />
    </div>
  );
}
