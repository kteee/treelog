import { useEffect, useRef, useState } from "react";
import type { Topic } from "../model/tree";
import type { WorkspaceActions } from "../data/useWorkspace";
import { DocEditor, type EditorHandle } from "./DocEditor";
import { useAutoHeight } from "./useAutoHeight";
import { READ_ONLY } from "../config";

interface Props {
  topic: Topic;
  actions: WorkspaceActions;
  onError: (message: string) => void;
}

export function DocPane({ topic, actions, onError }: Props) {
  const handle: EditorHandle = useRef(null);
  const node = topic.nodes[topic.selectedId];

  return (
    <div className="doc-pane">
      <div className="doc-column">
        <DocTitle
          key={`title:${node.id}`}
          value={node.title}
          onChange={(title) => actions.renameLive(node.id, title)}
          onEnter={() => handle.current?.focus()}
        />
        <DocEditor key={node.id} nodeId={node.id} handle={handle} onError={onError} />
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
function DocTitle(props: TitleProps) {
  const [editing, setEditing] = useState(false);
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
