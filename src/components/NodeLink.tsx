import { createContext, useContext } from "react";
import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactInlineContentSpec } from "@blocknote/react";

/** 문서 안 링크가 가리키는 항목을 찾고 여는 방법. 문서 칸이 채워 준다. */
export interface NodeLinkTarget {
  id: string;
  title: string;
  /** 고를 때 같이 보여 주는 상위 항목 이름 */
  parentTitle?: string;
}

interface NodeLinkContextValue {
  /** 항목이 지워졌으면 null */
  titleOf: (id: string) => string | null;
  open: (id: string) => void;
  /** '@'로 고를 수 있는 같은 주제의 항목들 */
  targets: NodeLinkTarget[];
}

export const NodeLinkContext = createContext<NodeLinkContextValue>({
  titleOf: () => null,
  open: () => {},
  targets: [],
});

function NodeLinkView({ nodeId }: { nodeId: string }) {
  const { titleOf, open } = useContext(NodeLinkContext);
  const title = titleOf(nodeId);
  // 제목은 저장하지 않고 그때그때 읽어서, 항목 이름을 바꾸면 링크도 같이 바뀐다.
  return (
    <span
      className={`node-link ${title === null ? "missing" : ""}`}
      title={title === null ? "지워진 항목이에요" : "이 항목 문서로 이동"}
      onClick={(e) => {
        e.preventDefault();
        if (title !== null) open(nodeId);
      }}
    >
      @{title === null ? "지워진 항목" : title || "제목 없음"}
    </span>
  );
}

const NodeLink = createReactInlineContentSpec(
  {
    type: "nodeLink",
    propSchema: { nodeId: { default: "" } },
    content: "none",
  },
  {
    render: ({ inlineContent }) => <NodeLinkView nodeId={inlineContent.props.nodeId} />,
  },
);

export const docSchema = BlockNoteSchema.create({
  inlineContentSpecs: { ...defaultInlineContentSpecs, nodeLink: NodeLink },
});
