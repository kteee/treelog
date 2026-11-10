export interface TreeNode {
  id: string;
  title: string;
  parent: string | null;
  children: string[];
  /** 루트 바로 아래 항목에만 쓴다. 없으면 오른쪽이다. */
  side?: Side;
  /** 루트 바로 아래 항목에만 쓴다. BRANCH_COLORS의 순번이다. */
  color?: number;
  /** 사용자가 정한 항목 폭(px). 없으면 글 길이에 맞춘다. */
  width?: number;
  /** 하위 항목을 접어 두었는지. 하위 항목이 없으면 의미가 없다. */
  collapsed?: boolean;
  /** 제목이나 문서를 마지막으로 고친 시각(ms). 예전 데이터에는 없다. */
  updatedAt?: number;
}

export interface Topic {
  id: string;
  rootId: string;
  selectedId: string;
  /** 사이드바 그룹. 없으면 그룹 밖이다. */
  groupId?: string;
  /** 왼쪽 칸을 트리로 볼지 목록으로 볼지. 없으면 트리다. */
  view?: TopicView;
  /** 트리를 숨기고 문서를 화면 전체로 볼지. */
  docWide?: boolean;
  nodes: Record<string, TreeNode>;
}

export type Place = "before" | "after" | "inside";
export type Direction = "up" | "down" | "left" | "right";
export type Side = "left" | "right";
export type TopicView = "tree" | "outline";

export const BRANCH_COLORS = [
  "#e8705f",
  "#dd9a2b",
  "#4aa96c",
  "#2aa8a0",
  "#4b8fdc",
  "#8a77e8",
  "#d96aa3",
  "#7c8798",
];

const newId = () => crypto.randomUUID();

export function createTopic(title: string): Topic {
  const rootId = newId();
  return {
    id: newId(),
    rootId,
    selectedId: rootId,
    nodes: { [rootId]: { id: rootId, title, parent: null, children: [] } },
  };
}

function patch(topic: Topic, ...changed: TreeNode[]): Record<string, TreeNode> {
  const nodes = { ...topic.nodes };
  for (const node of changed) nodes[node.id] = node;
  return nodes;
}

/** 접힌 상위 항목을 펼쳐서 id가 보이게 한다. */
function reveal(topic: Topic, id: string): Topic {
  const opened: TreeNode[] = [];
  let parent = topic.nodes[id]?.parent;
  while (parent) {
    const node = topic.nodes[parent];
    if (node.collapsed) opened.push({ ...node, collapsed: false });
    parent = node.parent;
  }
  return opened.length ? { ...topic, nodes: patch(topic, ...opened) } : topic;
}

/** 링크나 하위 항목 목록으로 접힌 곳 안의 항목을 고르면 그 위를 펼친다. */
export function selectNode(topic: Topic, id: string): Topic {
  if (!topic.nodes[id]) return topic;
  const revealed = reveal(topic, id);
  if (revealed.selectedId === id) return revealed;
  return { ...revealed, selectedId: id };
}

/** 접거나 편다. 선택이 접히는 가지 안에 있으면 접는 항목으로 옮긴다. */
export function toggleCollapsed(topic: Topic, id: string): Topic {
  const node = topic.nodes[id];
  if (!node || node.children.length === 0 || !node.parent) return topic;
  const collapsed = !node.collapsed;
  const next = { ...topic, nodes: patch(topic, { ...node, collapsed }) };
  if (collapsed && topic.selectedId !== id && isInSubtree(topic, id, topic.selectedId)) {
    next.selectedId = id;
  }
  return next;
}

export function renameNode(topic: Topic, id: string, title: string): Topic {
  const node = topic.nodes[id];
  if (!node || node.title === title) return topic;
  return { ...topic, nodes: patch(topic, { ...node, title }) };
}

/** 제목이나 문서를 고친 시각을 남긴다. '모든 문서'의 최근 수정순 정렬에 쓴다. */
export function touchNode(topic: Topic, id: string, time: number): Topic {
  const node = topic.nodes[id];
  if (!node) return topic;
  return { ...topic, nodes: patch(topic, { ...node, updatedAt: time }) };
}

const NODE_MIN_WIDTH = 60;
const NODE_MAX_WIDTH = 640;

export function clampNodeWidth(width: number): number {
  return Math.round(Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, width)));
}

/** width를 비우면 글 길이에 맞추는 원래 폭으로 돌아간다. */
export function resizeNode(topic: Topic, id: string, width?: number): Topic {
  const node = topic.nodes[id];
  if (!node) return topic;
  const next = width === undefined ? undefined : clampNodeWidth(width);
  if (node.width === next) return topic;
  return { ...topic, nodes: patch(topic, { ...node, width: next }) };
}

/** 루트 바로 아래 항목이 어느 쪽에 있는지 돌려준다. */
export function childSide(node: TreeNode): Side {
  return node.side ?? "right";
}

/** 항목이 속한 쪽을 돌려준다. 루트는 어느 쪽에도 속하지 않는다. */
export function sideOf(topic: Topic, id: string): Side | null {
  let node = topic.nodes[id];
  if (!node.parent) return null;
  while (node.parent !== topic.rootId) node = topic.nodes[node.parent!];
  return childSide(node);
}

function lighterSide(topic: Topic): Side {
  const children = topic.nodes[topic.rootId].children.map((c) => topic.nodes[c]);
  const left = children.filter((c) => childSide(c) === "left").length;
  return left < children.length - left ? "left" : "right";
}

export function branchColor(topic: Topic, id: string): number {
  return (topic.nodes[id].color ?? 0) % BRANCH_COLORS.length;
}

/**
 * 색이 없거나 필요 이상으로 겹친 대주제에 남는 색을 나눠 준다.
 * 저장된 색은 순서가 바뀌어도 그대로여야 하므로 불러올 때 한 번만 맞춘다.
 */
export function assignBranchColors(topic: Topic): Topic {
  const children = topic.nodes[topic.rootId].children;
  const limit = Math.ceil(children.length / BRANCH_COLORS.length);
  const used = BRANCH_COLORS.map(() => 0);
  const pending: TreeNode[] = [];
  for (const id of children) {
    const node = topic.nodes[id];
    if (node.color !== undefined && used[node.color] < limit) used[node.color]++;
    else pending.push(node);
  }
  if (pending.length === 0) return topic;

  const changed = pending.map((node) => {
    const color = used.indexOf(Math.min(...used));
    used[color]++;
    return { ...node, color };
  });
  return { ...topic, nodes: patch(topic, ...changed) };
}

function nextColor(topic: Topic): number {
  const used = BRANCH_COLORS.map(() => 0);
  for (const c of topic.nodes[topic.rootId].children) used[branchColor(topic, c)]++;
  return used.indexOf(Math.min(...used));
}

/** 루트에 방향 없이 추가하면 항목이 적은 쪽으로 간다. */
export function addChild(
  topic: Topic,
  parentId: string,
  side?: Side,
): { topic: Topic; id: string } {
  const parent = topic.nodes[parentId];
  const id = newId();
  const child: TreeNode = { id, title: "", parent: parentId, children: [] };
  if (parentId === topic.rootId) {
    child.side = side ?? lighterSide(topic);
    child.color = nextColor(topic);
  }
  // 접힌 항목에 하위를 더하면 새 항목이 보이도록 편다.
  const updated = { ...parent, children: [...parent.children, id], collapsed: false };
  return { topic: { ...topic, selectedId: id, nodes: patch(topic, updated, child) }, id };
}

/** 루트에는 형제를 둘 수 없으므로 자식으로 추가한다. */
export function addSibling(topic: Topic, nodeId: string): { topic: Topic; id: string } {
  const node = topic.nodes[nodeId];
  if (!node.parent) return addChild(topic, nodeId);
  const parent = topic.nodes[node.parent];
  const id = newId();
  const sibling: TreeNode = { id, title: "", parent: parent.id, children: [] };
  if (parent.id === topic.rootId) {
    sibling.side = childSide(node);
    sibling.color = nextColor(topic);
  }
  const children = [...parent.children];
  children.splice(children.indexOf(nodeId) + 1, 0, id);
  return {
    topic: { ...topic, selectedId: id, nodes: patch(topic, { ...parent, children }, sibling) },
    id,
  };
}

export function isInSubtree(topic: Topic, ancestorId: string, id: string): boolean {
  let current: string | null = id;
  while (current) {
    if (current === ancestorId) return true;
    current = topic.nodes[current]?.parent ?? null;
  }
  return false;
}

export function removeNode(topic: Topic, id: string): Topic {
  const node = topic.nodes[id];
  if (!node?.parent) return topic;
  const parent = topic.nodes[node.parent];
  const index = parent.children.indexOf(id);
  const children = parent.children.filter((c) => c !== id);

  const nodes = patch(topic, { ...parent, children });
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    stack.push(...topic.nodes[current].children);
    delete nodes[current];
  }

  const selectedId = isInSubtree(topic, id, topic.selectedId)
    ? (children[index] ?? children[index - 1] ?? parent.id)
    : topic.selectedId;
  return { ...topic, nodes, selectedId };
}

export function canMove(topic: Topic, id: string, targetId: string, place: Place): boolean {
  const node = topic.nodes[id];
  const target = topic.nodes[targetId];
  if (!node?.parent || !target) return false;
  if (isInSubtree(topic, id, targetId)) return false;
  if (place !== "inside" && !target.parent) return false;
  return true;
}

export function moveNode(
  topic: Topic,
  id: string,
  targetId: string,
  place: Place,
  side?: Side,
): Topic {
  if (!canMove(topic, id, targetId, place)) return topic;
  const node = topic.nodes[id];
  const oldParent = topic.nodes[node.parent!];
  const newParentId = place === "inside" ? targetId : topic.nodes[targetId].parent!;
  const newSide =
    newParentId !== topic.rootId
      ? undefined
      : place !== "inside"
        ? childSide(topic.nodes[targetId])
        : (side ?? (node.parent === topic.rootId ? childSide(node) : lighterSide(topic)));

  const newColor =
    newParentId !== topic.rootId
      ? undefined
      : node.parent === topic.rootId
        ? branchColor(topic, id)
        : nextColor(topic);

  const nodes = { ...topic.nodes };
  nodes[oldParent.id] = { ...oldParent, children: oldParent.children.filter((c) => c !== id) };

  const newParent = nodes[newParentId];
  const children = [...newParent.children];
  if (place === "inside") {
    children.push(id);
  } else {
    const at = children.indexOf(targetId);
    children.splice(place === "before" ? at : at + 1, 0, id);
  }
  // 접힌 항목 안으로 옮기면 옮긴 항목이 보이도록 편다.
  nodes[newParentId] = {
    ...newParent,
    children,
    collapsed: place === "inside" ? false : newParent.collapsed,
  };
  nodes[id] = { ...node, parent: newParentId, side: newSide, color: newColor };
  return { ...topic, nodes };
}

function pathOf(topic: Topic, id: string): TreeNode[] {
  const path: TreeNode[] = [];
  let current: TreeNode | undefined = topic.nodes[id];
  while (current) {
    path.unshift(current);
    current = current.parent ? topic.nodes[current.parent] : undefined;
  }
  return path;
}

function nodesAtDepth(topic: Topic, depth: number): string[] {
  const result: string[] = [];
  const walk = (id: string, d: number) => {
    if (d === depth) {
      result.push(id);
      return;
    }
    if (!topic.nodes[id].collapsed) topic.nodes[id].children.forEach((c) => walk(c, d + 1));
  };
  walk(topic.rootId, 0);
  return result;
}

/** 목록형 보기에서 위에서 아래로 놓인 순서. visibleOnly면 접힌 항목의 하위는 뺀다. */
export function outlineOrder(topic: Topic, visibleOnly = false): string[] {
  const order: string[] = [];
  const walk = (id: string) => {
    order.push(id);
    if (visibleOnly && topic.nodes[id].collapsed) return;
    topic.nodes[id].children.forEach(walk);
  };
  walk(topic.rootId);
  return order;
}

/** 목록형 보기의 방향키 이동. 위아래는 보이는 순서, 왼쪽은 상위, 오른쪽은 첫 하위다. */
export function outlineNeighbor(topic: Topic, id: string, direction: Direction): string {
  const node = topic.nodes[id];
  if (direction === "left") return node.parent ?? id;
  if (direction === "right") return node.collapsed ? id : (node.children[0] ?? id);
  const order = outlineOrder(topic, true);
  const at = order.indexOf(id);
  return order[at + (direction === "up" ? -1 : 1)] ?? id;
}

/** 화면에서 본 방향으로 움직인다. 위아래는 같은 쪽의 같은 깊이 항목끼리 이동한다. */
export function neighbor(topic: Topic, id: string, direction: Direction): string {
  const node = topic.nodes[id];
  const side = sideOf(topic, id);
  if (direction === "left" || direction === "right") {
    if (!side) {
      return node.children.find((c) => childSide(topic.nodes[c]) === direction) ?? id;
    }
    if (direction !== side) return node.parent!;
    return node.collapsed ? id : (node.children[0] ?? id);
  }
  const row = nodesAtDepth(topic, pathOf(topic, id).length - 1).filter(
    (n) => sideOf(topic, n) === side,
  );
  const at = row.indexOf(id);
  return row[at + (direction === "up" ? -1 : 1)] ?? id;
}
