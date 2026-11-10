import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BRANCH_COLORS,
  branchColor,
  canMove,
  childSide,
  clampNodeWidth,
  neighbor as treeNeighbor,
  outlineNeighbor,
  type Place,
  type Side,
  type Topic,
} from "../model/tree";
import type { WorkspaceActions } from "../data/useWorkspace";
import { useAutoHeight } from "./useAutoHeight";
import { READ_ONLY } from "../config";

interface Props {
  topic: Topic;
  actions: WorkspaceActions;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onRemove: (id: string) => void;
  onOpenDoc: () => void;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

interface Drop {
  id: string;
  place: Place;
  side?: Side;
}

interface Ghost {
  x: number;
  y: number;
  title: string;
}

interface ContextMenu {
  id: string;
  x: number;
  y: number;
}

const MENU_WIDTH = 120;
const MENU_HEIGHT = 44;
const MENU_MARGIN = 8;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;
const DRAG_THRESHOLD = 5;
const RESIZE_THRESHOLD = 2;
const OUTLINE_INDENT = 22;
/** [누르는 키(여러 개면 그중 하나), 하는 일] */
const SHORTCUTS: [string[], string][] = [
  [["Tab"], "하위 항목 추가"],
  [["Enter"], "다음 항목 추가"],
  [["F2", "더블클릭"], "이름 고치기"],
  [["Shift+Enter"], "이름에 줄바꿈"],
  [["Esc"], "고치기 취소"],
  [["Del"], "삭제"],
  [["방향키"], "항목 이동"],
  [["Ctrl+Z"], "되돌리기"],
];
/** 항목 위아래에서 형제 자리로 판정하는 비율. 나머지 가운데가 하위로 넣는 영역이다. */
const DROP_EDGE = 0.35;
/** 항목 밖에서도 이 거리(px) 안이면 그 항목의 위아래로 놓는다. */
const DROP_REACH = 24;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function TreePane({ topic, actions, editingId, setEditingId, onRemove, onOpenDoc }: Props) {
  const paneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 300, y: 300, scale: 1 });
  const [drop, setDrop] = useState<Drop | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [resizing, setResizing] = useState<{ id: string; width: number } | null>(null);
  const menuDismissedAt = useRef<number | null>(null);
  /** 배경을 눌러 선택 표시를 숨긴 항목. 다른 항목이 선택되면 저절로 풀린다. */
  const [hiddenSelection, setHiddenSelection] = useState<string | null>(null);
  const selectionHidden = hiddenSelection === topic.selectedId;
  const outline = (topic.view ?? "tree") === "outline";

  const focusPane = () => paneRef.current?.focus({ preventScroll: true });

  useEffect(() => {
    if (!menu) return;
    const closeOutside = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".context-menu")) return;
      if (e.type === "pointerdown") menuDismissedAt.current = e.timeStamp;
      setMenu(null);
    };
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("wheel", closeOutside, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("wheel", closeOutside, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const openMenu = (e: ReactMouseEvent, id: string) => {
    if (READ_ONLY || editingId === id) return;
    e.preventDefault();
    // 루트를 지우는 건 주제 삭제라서 사이드바에서만 한다.
    if (id === topic.rootId) return;
    setHiddenSelection(null);
    actions.select(id);
    focusPane();
    setMenu({
      id,
      x: Math.min(e.clientX, window.innerWidth - MENU_WIDTH - MENU_MARGIN),
      y: Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - MENU_MARGIN),
    });
  };

  useLayoutEffect(() => {
    // 캔버스 크기는 루트 크기와 같고, 가지는 그 양옆으로 뻗어 나간다.
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rootWidth = canvasRef.current?.offsetWidth ?? 0;
    setView({ x: (viewport.clientWidth - rootWidth) / 2, y: viewport.clientHeight / 2, scale: 1 });
  }, [topic.id, outline]);

  // 웹 글꼴이 늦게 도착하면 글자 폭이 바뀌므로 항목 폭을 다시 맞춘다.
  const [fontsLoaded, setFontsLoaded] = useState(0);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsLoaded((n) => n + 1));
    return () => {
      alive = false;
    };
  }, []);

  /*
   * 글 길이에 맞춘 항목 폭은 88.3px처럼 소수점이 나온다.
   * 그러면 오른쪽에서 시작하는 연결선이 픽셀 사이에 걸려 흐릿하고 굵게 그려지므로
   * 폭을 정수로 올려서 선이 항상 픽셀에 맞게 한다.
   */
  useLayoutEffect(() => {
    if (outline) return;
    const nodes = [...(canvasRef.current?.querySelectorAll<HTMLElement>(".node[data-fit]") ?? [])];
    for (const n of nodes) n.style.width = "";
    const snap = nodes.filter((n) => n.dataset.fit === "snap");
    const widths = snap.map((n) => parseFloat(getComputedStyle(n).width));
    snap.forEach((n, i) => (n.style.width = `${Math.ceil(widths[i])}px`));
  }, [topic.nodes, editingId, outline, fontsLoaded]);

  // 키보드로 움직이거나 항목이 늘어나 선택이 화면 밖으로 나가면 따라간다.
  useLayoutEffect(() => {
    if (outline) {
      paneRef.current
        ?.querySelector(`.outline [data-id="${topic.selectedId}"]`)
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    const viewport = viewportRef.current;
    const el = canvasRef.current?.querySelector(`[data-id="${topic.selectedId}"]`);
    if (!viewport || !el) return;
    const v = viewport.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const margin = 32;
    let dx = 0;
    let dy = 0;
    if (r.left < v.left + margin) dx = v.left + margin - r.left;
    else if (r.right > v.right - margin) dx = v.right - margin - r.right;
    if (r.top < v.top + margin) dy = v.top + margin - r.top;
    else if (r.bottom > v.bottom - margin) dy = v.bottom - margin - r.bottom;
    if (dx || dy) setView((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  }, [topic.selectedId, topic.nodes, editingId, outline]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = viewport.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        setView((p) => {
          const scale = clampScale(p.scale * Math.exp(-e.deltaY * 0.002));
          const ratio = scale / p.scale;
          return { scale, x: px - (px - p.x) * ratio, y: py - (py - p.y) * ratio };
        });
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setView((p) => ({ ...p, x: p.x - dx, y: p.y - dy }));
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
    // 목록형에서 돌아오면 새로 생긴 화면에 다시 붙인다.
  }, [outline]);

  const zoomBy = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const px = viewport.clientWidth / 2;
    const py = viewport.clientHeight / 2;
    setView((p) => {
      const scale = clampScale(p.scale * factor);
      const ratio = scale / p.scale;
      return { scale, x: px - (px - p.x) * ratio, y: py - (py - p.y) * ratio };
    });
  };

  const fit = () => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    const rects = [...canvas.querySelectorAll("[data-id]")].map((n) => n.getBoundingClientRect());
    const rootRect = canvas.querySelector(`[data-id="${topic.rootId}"]`)!.getBoundingClientRect();
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));

    const pad = 72;
    const width = (right - left) / view.scale;
    const height = (bottom - top) / view.scale;
    const scale = clampScale(
      Math.min(1, (viewport.clientWidth - pad) / width, (viewport.clientHeight - pad) / height),
    );
    const rootX = (rootRect.left - left) / view.scale;
    const rootY = (rootRect.top + rootRect.height / 2 - top) / view.scale;
    setView({
      scale,
      x: (viewport.clientWidth - width * scale) / 2 + rootX * scale,
      y: (viewport.clientHeight - height * scale) / 2 + rootY * scale,
    });
  };

  const startPan = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest("[data-id], .tree-controls")) return;
    focusPane();
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    // 입력을 끝내거나 메뉴를 닫으려고 누른 클릭까지 선택 표시를 지우면 안 된다.
    const clearsSelection =
      e.button === 0 && editingId === null && e.timeStamp !== menuDismissedAt.current;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) >= DRAG_THRESHOLD) moved = true;
      // 목록형은 스크롤로 움직이므로 끌어서 화면을 옮기지 않는다.
      if (outline) return;
      setView((p) => ({
        ...p,
        x: start.vx + ev.clientX - start.x,
        y: start.vy + ev.clientY - start.y,
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // 배경을 눌러도 문서는 그대로 두고 선택 표시만 지운다.
      if (clearsSelection && !moved) setHiddenSelection(topic.selectedId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** 항목 밖에 놓았을 때 가장 가까운 항목의 위나 아래 자리를 찾는다. */
  const nearestDrop = (id: string, x: number, y: number): Drop | null => {
    let best: Drop | null = null;
    let bestGap = DROP_REACH;
    for (const el of paneRef.current!.querySelectorAll<HTMLElement>("[data-id]")) {
      const r = el.getBoundingClientRect();
      if (x < r.left - DROP_REACH || x > r.right + DROP_REACH) continue;
      const gap = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const place: Place = y < r.top + r.height / 2 ? "before" : "after";
      const targetId = el.dataset.id!;
      if (gap <= bestGap && canMove(topic, id, targetId, place)) {
        best = { id: targetId, place };
        bestGap = gap;
      }
    }
    return best;
  };

  const startNodeDrag = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || editingId === id) return;
    setHiddenSelection(null);
    actions.select(id);
    focusPane();
    // 공개 빌드에서는 옮길 수 없으니 누르자마자 문서를 연다.
    if (id === topic.rootId || READ_ONLY) {
      onOpenDoc();
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const title = topic.nodes[id].title || "제목 없음";
    let dragging = false;
    let target: Drop | null = null;

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD)
        return;
      dragging = true;
      setGhost({ x: ev.clientX, y: ev.clientY, title });
      const el = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-id]");
      target = null;
      const rootEl = canvasRef.current?.querySelector(`[data-id="${topic.rootId}"]`);
      const rootRect = rootEl?.getBoundingClientRect();
      const pointerSide: Side =
        rootRect && ev.clientX < rootRect.left + rootRect.width / 2 ? "left" : "right";
      if (el?.dataset.id === topic.rootId) {
        // 목록형에는 좌우가 없으므로 원래 쪽이나 항목이 적은 쪽에 맡긴다.
        target = { id: topic.rootId, place: "inside", side: outline ? undefined : pointerSide };
      } else if (el) {
        const rect = el.getBoundingClientRect();
        const ratio = (ev.clientY - rect.top) / rect.height;
        const place: Place =
          ratio < DROP_EDGE ? "before" : ratio > 1 - DROP_EDGE ? "after" : "inside";
        const targetId = el.dataset.id!;
        if (canMove(topic, id, targetId, place)) target = { id: targetId, place };
      } else {
        target = nearestDrop(id, ev.clientX, ev.clientY);
        if (
          !target &&
          !outline &&
          topic.nodes[id].parent === topic.rootId &&
          pointerSide !== childSide(topic.nodes[id])
        ) {
          // 첫 단계 항목은 빈 곳이라도 반대쪽으로 끌면 그쪽으로 넘어간다.
          target = { id: topic.rootId, place: "inside", side: pointerSide };
        }
      }
      setDrop(target);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      setDrop(null);
      if (dragging && target) actions.move(id, target.id, target.place, target.side);
      if (!dragging) onOpenDoc();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** 끄는 동안은 화면만 바꾸고, 놓을 때 한 번만 저장해서 실행 취소가 한 번에 되돌린다. */
  const startNodeResize = (e: ReactPointerEvent, id: string, fromLeft: boolean) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    setHiddenSelection(null);
    actions.select(id);
    focusPane();
    const startX = e.clientX;
    const startWidth = e.currentTarget.parentElement!.offsetWidth;
    const scale = view.scale;
    let latest: number | null = null;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (latest === null && Math.abs(dx) < RESIZE_THRESHOLD) return;
      latest = clampNodeWidth(startWidth + (fromLeft ? -dx : dx) / scale);
      setResizing({ id, width: latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(null);
      if (latest !== null) actions.resize(id, latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input, textarea")) return;
    // 공개 빌드에서는 방향키 이동만 된다.
    if (READ_ONLY && !e.key.startsWith("Arrow")) return;
    const id = topic.selectedId;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return actions.undo();
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const handle = (fn: () => void) => {
      e.preventDefault();
      // 선택이 안 보일 때 누른 키는 보이지 않는 항목을 바꾸지 않고 선택만 다시 보여준다.
      if (selectionHidden) setHiddenSelection(null);
      else fn();
    };
    const neighbor = outline ? outlineNeighbor : treeNeighbor;
    switch (e.key) {
      case "Tab":
        return handle(() => setEditingId(actions.addChild(id)));
      case "Enter":
        return handle(() => setEditingId(actions.addSibling(id)));
      case "F2":
        return handle(() => setEditingId(id));
      case "Delete":
      case "Backspace":
        return handle(() => onRemove(id));
      case "ArrowUp":
        return handle(() => actions.select(neighbor(topic, id, "up")));
      case "ArrowDown":
        return handle(() => actions.select(neighbor(topic, id, "down")));
      case "ArrowLeft":
        return handle(() => actions.select(neighbor(topic, id, "left")));
      case "ArrowRight":
        return handle(() => actions.select(neighbor(topic, id, "right")));
    }
  };

  const renderNode = (id: string, depth: number, side: Side) => {
    const node = topic.nodes[id];
    const isEditing = editingId === id;
    const fromLeft = side === "left" && depth > 0;
    const width = resizing?.id === id ? resizing.width : node.width;
    const classes = [
      "node",
      depth === 0 ? "node-root" : depth === 1 ? "node-main" : "node-leaf",
      fromLeft ? "node-left" : "",
      topic.selectedId === id && !selectionHidden ? "selected" : "",
      drop?.id === id ? `drop-${drop.place}` : "",
      drop?.id === id && drop.side ? `drop-side-${drop.side}` : "",
    ].join(" ");

    return (
      <div
        className={classes}
        data-id={id}
        // 사용자가 폭을 정하지 않은 항목만 정수 폭으로 맞춘다. 고치는 중에는 입력칸이 폭을 정한다.
        data-fit={width === undefined ? (isEditing ? "edit" : "snap") : undefined}
        style={width === undefined ? undefined : { width, maxWidth: "none" }}
        onPointerDown={(e) => startNodeDrag(e, id)}
        onDoubleClick={() => !READ_ONLY && setEditingId(id)}
        onContextMenu={(e) => openMenu(e, id)}
      >
        {isEditing ? (
          <NodeInput
            initial={node.title}
            fill={node.width !== undefined}
            onCommit={(title) => {
              actions.rename(id, title);
              setEditingId(null);
              focusPane();
            }}
            onCommitAndAddChild={(title) => {
              actions.rename(id, title);
              setEditingId(actions.addChild(id));
            }}
            onCancel={() => {
              setEditingId(null);
              focusPane();
            }}
          />
        ) : (
          <span className={node.title ? "" : "untitled"}>{node.title || "제목 없음"}</span>
        )}
        {!isEditing && !READ_ONLY && (
          <div
            className="node-resize"
            title="끌어서 폭 조정 · 더블클릭으로 원래대로"
            onPointerDown={(e) => startNodeResize(e, id, fromLeft)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              actions.resize(id);
            }}
          />
        )}
        {!READ_ONLY && (
          <div className="node-tools" onPointerDown={(e) => e.stopPropagation()}>
            <button
              className="tool tool-hover"
              aria-label="하위 항목 추가"
              onClick={() => setEditingId(actions.addChild(id, depth === 0 ? "right" : undefined))}
            >
              +
            </button>
          </div>
        )}
        {depth === 0 && !READ_ONLY && (
          <div className="node-tools node-tools-left" onPointerDown={(e) => e.stopPropagation()}>
            <button
              className="tool tool-hover"
              aria-label="왼쪽에 항목 추가"
              onClick={() => setEditingId(actions.addChild(id, "left"))}
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderChildren = (ids: string[], depth: number, side: Side, extra = "") => (
    <div className={`children ${side} ${extra}`}>
      {ids.map((c) => (
        <div className="child" key={c}>
          {renderBranch(c, depth, side)}
        </div>
      ))}
    </div>
  );

  const renderBranch = (id: string, depth: number, side: Side) => {
    const node = topic.nodes[id];
    return (
      <div
        className={`branch ${side}`}
        key={id}
        // 루트에서 갈라지는 줄기는 공용이라 회색으로 두고, 색은 대주제부터 입힌다.
        style={
          depth === 1
            ? ({ "--branch": BRANCH_COLORS[branchColor(topic, id)] } as CSSProperties)
            : undefined
        }
      >
        {renderNode(id, depth, side)}
        {node.children.length > 0 && renderChildren(node.children, depth + 1, side)}
      </div>
    );
  };

  const renderOutlineRow = (id: string, depth: number, color: string | undefined): ReactNode[] => {
    const node = topic.nodes[id];
    const isEditing = editingId === id;
    const rowColor = depth === 1 ? BRANCH_COLORS[branchColor(topic, id)] : color;
    const classes = [
      "outline-row",
      depth === 0 ? "outline-root" : depth === 1 ? "outline-main" : "",
      topic.selectedId === id && !selectionHidden ? "selected" : "",
      drop?.id === id ? `drop-${drop.place}` : "",
    ].join(" ");

    const row = (
      <div
        key={id}
        className={classes}
        data-id={id}
        style={
          {
            paddingLeft: depth === 0 ? 12 : 12 + (depth - 1) * OUTLINE_INDENT,
            "--branch": rowColor,
          } as CSSProperties
        }
        onPointerDown={(e) => startNodeDrag(e, id)}
        onDoubleClick={() => !READ_ONLY && setEditingId(id)}
        onContextMenu={(e) => openMenu(e, id)}
      >
        {depth > 0 && <span className="outline-bullet" />}
        {isEditing ? (
          <NodeInput
            initial={node.title}
            fill
            onCommit={(title) => {
              actions.rename(id, title);
              setEditingId(null);
              focusPane();
            }}
            onCommitAndAddChild={(title) => {
              actions.rename(id, title);
              setEditingId(actions.addChild(id));
            }}
            onCancel={() => {
              setEditingId(null);
              focusPane();
            }}
          />
        ) : (
          <span className={`outline-title ${node.title ? "" : "untitled"}`}>
            {node.title || "제목 없음"}
          </span>
        )}
        {!READ_ONLY && (
          <button
            className="tool outline-add"
            aria-label="하위 항목 추가"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setEditingId(actions.addChild(id))}
          >
            +
          </button>
        )}
      </div>
    );
    return [row, ...node.children.flatMap((c) => renderOutlineRow(c, depth + 1, rowColor))];
  };

  const root = topic.nodes[topic.rootId];
  const leftIds = root.children.filter((c) => childSide(topic.nodes[c]) === "left");
  const rightIds = root.children.filter((c) => childSide(topic.nodes[c]) === "right");

  return (
    <div
      className={`tree-pane ${resizing ? "node-resizing" : ""}`}
      ref={paneRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {outline ? (
        <div className="outline" onPointerDown={startPan}>
          <div className="outline-list">{renderOutlineRow(topic.rootId, 0, undefined)}</div>
        </div>
      ) : (
        <div className="tree-viewport" ref={viewportRef} onPointerDown={startPan}>
          <div
            className="tree-canvas"
            ref={canvasRef}
            style={{
              // 화면 위치도 정수로 맞춰야 100%에서 선이 픽셀에 딱 맞는다.
              transform: `translate(${Math.round(view.x)}px, ${Math.round(view.y)}px) scale(${view.scale}) translateY(-50%)`,
            }}
          >
            <div className="root-branch">
              {leftIds.length > 0 && renderChildren(leftIds, 1, "left", "root-children")}
              {renderNode(topic.rootId, 0, "right")}
              {rightIds.length > 0 && renderChildren(rightIds, 1, "right", "root-children")}
            </div>
          </div>
        </div>
      )}
      {/* 목록 보기는 맨 위 주제 줄이 이 자리에 와서 주제명을 대신한다. */}
      {!outline && <div className="tree-title">{root.title || "제목 없음"}</div>}
      {!READ_ONLY && (
        <div className="shortcut-help">
          <button
            className="shortcut-help-btn"
            aria-label="단축키 보기"
            aria-describedby="shortcut-list"
          >
            ?
          </button>
          <div className="shortcut-list" id="shortcut-list" role="tooltip">
            <div className="shortcut-list-title">단축키</div>
            <dl>
              {SHORTCUTS.map(([keys, label]) => (
                <div key={label}>
                  <dt>
                    {keys.map((alt, i) => (
                      <Fragment key={alt}>
                        {i > 0 && <span className="shortcut-sep">·</span>}
                        {alt.split("+").map((k, j) => (
                          <Fragment key={k}>
                            {j > 0 && <span className="shortcut-sep">+</span>}
                            <kbd>{k}</kbd>
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      <div className="tree-controls">
        <div className="view-toggle" role="group" aria-label="보기 방식">
          <button
            className={outline ? "" : "active"}
            aria-label="트리 보기"
            title="트리 보기"
            aria-pressed={!outline}
            onClick={() => actions.setView("tree")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            >
              <rect x="1.5" y="6" width="4.5" height="4" rx="1.2" />
              <rect x="10" y="2" width="4.5" height="3.2" rx="1" />
              <rect x="10" y="10.8" width="4.5" height="3.2" rx="1" />
              <path d="M6 8h1.8M7.8 3.6V12.4M7.8 3.6H10M7.8 12.4H10" />
            </svg>
          </button>
          <button
            className={outline ? "active" : ""}
            aria-label="목록 보기"
            title="목록 보기"
            aria-pressed={outline}
            onClick={() => actions.setView("outline")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            >
              <path d="M5.5 3.5h9M8 8h6.5M8 12.5h6.5" />
              <circle cx="2.5" cy="3.5" r="0.9" fill="currentColor" stroke="none" />
              <circle cx="5" cy="8" r="0.9" fill="currentColor" stroke="none" />
              <circle cx="5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
      </div>
      {!outline && (
        <div className="tree-controls tree-zoom">
          <button aria-label="축소" onClick={() => zoomBy(1 / 1.2)}>
            −
          </button>
          <span>{Math.round(view.scale * 100)}%</span>
          <button aria-label="확대" onClick={() => zoomBy(1.2)}>
            +
          </button>
          <button onClick={fit}>맞춤</button>
        </div>
      )}
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>
          {ghost.title}
        </div>
      )}
      {menu && (
        <div
          className="context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y, width: MENU_WIDTH }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              onRemove(menu.id);
              focusPane();
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

interface NodeInputProps {
  initial: string;
  /** 폭이 정해진 항목은 글 길이와 상관없이 항목을 꽉 채운다. */
  fill: boolean;
  onCommit: (title: string) => void;
  onCommitAndAddChild: (title: string) => void;
  onCancel: () => void;
}

function NodeInput({ initial, fill, onCommit, onCommitAndAddChild, onCancel }: NodeInputProps) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const ref = useAutoHeight(value);
  const longestLine = Math.max(...value.split("\n").map((line) => line.length), 4);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  const once = (fn: () => void) => {
    if (finished.current) return;
    finished.current = true;
    fn();
  };

  return (
    <textarea
      ref={ref}
      className="node-input"
      rows={1}
      value={value}
      placeholder="제목 없음"
      style={
        fill ? { width: "100%", minWidth: 0, maxWidth: "none" } : { width: `${longestLine + 1}em` }
      }
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => once(() => onCommit(value))}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        // 한글 조합 중의 Enter는 글자를 확정하는 키라서 입력 완료로 보지 않는다.
        // Shift+Enter는 입력칸 기본 동작대로 줄을 바꾼다.
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          once(() => onCommit(e.currentTarget.value));
        } else if (e.key === "Tab") {
          e.preventDefault();
          once(() => onCommitAndAddChild(e.currentTarget.value));
        } else if (e.key === "Escape") {
          once(onCancel);
        }
      }}
    />
  );
}
