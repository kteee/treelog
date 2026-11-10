import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as tree from "../model/tree";
import type { Place, Side, Topic, TopicView } from "../model/tree";
import * as groups from "../model/workspace";
import { READ_ONLY } from "../config";
import {
  createBackup,
  isBackup,
  loadPublished,
  loadWorkspace,
  removeOrphanDocs,
  restoreBackup,
  saveWorkspace,
  type Workspace,
} from "./db";

const HISTORY_LIMIT = 100;
const SAVE_DELAY = 250;

function firstWorkspace(): Workspace {
  const topic = tree.createTopic("새 주제");
  return { topics: [topic], groups: [], activeId: topic.id };
}

export function useWorkspace(onSaveError: () => void) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const current = useRef<Workspace | null>(null);
  const history = useRef(new Map<string, Topic[]>());
  const lastHistoryKey = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const frozen = useRef(false);
  const onError = useRef(onSaveError);
  onError.current = onSaveError;

  const [loadFailed, setLoadFailed] = useState(false);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    // 공개 빌드는 방문자 브라우저에 아무것도 저장하지 않는다.
    if (READ_ONLY) return;
    if (!dirty.current || frozen.current || !current.current) return;
    dirty.current = false;
    saveWorkspace(current.current).catch(() => {
      dirty.current = true;
      onError.current();
    });
  }, []);

  const commit = useCallback(
    (next: Workspace) => {
      current.current = next;
      setWorkspace(next);
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    let cancelled = false;
    if (READ_ONLY) {
      loadPublished()
        .then((backup) => {
          if (cancelled) return;
          const w = backup.workspace;
          const initial = groups.normalizeGroups({ ...w, topics: w.topics.map(tree.assignBranchColors) });
          current.current = initial;
          setWorkspace(initial);
        })
        .catch(() => setLoadFailed(true));
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const saved = await loadWorkspace();
      if (cancelled) return;
      const initial = saved
        ? groups.normalizeGroups({ ...saved, topics: saved.topics.map(tree.assignBranchColors) })
        : firstWorkspace();
      current.current = initial;
      setWorkspace(initial);
      if (saved) await removeOrphanDocs(saved);
      else await saveWorkspace(initial);
      // 저장 공간이 부족해질 때 브라우저가 노트를 지우지 못하게 요청한다.
      navigator.storage?.persist?.();
    })().catch(() => onError.current());
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  const actions = useMemo(() => {
    const active = () => {
      const w = current.current!;
      return w.topics.find((t) => t.id === w.activeId)!;
    };

    const patchActive = (change: Partial<Topic>) => {
      const w = current.current!;
      commit({ ...w, topics: w.topics.map((t) => (t.id === w.activeId ? { ...t, ...change } : t)) });
    };

    const apply = (next: Topic, historyKey?: string | false) => {
      const before = active();
      if (next === before) return;
      if (historyKey !== false && (historyKey === undefined || historyKey !== lastHistoryKey.current)) {
        const stack = history.current.get(before.id) ?? [];
        stack.push(before);
        if (stack.length > HISTORY_LIMIT) stack.shift();
        history.current.set(before.id, stack);
      }
      if (historyKey !== false) lastHistoryKey.current = historyKey ?? null;
      const w = current.current!;
      commit({ ...w, topics: w.topics.map((t) => (t.id === before.id ? next : t)) });
    };

    return {
      select: (id: string) => apply(tree.selectNode(active(), id), false),
      /** 접기는 보는 방식이라 실행 취소 기록에 넣지 않는다. */
      toggleCollapsed: (id: string) => apply(tree.toggleCollapsed(active(), id), false),
      rename: (id: string, title: string) => apply(tree.renameNode(active(), id, title)),
      /** 문서 제목처럼 글자마다 바뀌는 입력은 실행 취소 한 번으로 묶는다. */
      renameLive: (id: string, title: string) =>
        apply(tree.renameNode(active(), id, title), `title:${id}`),
      resize: (id: string, width?: number) => apply(tree.resizeNode(active(), id, width)),
      addChild: (parentId: string, side?: Side) => {
        const r = tree.addChild(active(), parentId, side);
        apply(r.topic);
        return r.id;
      },
      addSibling: (id: string) => {
        const r = tree.addSibling(active(), id);
        apply(r.topic);
        return r.id;
      },
      remove: (id: string) => apply(tree.removeNode(active(), id)),
      move: (id: string, targetId: string, place: Place, side?: Side) =>
        apply(tree.moveNode(active(), id, targetId, place, side)),
      undo: () => {
        const topic = active();
        const snapshot = history.current.get(topic.id)?.pop();
        if (!snapshot) return;
        // 실행 취소는 주제 안의 내용만 되돌리고, 그사이 바꾼 그룹과 보기 설정은 그대로 둔다.
        // 접힘 상태도 지금 모습 그대로 둔다.
        const nodes = { ...snapshot.nodes };
        for (const [id, node] of Object.entries(nodes)) {
          const now = topic.nodes[id];
          if (now && now.collapsed !== node.collapsed) nodes[id] = { ...node, collapsed: now.collapsed };
        }
        const previous = {
          ...snapshot,
          nodes,
          groupId: topic.groupId,
          view: topic.view,
          docWide: topic.docWide,
        };
        lastHistoryKey.current = null;
        const w = current.current!;
        commit({ ...w, topics: w.topics.map((t) => (t.id === topic.id ? previous : t)) });
      },
      switchTopic: (id: string) => {
        lastHistoryKey.current = null;
        commit({ ...current.current!, activeId: id });
      },
      createTopic: (groupId?: string) => {
        const topic: Topic = { ...tree.createTopic(""), groupId };
        let w = current.current!;
        // 새 주제가 접힌 칸 안에 숨지 않게 펼친다.
        if (groupId) w = groups.setGroupCollapsed(w, groupId, false);
        else if (w.ungroupedCollapsed) w = { ...w, ungroupedCollapsed: false };
        lastHistoryKey.current = null;
        commit({ ...w, topics: [...w.topics, topic], activeId: topic.id });
        return topic.rootId;
      },
      // 그룹 정리는 주제 내용을 바꾸지 않으므로 주제별 실행 취소 기록에 넣지 않는다.
      createGroup: () => {
        const r = groups.addGroup(current.current!);
        commit(r.workspace);
        return r.id;
      },
      renameGroup: (id: string, name: string) =>
        commit(groups.renameGroup(current.current!, id, name)),
      setGroupCollapsed: (id: string, collapsed: boolean) =>
        commit(groups.setGroupCollapsed(current.current!, id, collapsed)),
      /** 보기 설정은 내용이 아니라서 실행 취소 기록에 넣지 않는다. */
      setView: (view: TopicView) => patchActive({ view }),
      setDocWide: (docWide: boolean) => patchActive({ docWide }),
      setUngroupedCollapsed: (collapsed: boolean) =>
        commit({ ...current.current!, ungroupedCollapsed: collapsed }),
      deleteGroup: (id: string) => commit(groups.removeGroup(current.current!, id)),
      moveTopic: (id: string, groupId: string | null, beforeId: string | null) => {
        const w = current.current!;
        const next = groups.moveTopic(w, id, groupId, beforeId);
        if (next !== w) commit(next);
      },
      moveGroup: (id: string, beforeId: string | null) => {
        const w = current.current!;
        const next = groups.moveGroup(w, id, beforeId);
        if (next !== w) commit(next);
      },
      deleteTopic: (id: string) => {
        const w = current.current!;
        const topics = w.topics.filter((t) => t.id !== id);
        history.current.delete(id);
        lastHistoryKey.current = null;
        if (topics.length === 0) {
          commit({ ...firstWorkspace(), groups: w.groups });
          return;
        }
        commit({ ...w, topics, activeId: w.activeId === id ? topics[0].id : w.activeId });
      },
      exportBackup: async () => {
        flush();
        const backup = await createBackup(current.current!);
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(backup)], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `treelog-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      importBackup: async (text: string) => {
        const parsed: unknown = JSON.parse(text);
        if (!isBackup(parsed)) throw new Error("invalid backup");
        // 새로고침 직전 저장이 복원한 내용을 덮어쓰지 않게 막는다.
        frozen.current = true;
        window.clearTimeout(timer.current);
        await restoreBackup(parsed);
        window.location.reload();
      },
    };
  }, [commit, flush]);

  const topic = workspace?.topics.find((t) => t.id === workspace.activeId) ?? null;
  return { workspace, topic, actions, loadFailed };
}

export type WorkspaceActions = ReturnType<typeof useWorkspace>["actions"];
