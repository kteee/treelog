import type { Topic } from "./tree";

/** 사이드바에서 주제를 묶는 한 단계짜리 그룹. 배열 순서가 화면 순서다. */
export interface Group {
  id: string;
  name: string;
  collapsed?: boolean;
}

export interface Workspace {
  /** 그룹 안의 주제 순서는 이 배열에서의 순서를 따른다. */
  topics: Topic[];
  groups: Group[];
  /** 그룹이 있을 때 보이는 '그룹 없음' 칸을 접었는지. */
  ungroupedCollapsed?: boolean;
  activeId: string;
}

const groupOf = (topic: Topic) => topic.groupId ?? null;

export function topicsIn(workspace: Workspace, groupId: string | null): Topic[] {
  return workspace.topics.filter((t) => groupOf(t) === groupId);
}

/** 그룹이 없던 예전 데이터와 사라진 그룹을 가리키는 주제를 바로잡는다. */
export function normalizeGroups(workspace: Workspace): Workspace {
  const groups = workspace.groups ?? [];
  const known = new Set(groups.map((g) => g.id));
  return {
    ...workspace,
    groups,
    topics: workspace.topics.map((t) =>
      t.groupId && !known.has(t.groupId) ? { ...t, groupId: undefined } : t,
    ),
  };
}

export function addGroup(workspace: Workspace): { workspace: Workspace; id: string } {
  const id = crypto.randomUUID();
  return { workspace: { ...workspace, groups: [...workspace.groups, { id, name: "" }] }, id };
}

function patchGroup(workspace: Workspace, id: string, change: Partial<Group>): Workspace {
  return {
    ...workspace,
    groups: workspace.groups.map((g) => (g.id === id ? { ...g, ...change } : g)),
  };
}

export function renameGroup(workspace: Workspace, id: string, name: string): Workspace {
  return patchGroup(workspace, id, { name });
}

export function setGroupCollapsed(workspace: Workspace, id: string, collapsed: boolean): Workspace {
  return patchGroup(workspace, id, { collapsed });
}

/** 그룹만 지우고 안의 주제는 그룹 밖으로 꺼낸다. */
export function removeGroup(workspace: Workspace, id: string): Workspace {
  return {
    ...workspace,
    groups: workspace.groups.filter((g) => g.id !== id),
    topics: workspace.topics.map((t) => (t.groupId === id ? { ...t, groupId: undefined } : t)),
  };
}

/**
 * 주제를 groupId 그룹의 beforeId 주제 앞으로 옮긴다.
 * beforeId가 없으면 그 그룹의 맨 끝으로 간다. groupId가 null이면 그룹 밖이다.
 */
export function moveTopic(
  workspace: Workspace,
  topicId: string,
  groupId: string | null,
  beforeId: string | null,
): Workspace {
  const topic = workspace.topics.find((t) => t.id === topicId);
  if (!topic || beforeId === topicId) return workspace;
  const rest = workspace.topics.filter((t) => t.id !== topicId);
  let at = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1;
  if (at < 0) {
    let last = -1;
    rest.forEach((t, i) => {
      if (groupOf(t) === groupId) last = i;
    });
    at = last < 0 ? rest.length : last + 1;
  }
  rest.splice(at, 0, { ...topic, groupId: groupId ?? undefined });
  return { ...workspace, topics: rest };
}

/** 그룹을 beforeId 그룹 앞으로 옮긴다. beforeId가 없으면 맨 끝으로 간다. */
export function moveGroup(workspace: Workspace, id: string, beforeId: string | null): Workspace {
  const group = workspace.groups.find((g) => g.id === id);
  if (!group || beforeId === id) return workspace;
  const rest = workspace.groups.filter((g) => g.id !== id);
  const at = beforeId ? rest.findIndex((g) => g.id === beforeId) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, group);
  return { ...workspace, groups: rest };
}
