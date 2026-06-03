import React from "react";
import { normalizeWebClientState, webclientDomain, type NDXAgentWebMetadataResponse, type NDXWebClientStateDocument } from "ndx/webclient/common";
import { cacheClientState, loadTranslation, putWebClientState, readCachedState, readOrCreateClientId, type SocketState, type Translation } from "ndx/webclient/front";
import { useWebClientBridge } from "./bridge/WebClientBridge";
import { MenuController, MenuPane } from "../menu/area/MenuController";
import { ModalLayer } from "../modal/ModalLayer";
import { MainSurface } from "../session/area/MainSurface";
import { LeftSidebarResizeHandle } from "./layout/LeftSidebarResizeHandle";
import { RSC } from "./resource";
import { DocumentSite } from "../documents/DocumentSite";

export function App() {
  if (window.location.pathname.startsWith("/docs")) {
    return <DocumentSite />;
  }

  const [clientid] = React.useState(readOrCreateClientId);
  const bridge = useWebClientBridge();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = React.useState(288);
  const [clientState, setClientState] = React.useState<NDXWebClientStateDocument>(() => readCachedState());
  const [metadata, setMetadata] = React.useState<Partial<NDXAgentWebMetadataResponse>>({ version: "", surface: webclientDomain.surface });
  const [, setSessionStatus] = React.useState<SocketState>("checking");
  const [, setStateSynced] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [sessionError, setSessionError] = React.useState("");
  const [translation, setTranslation] = React.useState<Translation | null>(null);
  const stateRef = React.useRef(clientState);
  const t = translation ?? {};

  const saveState = (nextState: NDXWebClientStateDocument) => {
    const normalized = normalizeWebClientState(nextState);
    stateRef.current = normalized;
    setClientState(normalized);
    cacheClientState(normalized);
    void putWebClientState(clientid, normalized).then(() => setStateSynced(true)).catch(() => setStateSynced(false));
  };

  React.useEffect(() => {
    stateRef.current = clientState; document.documentElement.lang = clientState.locale; cacheClientState(clientState);
  }, [clientState]);

  React.useEffect(() => {
    let cancelled = false;
    void loadTranslation(clientState.locale).then((nextTranslation) => {
      if (cancelled) return;
      setTranslation(nextTranslation);
      setMetadata((current) => ({ ...current, version: current.version || nextTranslation[RSC.APP_METADATA_VERSION_FALLBACK_TEXT], surface: current.surface || webclientDomain.surface }));
    });
    return () => { cancelled = true; };
  }, [clientState.locale]);

  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);
  const changeLanguage = () => saveState({ ...stateRef.current, locale: stateRef.current.locale === "ko" ? "en" : "ko" });

  return (
    <div className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <MenuController bridge={bridge} clientid={clientid} clientState={clientState} metadata={metadata} saveState={saveState} setClientState={setClientState} setMetadata={setMetadata} setNotice={setNotice} setSessionError={setSessionError} setSessionStatus={setSessionStatus} setStateSynced={setStateSynced} stateRef={stateRef} t={t} onChangeLanguage={changeLanguage} onClose={closeSidebar}>
        <div className="flex h-full min-h-0">
          <div className="hidden h-full shrink-0 md:block" style={{ width: leftSidebarWidth }}><MenuPane idSuffix="desktop" /></div>
          <LeftSidebarResizeHandle width={leftSidebarWidth} onWidthChange={setLeftSidebarWidth} />
          {sidebarOpen ? <div className="fixed inset-0 z-30 md:hidden"><button type="button" aria-label={t[RSC.APP_SHELL_MENU_CLOSE_BUTTON]} className="absolute inset-0 bg-black/60" onClick={closeSidebar} /><div className="relative h-full w-72 max-w-[86vw]"><MenuPane idSuffix="mobile" /></div></div> : null}
          <MainSurface bridge={bridge} clientid={clientid} clientState={clientState} metadata={metadata} notice={notice} onOpenMenu={openSidebar} saveState={saveState} sessionError={sessionError} setNotice={setNotice} setSessionError={setSessionError} setStateSynced={setStateSynced} stateRef={stateRef} t={t} />
        </div>
      </MenuController>
      <ModalLayer bridge={bridge} />
    </div>
  );
}
