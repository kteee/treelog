import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { outlineOrder } from "../model/tree";
import type { Workspace } from "../model/workspace";
import { docText, snippet } from "../model/docText";
import { loadAllDocs } from "../data/db";

interface Props {
  workspace: Workspace;
  onOpen: (topicId: string, nodeId: string) => void;
  onClose: () => void;
  /** 바뀔 때마다 검색칸에 다시 커서를 둔다(Ctrl+K) */
  focusKey: number;
}

interface Row {
  topicId: string;
  nodeId: string;
  title: string;
  /** '공부 / C# 백엔드 › DI 수명주기' 같은 위치 */
  path: string;
  updatedAt?: number;
  order: number;
}

/** 모든 주제의 모든 항목 문서를 한 목록으로 보여 주고, 제목·위치·내용으로 찾는다. */
export function AllDocs({ workspace, onOpen, onClose, focusKey }: Props) {
  const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<Record<string, string> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusKey]);

  // 화면을 열 때마다 저장된 문서를 다시 읽어서 방금 쓴 내용도 찾을 수 있게 한다.
  useEffect(() => {
    let alive = true;
    loadAllDocs()
      .then((docs) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        for (const [id, blocks] of Object.entries(docs)) next[id] = docText(blocks);
        setTexts(next);
      })
      .catch(() => alive && setTexts({}));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const topic of workspace.topics) {
      const group = workspace.groups.find((g) => g.id === topic.groupId);
      const topicTitle = topic.nodes[topic.rootId].title || "제목 없음";
      for (const id of outlineOrder(topic)) {
        const node = topic.nodes[id];
        const parts: string[] = [];
        let parent = node.parent;
        while (parent && parent !== topic.rootId) {
          parts.unshift(topic.nodes[parent].title || "제목 없음");
          parent = topic.nodes[parent].parent;
        }
        const where = id === topic.rootId ? [] : [topicTitle, ...parts];
        const prefix = group ? `${group.name || "이름 없는 그룹"} / ` : "";
        result.push({
          topicId: topic.id,
          nodeId: id,
          title: node.title || "제목 없음",
          path: prefix + where.join(" › "),
          updatedAt: node.updatedAt,
          order: result.length,
        });
      }
    }
    return result;
  }, [workspace]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const byRecent = (a: Row, b: Row) =>
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.order - b.order;
    if (!q) return [...rows].sort(byRecent).map((row) => ({ row, preview: null }));
    const hits: { row: Row; preview: string | null; rank: number }[] = [];
    for (const row of rows) {
      const inTitle = row.title.toLowerCase().includes(q);
      const inPath = row.path.toLowerCase().includes(q);
      const preview = snippet(texts?.[row.nodeId] ?? "", q);
      if (inTitle || inPath || preview) {
        hits.push({ row, preview: inTitle ? null : preview, rank: inTitle ? 0 : preview ? 1 : 2 });
      }
    }
    return hits.sort((a, b) => a.rank - b.rank || byRecent(a.row, b.row));
  }, [rows, texts, q]);

  return (
    <div className="all-docs">
      <div className="all-docs-column">
        <div className="all-docs-head">
          <h1>모든 문서</h1>
          <span className="all-docs-count">{rows.length}개</span>
        </div>
        <input
          ref={inputRef}
          className="all-docs-search"
          type="search"
          value={query}
          placeholder="제목, 위치, 내용으로 찾기"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !query) onClose();
            if (e.key === "Enter" && !e.nativeEvent.isComposing && shown[0]) {
              onOpen(shown[0].row.topicId, shown[0].row.nodeId);
            }
          }}
        />
        {q && texts === null && <div className="all-docs-note">문서 내용을 읽는 중이에요…</div>}
        {q && shown.length === 0 && <div className="all-docs-note">찾는 문서가 없어요.</div>}
        <ul className="all-docs-list">
          {shown.map(({ row, preview }) => (
            <li key={row.nodeId}>
              <button className="all-docs-row" onClick={() => onOpen(row.topicId, row.nodeId)}>
                <span className="all-docs-title">{highlight(row.title, q)}</span>
                {row.path && <span className="all-docs-path">{highlight(row.path, q)}</span>}
                {preview && <span className="all-docs-preview">{highlight(preview, q)}</span>}
                {row.updatedAt && <span className="all-docs-time">{timeAgo(row.updatedAt)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function timeAgo(time: number): string {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const d = new Date(time);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
