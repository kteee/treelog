import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Topic } from "../model/tree";
import type { Group } from "../model/workspace";
import type { WorkspaceActions } from "../data/useWorkspace";
import { READ_ONLY } from "../config";

interface Props {
  topics: Topic[];
  groups: Group[];
  ungroupedCollapsed: boolean;
  /** 지금 열린 주제. '모든 문서'를 보는 중이면 null */
  activeId: string | null;
  actions: WorkspaceActions;
  onCreated: (rootId: string) => void;
  /** 주제를 골랐을 때('모든 문서'에서 주제 화면으로 돌아간다) */
  onTopicOpen: () => void;
  onAllDocs: () => void;
  onError: (message: string) => void;
  onCollapse: () => void;
}

interface Dragged {
  kind: "topic" | "group";
  id: string;
  title: string;
}

/** 놓을 자리 표시. key는 표시할 줄을 가리킨다. */
interface Mark {
  key: string;
  place: "before" | "after" | "inside";
}

type Target =
  | { kind: "topic"; groupId: string | null; beforeId: string | null; mark: Mark }
  | { kind: "group"; beforeId: string | null; mark: Mark };

const DRAG_THRESHOLD = 5;
const titleOf = (t: Topic) => t.nodes[t.rootId].title || "제목 없음";
const nameOf = (g: Group) => g.name || "이름 없는 그룹";

export function Sidebar({
  topics,
  groups,
  ungroupedCollapsed,
  activeId,
  onTopicOpen,
  onAllDocs,
  actions,
  onCreated,
  onError,
  onCollapse,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const justDragged = useRef(false);
  const [mark, setMark] = useState<Mark | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);

  const ungrouped = topics.filter((t) => !t.groupId);
  /** 그룹을 하나도 안 쓰면 '그룹 없음' 머리줄 없이 주제만 보여준다. */
  const showUngroupedHead = groups.length > 0;
  const membersOf = (groupId: string | null) =>
    topics.filter((t) => (t.groupId ?? null) === groupId);
  const markClass = (key: string) => (mark?.key === key ? `drop-${mark.place}` : "");

  const findTarget = (dragged: Dragged, x: number, y: number): Target | null => {
    const el = document.elementFromPoint(x, y);
    if (!el?.closest(".sidebar-list")) return null;

    if (dragged.kind === "topic") {
      const row = el.closest<HTMLElement>("[data-topic-id]");
      if (row) {
        const id = row.dataset.topicId!;
        if (id === dragged.id) return null;
        const groupId = row.dataset.topicGroup || null;
        const r = row.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          return {
            kind: "topic",
            groupId,
            beforeId: id,
            mark: { key: `topic:${id}`, place: "before" },
          };
        }
        const rest = membersOf(groupId).filter((t) => t.id !== dragged.id);
        const next = rest[rest.findIndex((t) => t.id === id) + 1]?.id ?? null;
        return {
          kind: "topic",
          groupId,
          beforeId: next,
          mark: { key: `topic:${id}`, place: "after" },
        };
      }
      const head = el.closest<HTMLElement>("[data-group-id]");
      if (head) {
        // '그룹 없음' 머리줄은 빈 groupId를 가진다.
        const groupId = head.dataset.groupId || null;
        return {
          kind: "topic",
          groupId,
          beforeId: null,
          mark: { key: `group:${groupId ?? ""}`, place: "inside" },
        };
      }
      return null;
    }

    const others = groups.filter((g) => g.id !== dragged.id);
    const section = el.closest<HTMLElement>("[data-section]");
    if (section) {
      const id = section.dataset.section!;
      if (id === dragged.id) return null;
      const r = section.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        return { kind: "group", beforeId: id, mark: { key: `section:${id}`, place: "before" } };
      }
      const next = others[others.findIndex((g) => g.id === id) + 1]?.id ?? null;
      return { kind: "group", beforeId: next, mark: { key: `section:${id}`, place: "after" } };
    }
    // 그룹 밖 주제들 위에 놓으면 맨 앞 그룹이 된다.
    if (el.closest("[data-ungrouped]") && others.length > 0) {
      return {
        kind: "group",
        beforeId: others[0].id,
        mark: { key: `section:${others[0].id}`, place: "before" },
      };
    }
    return null;
  };

  const startDrag = (e: ReactPointerEvent, dragged: Dragged) => {
    if (READ_ONLY || e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let target: Target | null = null;

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD)
        return;
      dragging = true;
      setGhost({ x: ev.clientX, y: ev.clientY, title: dragged.title });
      target = findTarget(dragged, ev.clientX, ev.clientY);
      setMark(target?.mark ?? null);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragging) return;
      setGhost(null);
      setMark(null);
      // 끌기를 마친 손을 뗄 때 생기는 클릭은 무시한다.
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false));
      if (target?.kind === "topic") actions.moveTopic(dragged.id, target.groupId, target.beforeId);
      if (target?.kind === "group") actions.moveGroup(dragged.id, target.beforeId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const unlessDragged = (fn: () => void) => () => {
    if (!justDragged.current) fn();
  };

  const renderTopic = (t: Topic) => (
    <div
      key={t.id}
      className={`sidebar-row ${t.id === activeId ? "current" : ""} ${showUngroupedHead ? "in-group" : ""} ${markClass(`topic:${t.id}`)}`}
      data-topic-id={t.id}
      data-topic-group={t.groupId ?? ""}
    >
      <button
        className="sidebar-topic"
        onPointerDown={(e) => startDrag(e, { kind: "topic", id: t.id, title: titleOf(t) })}
        onClick={unlessDragged(() => {
          actions.switchTopic(t.id);
          onTopicOpen();
        })}
      >
        <TopicIcon single={t.nodes[t.rootId].children.length === 0} />
        <span className="sidebar-topic-name">{titleOf(t)}</span>
      </button>
      {!READ_ONLY && (
        <button
          className="sidebar-delete"
          aria-label={`${titleOf(t)} 삭제`}
          onClick={() => {
            if (window.confirm(`'${titleOf(t)}' 주제와 안의 문서를 모두 삭제할까요?`)) {
              actions.deleteTopic(t.id);
            }
          }}
        >
          ×
        </button>
      )}
    </div>
  );

  const renderGroup = (g: Group) => {
    const members = membersOf(g.id);
    return (
      <div
        key={g.id}
        className={`sidebar-group ${markClass(`section:${g.id}`)}`}
        data-section={g.id}
      >
        <div
          className={`sidebar-row sidebar-group-head ${markClass(`group:${g.id}`)}`}
          data-group-id={g.id}
        >
          {editingGroup === g.id ? (
            <GroupNameInput
              initial={g.name}
              onDone={(name) => {
                setEditingGroup(null);
                if (name !== null) actions.renameGroup(g.id, name.trim());
              }}
            />
          ) : (
            <button
              className="sidebar-group-toggle"
              aria-expanded={!g.collapsed}
              title="더블클릭으로 이름 바꾸기"
              onPointerDown={(e) => startDrag(e, { kind: "group", id: g.id, title: nameOf(g) })}
              onClick={unlessDragged(() => actions.setGroupCollapsed(g.id, !g.collapsed))}
              onDoubleClick={() => {
                if (READ_ONLY) return;
                // 더블클릭의 두 번 클릭이 접기를 두 번 바꾸므로 펼친 상태로 되돌린다.
                actions.setGroupCollapsed(g.id, false);
                setEditingGroup(g.id);
              }}
            >
              <span className="sidebar-caret">{g.collapsed ? "▸" : "▾"}</span>
              <span className={`sidebar-group-name ${g.name ? "" : "untitled"}`}>{nameOf(g)}</span>
              {g.collapsed && members.length > 0 && (
                <span className="sidebar-count">{members.length}</span>
              )}
            </button>
          )}
          {!READ_ONLY && (
            <>
              <button
                className="sidebar-delete sidebar-add"
                aria-label={`${nameOf(g)}에 새 주제`}
                onClick={() => onCreated(actions.createTopic(g.id))}
              >
                +
              </button>
              <button
                className="sidebar-delete"
                aria-label={`${nameOf(g)} 그룹 삭제`}
                onClick={() => {
                  if (
                    members.length === 0 ||
                    window.confirm(
                      `'${nameOf(g)}' 그룹을 지울까요? 안의 주제 ${members.length}개는 그룹 밖으로 나와요.`,
                    )
                  ) {
                    actions.deleteGroup(g.id);
                  }
                }}
              >
                ×
              </button>
            </>
          )}
        </div>
        {!g.collapsed && members.map(renderTopic)}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span>주제</span>
        <div className="sidebar-actions">
          {!READ_ONLY && (
            <>
              <button
                aria-label="새 주제"
                title="새 주제"
                onClick={() => onCreated(actions.createTopic())}
              >
                +
              </button>
              <button
                aria-label="새 그룹"
                title="새 그룹"
                onClick={() => setEditingGroup(actions.createGroup())}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path
                    d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5H3A1 1 0 0 0 2 4.5Z"
                    strokeLinejoin="round"
                  />
                  <path d="M8 7.25v3.5M6.25 9h3.5" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}
          <button aria-label="사이드바 접기" title="사이드바 접기" onClick={onCollapse}>
            «
          </button>
        </div>
      </div>
      <button className={`sidebar-all ${activeId === null ? "current" : ""}`} onClick={onAllDocs}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <span>모든 문서</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="sidebar-list">
        <div data-ungrouped>
          {showUngroupedHead && (
            <div
              className={`sidebar-row sidebar-group-head ${markClass("group:")}`}
              data-group-id=""
            >
              <button
                className="sidebar-group-toggle"
                aria-expanded={!ungroupedCollapsed}
                onClick={() => actions.setUngroupedCollapsed(!ungroupedCollapsed)}
              >
                <span className="sidebar-caret">{ungroupedCollapsed ? "▸" : "▾"}</span>
                <span className="sidebar-group-name">그룹 없음</span>
                {ungroupedCollapsed && ungrouped.length > 0 && (
                  <span className="sidebar-count">{ungrouped.length}</span>
                )}
              </button>
            </div>
          )}
          {!(showUngroupedHead && ungroupedCollapsed) && ungrouped.map(renderTopic)}
        </div>
        {groups.map(renderGroup)}
      </nav>
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>
          {ghost.title}
        </div>
      )}
      {READ_ONLY ? (
        <div className="sidebar-foot sidebar-note">읽기 전용으로 공개한 공부 노트예요.</div>
      ) : (
        <div className="sidebar-foot">
          <button
            onClick={() =>
              actions.exportBackup().catch(() => onError("백업 파일을 만들지 못했어요."))
            }
          >
            백업 내보내기
          </button>
          <button onClick={() => fileRef.current?.click()}>백업 가져오기</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!window.confirm("지금 노트를 모두 지우고 백업 내용으로 바꿀까요?")) return;
              try {
                await actions.importBackup(await file.text());
              } catch {
                onError("이 파일은 백업으로 읽을 수 없어요.");
              }
            }}
          />
        </div>
      )}
    </aside>
  );
}

function GroupNameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (name: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(name);
  };

  return (
    <input
      ref={ref}
      className="sidebar-group-input"
      value={value}
      placeholder="그룹 이름"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          finish(null);
        }
      }}
    />
  );
}

/** 하위 항목이 없는 주제는 문서 한 장, 있으면 트리로 보여 준다. */
function TopicIcon({ single }: { single: boolean }) {
  return (
    <svg
      className="sidebar-topic-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={single ? "문서" : "트리"}
    >
      {single ? (
        <>
          <path d="M4 1.75h5.5L12.5 4.75v9.5H4z" />
          <path d="M9.5 1.75v3h3M6 8h4.5M6 10.75h4.5" />
        </>
      ) : (
        <>
          <rect x="1.5" y="6" width="4.5" height="4" rx="1.2" />
          <rect x="10" y="2" width="4.5" height="3.2" rx="1" />
          <rect x="10" y="10.8" width="4.5" height="3.2" rx="1" />
          <path d="M6 8h1.8M7.8 3.6V12.4M7.8 3.6H10M7.8 12.4H10" />
        </>
      )}
    </svg>
  );
}
