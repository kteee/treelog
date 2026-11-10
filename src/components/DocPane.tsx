import { useEffect, useMemo, useRef, useState } from "react";
import { outlineOrder, type Topic } from "../model/tree";
import { NodeLinkContext } from "./NodeLink";
import type { WorkspaceActions } from "../data/useWorkspace";
import { DocEditor, type EditorHandle } from "./DocEditor";
import { useAutoHeight } from "./useAutoHeight";
import { READ_ONLY } from "../config";

interface Props {
  topic: Topic;
  actions: WorkspaceActions;
  onError: (message: string) => void;
  /** 새 주제를 만들었을 때처럼 이 항목의 제목을 바로 고치기 시작할 항목 */
  editTitleId?: string | null;
  onTitleEditStarted?: () => void;
}

export function DocPane({ topic, actions, onError, editTitleId, onTitleEditStarted }: Props) {
  const handle: EditorHandle = useRef(null);
  const node = topic.nodes[topic.selectedId];

  const links = useMemo(
    () => ({
      titleOf: (id: string) => topic.nodes[id]?.title ?? null,
      open: (id: string) => actions.select(id),
      targets: outlineOrder(topic)
        .filter((id) => id !== node.id)
        .map((id) => {
          const parent = topic.nodes[id].parent;
          return {
            id,
            title: topic.nodes[id].title || "제목 없음",
            parentTitle: parent ? topic.nodes[parent].title || "제목 없음" : undefined,
          };
        }),
    }),
    [topic, actions, node.id],
  );

  return (
    <div className="doc-pane">
      <div className="doc-column">
        <DocTitle
          key={`title:${node.id}`}
          value={node.title}
          onChange={(title) => actions.renameLive(node.id, title)}
          onEnter={() => handle.current?.focus()}
          startEditing={editTitleId === node.id}
          onEditStarted={onTitleEditStarted}
        />
        <NodeLinkContext.Provider value={links}>
          <DocEditor
            key={node.id}
            nodeId={node.id}
            handle={handle}
            onError={onError}
            onSaved={actions.touch}
          />
        </NodeLinkContext.Provider>
        {node.children.length > 0 && (
          <nav className="doc-children" aria-label="하위 항목">
            <div className="doc-children-title">하위 항목</div>
            {node.children.map((id) => (
              <button key={id} className="doc-child" onClick={() => actions.select(id)}>
                <span className="doc-child-arrow">›</span>
                <span className={topic.nodes[id].title ? "" : "untitled"}>
                  {topic.nodes[id].title || "제목 없음"}
                </span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

interface TitleProps {
  value: string;
  onChange: (title: string) => void;
  onEnter: () => void;
}

/** 평소엔 한 줄로 줄여 보여주고, 고칠 때만 전체를 펼친다. */
function DocTitle({
  startEditing,
  onEditStarted,
  ...props
}: TitleProps & { startEditing?: boolean; onEditStarted?: () => void }) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!startEditing || READ_ONLY) return;
    setEditing(true);
    onEditStarted?.();
  }, [startEditing, onEditStarted]);

  if (READ_ONLY) {
    return (
      <div
        role="heading"
        aria-level={1}
        className={`doc-title doc-title-view ${props.value ? "" : "empty"}`}
      >
        {props.value || "제목 없음"}
      </div>
    );
  }
  if (editing) return <TitleInput {...props} onDone={() => setEditing(false)} />;
  return (
    <div
      className={`doc-title doc-title-view ${props.value ? "" : "empty"}`}
      tabIndex={0}
      onFocus={() => setEditing(true)}
    >
      {props.value || "제목 없음"}
    </div>
  );
}

function TitleInput({ value, onChange, onEnter, onDone }: TitleProps & { onDone: () => void }) {
  const ref = useAutoHeight(value);

  useEffect(() => {
    const el = ref.current;
    el?.focus({ preventScroll: true });
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [ref]);

  return (
    <textarea
      ref={ref}
      className="doc-title"
      rows={1}
      value={value}
      placeholder="제목 없음"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}
