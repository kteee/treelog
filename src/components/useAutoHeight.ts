import { useEffect, useLayoutEffect, useRef } from "react";

/** 여러 줄 입력칸의 높이를 내용에 맞춘다. */
export function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // 글꼴 자체 높이가 줄 높이보다 크면 scrollHeight가 조금 더 나오므로 줄 수로 맞춘다.
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    el.style.height = lineHeight
      ? `${Math.max(1, Math.round(el.scrollHeight / lineHeight)) * lineHeight}px`
      : `${el.scrollHeight}px`;
  };

  useLayoutEffect(fit, [value]);

  // 칸 너비가 바뀌면 줄이 다시 나뉘므로 높이도 다시 잰다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
