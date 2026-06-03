export const NDX_TURNCARD_SKILL = "${TURNCARD_SKILL}";
export const NDX_TURNCARD_ARTIFACT = "${TURNCARD_ARTIFACT}";
export const NDX_SIDEBAR_ITEM = "${SIDEBAR_ITEM}";

export type NDXSidebarItem = {
  group: {
    id: string;
    title: string;
  };
  subgroup?: {
    id: string;
    title: string;
  };
  key?: string;
  title: string;
  body?: string;
  kind?: string;
};

export type NDXTurnCardSkillItem = {
  type: "skill";
  name: string;
  path?: string;
  source?: string;
};

export type NDXTurnCardArtifactItem = {
  type: "artifact";
  title: string;
  path: string;
  artifactType?: string;
};

export type NDXTurnCardItem = NDXTurnCardSkillItem | NDXTurnCardArtifactItem;

export function parseNDXSidebarItem(message: string, data: unknown): NDXSidebarItem | undefined {
  if (message.startsWith(NDX_SIDEBAR_ITEM)) {
    return parseSidebarItemPayload(data);
  }

  const turnCard = parseNDXTurnCardItem(message, data);
  if (!turnCard) return undefined;
  if (turnCard.type === "skill") {
    return {
      group: { id: "skills", title: "스킬" },
      key: `${turnCard.type}:${turnCard.name}:${turnCard.path ?? ""}`,
      title: turnCard.name,
      body: turnCard.path,
      kind: "skill"
    };
  }
  return {
    group: { id: "artifacts", title: "파일" },
    key: `${turnCard.type}:${turnCard.path}`,
    title: turnCard.title,
    body: turnCard.path,
    kind: turnCard.artifactType ?? "artifact"
  };
}

export function parseNDXTurnCardItem(message: string, data: unknown): NDXTurnCardItem | undefined {
  if ((!message.startsWith(NDX_TURNCARD_SKILL) && !message.startsWith(NDX_TURNCARD_ARTIFACT)) || !data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const payload = data as { turnCard?: unknown };
  if (!payload.turnCard || typeof payload.turnCard !== "object" || Array.isArray(payload.turnCard)) {
    return undefined;
  }

  const item = payload.turnCard as { type?: unknown; name?: unknown; title?: unknown; path?: unknown; source?: unknown; artifactType?: unknown };
  if (item.type === "skill" && typeof item.name === "string" && item.name.trim().length > 0) {
    return {
      type: "skill",
      name: item.name,
      ...(typeof item.path === "string" && item.path.trim().length > 0 ? { path: item.path } : {}),
      ...(typeof item.source === "string" && item.source.trim().length > 0 ? { source: item.source } : {})
    };
  }

  if (item.type === "artifact" && typeof item.path === "string" && item.path.trim().length > 0) {
    return {
      type: "artifact",
      title: typeof item.title === "string" && item.title.trim().length > 0 ? item.title : item.path.split(/[\\/]/).pop() || item.path,
      path: item.path,
      ...(typeof item.artifactType === "string" && item.artifactType.trim().length > 0 ? { artifactType: item.artifactType } : {})
    };
  }

  return undefined;
}

function parseSidebarItemPayload(data: unknown): NDXSidebarItem | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const payload = data as { sidebarItem?: unknown };
  if (!payload.sidebarItem || typeof payload.sidebarItem !== "object" || Array.isArray(payload.sidebarItem)) return undefined;

  const item = payload.sidebarItem as {
    group?: unknown;
    subgroup?: unknown;
    groupId?: unknown;
    groupTitle?: unknown;
    category?: unknown;
    cardGroup?: unknown;
    key?: unknown;
    title?: unknown;
    body?: unknown;
    kind?: unknown;
  };
  const group = item.group && typeof item.group === "object" && !Array.isArray(item.group)
    ? item.group as { id?: unknown; title?: unknown }
    : undefined;
  const subgroup = item.subgroup && typeof item.subgroup === "object" && !Array.isArray(item.subgroup)
    ? item.subgroup as { id?: unknown; title?: unknown }
    : undefined;
  const groupId = typeof group?.id === "string" && group.id.trim().length > 0
    ? group.id
    : typeof item.group === "string" && item.group.trim().length > 0
      ? item.group
      : typeof item.groupId === "string" && item.groupId.trim().length > 0
        ? item.groupId
        : typeof item.category === "string" && item.category.trim().length > 0
          ? item.category
          : typeof item.cardGroup === "string" && item.cardGroup.trim().length > 0
            ? item.cardGroup
            : undefined;
  const title = typeof item.title === "string" && item.title.trim().length > 0 ? item.title : undefined;
  if (!groupId || !title) return undefined;
  const groupTitle = typeof group?.title === "string" && group.title.trim().length > 0
    ? group.title
    : typeof item.groupTitle === "string" && item.groupTitle.trim().length > 0
      ? item.groupTitle
      : groupId;
  return {
    group: { id: groupId, title: groupTitle },
    ...(typeof subgroup?.id === "string" && subgroup.id.trim().length > 0 && typeof subgroup.title === "string" && subgroup.title.trim().length > 0
      ? { subgroup: { id: subgroup.id.trim(), title: subgroup.title.trim() } }
      : {}),
    ...(typeof item.key === "string" && item.key.trim().length > 0 ? { key: item.key } : {}),
    title,
    ...(typeof item.body === "string" && item.body.trim().length > 0 ? { body: item.body } : {}),
    ...(typeof item.kind === "string" && item.kind.trim().length > 0 ? { kind: item.kind } : {})
  };
}
