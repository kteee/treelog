import { clear, createStore, del, get, keys, set, setMany, entries } from "idb-keyval";
import type { Workspace } from "../model/workspace";
import { READ_ONLY } from "../config";

export type { Workspace };

export interface Backup {
  app: "logic-note";
  version: 1;
  workspace: Workspace;
  docs: Record<string, unknown[]>;
}

// 이름을 트리로그로 바꿨지만 저장소 이름과 백업 표시는 그대로 둔다.
// 바꾸면 이미 저장된 노트와 예전 백업 파일을 읽을 수 없게 된다.
const store = createStore("logic-note", "kv");
const WORKSPACE_KEY = "workspace";
const DOC_PREFIX = "doc:";

/** 공개 빌드에서 읽어 온 노트. 문서도 여기서 꺼낸다. */
let published: Backup | null = null;

/** 공개 빌드는 배포에 함께 올린 백업 파일(public/notes.json)을 읽는다. */
export async function loadPublished(): Promise<Backup> {
  const res = await fetch(`${import.meta.env.BASE_URL}notes.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`notes.json ${res.status}`);
  const data: unknown = await res.json();
  if (!isBackup(data)) throw new Error("notes.json is not a backup");
  published = data;
  return data;
}

export const loadWorkspace = () => get<Workspace>(WORKSPACE_KEY, store);
export const saveWorkspace = (workspace: Workspace) => set(WORKSPACE_KEY, workspace, store);
export const loadDoc = (nodeId: string) =>
  READ_ONLY ? Promise.resolve(published?.docs[nodeId]) : get<unknown[]>(DOC_PREFIX + nodeId, store);
export const saveDoc = (nodeId: string, blocks: unknown[]) =>
  set(DOC_PREFIX + nodeId, blocks, store);

/** 검색에 쓰려고 모든 문서를 항목 id별로 읽는다. */
export async function loadAllDocs(): Promise<Record<string, unknown[]>> {
  if (READ_ONLY) return published?.docs ?? {};
  const docs: Record<string, unknown[]> = {};
  for (const [key, value] of await entries<string, unknown[]>(store)) {
    if (key.startsWith(DOC_PREFIX)) docs[key.slice(DOC_PREFIX.length)] = value;
  }
  return docs;
}

/**
 * 트리에서 지워진 항목의 문서를 정리한다.
 * 실행 취소로 되살릴 수 있도록 삭제 시점이 아니라 다음 시작 때 호출한다.
 */
export async function removeOrphanDocs(workspace: Workspace) {
  const live = new Set(workspace.topics.flatMap((t) => Object.keys(t.nodes)));
  const all = await keys<string>(store);
  await Promise.all(
    all
      .filter((k) => k.startsWith(DOC_PREFIX) && !live.has(k.slice(DOC_PREFIX.length)))
      .map((k) => del(k, store)),
  );
}

export async function createBackup(workspace: Workspace): Promise<Backup> {
  const live = new Set(workspace.topics.flatMap((t) => Object.keys(t.nodes)));
  const docs: Backup["docs"] = {};
  for (const [key, value] of await entries<string, unknown[]>(store)) {
    if (!key.startsWith(DOC_PREFIX)) continue;
    const id = key.slice(DOC_PREFIX.length);
    if (live.has(id)) docs[id] = value;
  }
  return { app: "logic-note", version: 1, workspace, docs };
}

export function isBackup(value: unknown): value is Backup {
  const b = value as Backup | null;
  return (
    b?.app === "logic-note" &&
    Array.isArray(b.workspace?.topics) &&
    b.workspace.topics.length > 0 &&
    b.workspace.topics.every((t) => t.nodes?.[t.rootId] && t.nodes[t.selectedId]) &&
    typeof b.docs === "object"
  );
}

export async function restoreBackup(backup: Backup) {
  await clear(store);
  await setMany(
    [
      [WORKSPACE_KEY, backup.workspace],
      ...Object.entries(backup.docs).map(([id, doc]) => [DOC_PREFIX + id, doc] as [string, unknown[]]),
    ],
    store,
  );
}
