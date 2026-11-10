import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useWorkspace } from "./data/useWorkspace";
import { READ_ONLY } from "./config";
import { DocPane } from "./components/DocPane";
import { Sidebar } from "./components/Sidebar";
import { TreePane } from "./components/TreePane";

interface Toast {
  message: string;
  undo?: boolean;
}

const SPLIT_KEY = "logic-note:split";
const SIDEBAR_KEY = "logic-note:sidebar";
const TOAST_MS = 5000;

function loadSplit(): number {
  try {
    const value = Number(localStorage.getItem(SPLIT_KEY));
    return value >= 25 && value <= 75 ? value : 50;
  } catch {
    return 50;
  }
}

function loadSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function App() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [split, setSplit] = useState(loadSplit);
  const [docOpen, setDocOpen] = useState(true);
  const [resizing, setResizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebarOpen);
  const bodyRef = useRef<HTMLDivElement>(null);

  const openDoc = useCallback(() => setDocOpen(true), []);
  const closeDoc = useCallback(() => setDocOpen(false), []);
  const showError = useCallback((message: string) => setToast({ message }), []);
  const onSaveError = useCallback(
    () => setToast({ message: "저장하지 못했어요. 저장 공간을 확인해 주세요." }),
    [],
  );
  const { workspace, topic, actions, loadFailed } = useWorkspace(onSaveError);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (loadFailed) return <div className="load-failed">노트를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</div>;
  if (!workspace || !topic) return null;
  const wide = docOpen && (topic.docWide ?? false);

  const changeSidebar = (open: boolean) => {
    setSidebarOpen(open);
    try {
      localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
    } catch {
      // 접힘 기억은 편의 기능이라 실패해도 그대로 둔다.
    }
  };

  const remove = (id: string) => {
    if (READ_ONLY || id === topic.rootId) return;
    const title = topic.nodes[id].title || "제목 없음";
    const countBelow = (n: string): number =>
      topic.nodes[n].children.reduce((sum, c) => sum + 1 + countBelow(c), 0);
    const below = countBelow(id);
    actions.remove(id);
    setToast({
      message: below > 0 ? `'${title}' 삭제함 (하위 항목 ${below}개 포함)` : `'${title}' 삭제함`,
      undo: true,
    });
  };

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const rect = bodyRef.current!.getBoundingClientRect();
    let latest = split;
    setResizing(true);
    const move = (ev: PointerEvent) => {
      latest = Math.min(75, Math.max(25, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplit(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      try {
        localStorage.setItem(SPLIT_KEY, String(latest));
      } catch {
        // 비율 기억은 편의 기능이라 실패해도 그대로 둔다.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="app">
      {sidebarOpen && (
        <Sidebar
          topics={workspace.topics}
          groups={workspace.groups}
          ungroupedCollapsed={workspace.ungroupedCollapsed ?? false}
          active={topic}
          actions={actions}
          onCreated={setEditingId}
          onError={showError}
          onCollapse={() => changeSidebar(false)}
        />
      )}
      <div
        className={`app-body ${docOpen ? "" : "doc-closed"} ${wide ? "doc-wide" : ""} ${resizing ? "resizing" : ""}`}
        ref={bodyRef}
      >
        <div
          style={{ width: !docOpen ? "100%" : wide ? "0%" : `${split}%` }}
          className="app-left"
          inert={wide}
        >
          {!sidebarOpen && (
            <button className="sidebar-open" aria-label="사이드바 펼치기" onClick={() => changeSidebar(true)}>
              »
            </button>
          )}
          <TreePane
            topic={topic}
            actions={actions}
            editingId={editingId}
            setEditingId={setEditingId}
            onRemove={remove}
            onOpenDoc={openDoc}
          />
        </div>
        <div className="divider" onPointerDown={startResize} />
        <div className="app-right" style={{ width: wide ? "100%" : `${100 - split}%` }}>
          {!READ_ONLY && topic.selectedId !== topic.rootId && (
            <button className="doc-delete" onClick={() => remove(topic.selectedId)}>
              삭제
            </button>
          )}
          <button
            className="doc-wide-toggle"
            aria-label={wide ? "트리와 같이 보기" : "문서 넓게 보기"}
            title={wide ? "트리와 같이 보기" : "문서 넓게 보기"}
            onClick={() => actions.setDocWide(!wide)}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              {wide ? (
                <path d="M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5l4-4M6.5 9.5l-4 4" />
              ) : (
                <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
              )}
            </svg>
          </button>
          <button className="doc-close" aria-label="문서 닫기" onClick={closeDoc}>
            ×
          </button>
          <DocPane topic={topic} actions={actions} onError={showError} />
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                actions.undo();
                setToast(null);
              }}
            >
              되돌리기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
