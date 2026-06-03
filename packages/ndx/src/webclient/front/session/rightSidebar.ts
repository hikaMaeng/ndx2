import type { NDXSidebarItem } from "ndx/common/protocol";

export type RightSidebarGroup = {
  id: string;
  title: string;
  items: NDXSidebarItem[];
  subgroups: Array<{
    id: string;
    title: string;
    items: NDXSidebarItem[];
  }>;
};

export function upsertRightSidebarItem(items: NDXSidebarItem[], item: NDXSidebarItem): NDXSidebarItem[] {
  const key = rightSidebarItemIdentity(item);
  return [
    ...items.filter((current) => rightSidebarItemIdentity(current) !== key),
    { ...item, key: item.key?.trim() || rightSidebarItemFallbackKey(item) }
  ];
}

export function groupRightSidebarItems(items: NDXSidebarItem[]): RightSidebarGroup[] {
  return items.reduce<RightSidebarGroup[]>((groups, item) => {
    let group = groups.find((candidate) => candidate.id === item.group.id);
    if (!group) {
      group = { id: item.group.id, title: item.group.title, items: [], subgroups: [] };
      groups.push(group);
    }
    if (!item.subgroup) {
      group.items.push(item);
      return groups;
    }
    let subgroup = group.subgroups.find((candidate) => candidate.id === item.subgroup?.id);
    if (!subgroup) {
      subgroup = { id: item.subgroup.id, title: item.subgroup.title, items: [] };
      group.subgroups.push(subgroup);
    }
    subgroup.items.push(item);
    return groups;
  }, []);
}

function rightSidebarItemIdentity(item: NDXSidebarItem): string {
  return item.key?.trim()
    ? `${item.group.id}\0${item.key.trim()}`
    : `${item.group.id}\0${item.subgroup?.id ?? ""}\0${rightSidebarItemFallbackKey(item)}`;
}

function rightSidebarItemFallbackKey(item: NDXSidebarItem): string {
  return `${item.kind ?? "item"}:${item.title}:${item.body ?? ""}`;
}
