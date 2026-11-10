import { describe, expect, it } from "vitest";
import { docText, snippet } from "./docText";

describe("문서 글자 뽑기", () => {
  it("문단, 하위 블록, 링크, 표 안의 글자를 모두 모은다", () => {
    const blocks = [
      { type: "paragraph", content: [{ type: "text", text: "Scoped는", styles: {} }], children: [] },
      {
        type: "bulletListItem",
        content: [
          { type: "link", href: "https://x", content: [{ type: "text", text: "공식 문서" }] },
          { type: "nodeLink", props: { nodeId: "abc" } },
        ],
        children: [{ type: "paragraph", content: [{ type: "text", text: "요청마다 하나" }] }],
      },
      {
        type: "table",
        content: { type: "tableContent", rows: [{ cells: [[{ type: "text", text: "셀" }]] }] },
      },
    ];
    expect(docText(blocks)).toBe("Scoped는 공식 문서 요청마다 하나 셀");
  });

  it("비어 있거나 이상한 값이면 빈 글자다", () => {
    expect(docText(undefined)).toBe("");
    expect(docText([{ type: "paragraph", content: [] }])).toBe("");
  });
});

describe("검색 미리보기", () => {
  it("찾은 곳 앞뒤를 자르고 대소문자는 가리지 않는다", () => {
    const text = "가".repeat(50) + "Singleton" + "나".repeat(50);
    const s = snippet(text, "singleton", 5)!;
    expect(s).toBe("…가가가가가Singleton나나나나나…");
  });

  it("못 찾으면 null", () => {
    expect(snippet("abc", "z")).toBeNull();
  });
});
