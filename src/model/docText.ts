/**
 * 편집기 문서(블록 목록)에서 검색에 쓸 글자만 뽑는다.
 * 표, 목록, 링크처럼 구조가 달라도 글자는 모두 "text" 칸에 들어 있어서
 * 그 칸만 모아 한 줄로 이어 붙인다.
 */
export function docText(blocks: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "text" && typeof child === "string") parts.push(child);
      else if (typeof child === "object") walk(child);
    }
  };
  walk(blocks);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** 찾은 글자 앞뒤를 조금 잘라 보여 준다. 못 찾으면 null. */
export function snippet(text: string, query: string, radius = 36): string | null {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
