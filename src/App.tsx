import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useWorkspace } from "./data/useWorkspace";
import { READ_ONLY } from "./config";
import { AllDocs } from "./components/AllDocs";
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
  /** '모든 문서' 화면을 보는 중인지 */
  const [allDocs, setAllDocs] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  /** 새 주제를 만들면 문서 제목부터 바로 고치게 한다 */
  const [titleEditId, setTitleEditId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const openAllDocs = useCallback(() => {
    setAllDocs(true);
    setSearchFocus((n) => n + 1);
  }, []);
  const clearTitleEdit = useCallback(() => setTitleEditId(null), []);

  // 어디서든 Ctrl+K(맥은 Cmd+K)로 검색을 연다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openAllDocs();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAllDocs]);

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

  if (loadFailed)
    return <div className="load-failed">노트를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</div>;
  if (!workspace || !topic) return null;
  // 하위 항목이 없는 주제는 문서 한 장이라 트리 칸 없이 문서만 넓게 보여 준다.
  const single = topic.nodes[topic.rootId].children.length === 0;
  const wide = docOpen && (single || (topic.docWide ?? false));

  const createdTopic = (rootId: string) => {
    setAllDocs(false);
    setDocOpen(true);
    setTitleEditId(rootId);
  };

  const growTree = () => {
    actions.setDocWide(false);
    setEditingId(actions.addChild(topic.rootId));
  };

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
          activeId={allDocs ? null : topic.id}
          actions={actions}
          onCreated={createdTopic}
          onTopicOpen={() => setAllDocs(false)}
          onAllDocs={openAllDocs}
          onError={showError}
          onCollapse={() => changeSidebar(false)}
        />
      )}
      {allDocs && (
        <AllDocs
          workspace={workspace}
          focusKey={searchFocus}
          onClose={() => setAllDocs(false)}
          onOpen={(topicId, nodeId) => {
            actions.openNode(topicId, nodeId);
            setAllDocs(false);
            setDocOpen(true);
          }}
        />
      )}
      <div
        hidden={allDocs}
        className={`app-body ${docOpen ? "" : "doc-closed"} ${wide ? "doc-wide" : ""} ${resizing ? "resizing" : ""}`}
        ref={bodyRef}
      >
        <div
          style={{ width: !docOpen ? "100%" : wide ? "0%" : `${split}%` }}
          className="app-left"
          inert={wide}
        >
          {!sidebarOpen && (
            <button
              className="sidebar-open"
              aria-label="사이드바 펼치기"
              onClick={() => changeSidebar(true)}
            >
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
            groupName={workspace.groups.find((g) => g.id === topic.groupId)?.name}
          />
        </div>
        <div className="divider" onPointerDown={startResize} />
        <div className="app-right" style={{ width: wide ? "100%" : `${100 - split}%` }}>
          {!READ_ONLY && topic.selectedId !== topic.rootId && (
            <button className="doc-delete" onClick={() => remove(topic.selectedId)}>
              삭제
            </button>
          )}
          {single && !READ_ONLY && (
            <button
              className="doc-grow"
              onClick={growTree}
              title="하위 항목을 만들어 트리로 정리해요"
            >
              트리로 펼치기
            </button>
          )}
          <button
            className="doc-wide-toggle"
            hidden={single}
            aria-label={wide ? "트리와 같이 보기" : "문서 넓게 보기"}
            title={wide ? "트리와 같이 보기" : "문서 넓게 보기"}
            onClick={() => actions.setDocWide(!wide)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
          <DocPane
            topic={topic}
            actions={actions}
            onError={showError}
            editTitleId={titleEditId}
            onTitleEditStarted={clearTitleEdit}
          />
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
