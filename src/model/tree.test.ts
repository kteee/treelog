import { describe, expect, it } from "vitest";
import {
  addChild,
  addSibling,
  assignBranchColors,
  BRANCH_COLORS,
  createTopic,
  moveNode,
  neighbor,
  outlineNeighbor,
  outlineOrder,
  removeNode,
  renameNode,
  selectNode,
  toggleCollapsed,
  resizeNode,
  type Topic,
} from "./tree";

function sample() {
  // root ─ a ─ a1
  //      │   └ a2
  //      └ b
  let topic: Topic = createTopic("root");
  const root = topic.rootId;
  const add = (parent: string, title: string) => {
    const r = addChild(topic, parent, "right");
    topic = renameNode(r.topic, r.id, title);
    return r.id;
  };
  const a = add(root, "a");
  const b = add(root, "b");
  const a1 = add(a, "a1");
  const a2 = add(a, "a2");
  return { topic, root, a, b, a1, a2 };
}

describe("추가", () => {
  it("형제는 바로 다음 자리에 들어간다", () => {
    const { topic, root, a, b } = sample();
    const r = addSibling(topic, a);
    expect(r.topic.nodes[root].children).toEqual([a, r.id, b]);
    expect(r.topic.selectedId).toBe(r.id);
  });

  it("루트의 형제 추가는 자식 추가가 된다", () => {
    const { topic, root } = sample();
    const r = addSibling(topic, root);
    expect(r.topic.nodes[r.id].parent).toBe(root);
  });
});

describe("삭제", () => {
  it("하위 항목까지 함께 지운다", () => {
    const { topic, a, a1, a2 } = sample();
    const next = removeNode(topic, a);
    for (const id of [a, a1, a2]) expect(next.nodes[id]).toBeUndefined();
  });

  it("루트는 지울 수 없다", () => {
    const { topic, root } = sample();
    expect(removeNode(topic, root)).toBe(topic);
  });

  it("선택된 항목이 지워지면 옆 형제로 옮긴다", () => {
    const { topic, a1, a2 } = sample();
    const next = removeNode({ ...topic, selectedId: a1 }, a1);
    expect(next.selectedId).toBe(a2);
  });

  it("선택이 지워진 가지 안에 있으면 살아남은 항목으로 옮긴다", () => {
    const { topic, a, a1, b } = sample();
    const next = removeNode({ ...topic, selectedId: a1 }, a);
    expect(next.selectedId).toBe(b);
  });
});

describe("이동", () => {
  it("다른 부모 안으로 옮긴다", () => {
    const { topic, a, b, a1, a2 } = sample();
    const next = moveNode(topic, a1, b, "inside");
    expect(next.nodes[b].children).toEqual([a1]);
    expect(next.nodes[a].children).toEqual([a2]);
    expect(next.nodes[a1].parent).toBe(b);
  });

  it("같은 부모 안에서 순서를 바꾼다", () => {
    const { topic, a, a1, a2 } = sample();
    expect(moveNode(topic, a2, a1, "before").nodes[a].children).toEqual([a2, a1]);
    expect(moveNode(topic, a1, a2, "after").nodes[a].children).toEqual([a2, a1]);
  });

  it("자기 하위로는 옮길 수 없다", () => {
    const { topic, a, a1 } = sample();
    expect(moveNode(topic, a, a1, "inside")).toBe(topic);
    expect(moveNode(topic, a, a, "inside")).toBe(topic);
  });

  it("루트는 옮길 수 없고 루트 옆에도 놓을 수 없다", () => {
    const { topic, root, a, b } = sample();
    expect(moveNode(topic, root, a, "inside")).toBe(topic);
    expect(moveNode(topic, b, root, "before")).toBe(topic);
  });
});

describe("좌우 방향", () => {
  it("루트에 방향 없이 추가하면 적은 쪽으로 간다", () => {
    const { topic, root } = sample();
    const r = addChild(topic, root);
    expect(r.topic.nodes[r.id].side).toBe("left");
    const r2 = addChild(r.topic, root);
    expect(r2.topic.nodes[r2.id].side).toBe("left");
    const r3 = addChild(r2.topic, root);
    expect(r3.topic.nodes[r3.id].side).toBe("right");
  });

  it("지정한 쪽으로 추가하고 형제는 같은 쪽에 생긴다", () => {
    const { topic, root } = sample();
    const r = addChild(topic, root, "left");
    const s = addSibling(r.topic, r.id);
    expect(s.topic.nodes[s.id].side).toBe("left");
  });

  it("루트 안으로 옮기면 지정한 쪽으로 간다", () => {
    const { topic, root, a, a1 } = sample();
    const moved = moveNode(topic, a1, root, "inside", "left");
    expect(moved.nodes[a1].side).toBe("left");
    expect(moveNode(topic, a, root, "inside", "left").nodes[a].side).toBe("left");
  });

  it("왼쪽 항목 옆에 놓으면 왼쪽이 되고 깊이 들어가면 방향을 잃는다", () => {
    const { topic, root, a, b, a1 } = sample();
    const r = addChild(topic, root, "left");
    expect(moveNode(r.topic, a1, r.id, "before").nodes[a1].side).toBe("left");
    expect(moveNode(r.topic, b, a, "inside").nodes[b].side).toBeUndefined();
  });

  it("왼쪽에서는 키보드 방향이 뒤집힌다", () => {
    const { topic, root } = sample();
    const l = addChild(topic, root, "left");
    const c = addChild(l.topic, l.id);
    expect(neighbor(c.topic, root, "left")).toBe(l.id);
    expect(neighbor(c.topic, l.id, "left")).toBe(c.id);
    expect(neighbor(c.topic, l.id, "right")).toBe(root);
  });

  it("위아래 이동은 반대쪽으로 넘어가지 않는다", () => {
    const { topic, root, a } = sample();
    const l = addChild(topic, root, "left");
    expect(neighbor(l.topic, a, "up")).toBe(a);
    expect(neighbor(l.topic, l.id, "down")).toBe(l.id);
  });
});

describe("대주제 색", () => {
  it("대주제마다 다른 색을 받고 하위 항목은 색을 저장하지 않는다", () => {
    const { topic, a, b, a1 } = sample();
    expect(topic.nodes[a].color).not.toBe(topic.nodes[b].color);
    expect(topic.nodes[a1].color).toBeUndefined();
  });

  it("다른 대주제를 지워도 색이 그대로고 빈 색을 다시 쓴다", () => {
    const { topic, root, a, b } = sample();
    const before = topic.nodes[b].color;
    const next = removeNode(topic, a);
    expect(next.nodes[b].color).toBe(before);
    const r = addChild(next, root);
    expect(r.topic.nodes[r.id].color).toBe(topic.nodes[a].color);
  });

  it("다 쓰면 색을 다시 돌려 쓴다", () => {
    let topic: Topic = createTopic("root");
    const ids: string[] = [];
    for (let i = 0; i <= BRANCH_COLORS.length; i++) {
      const r = addChild(topic, topic.rootId);
      topic = r.topic;
      ids.push(r.id);
    }
    expect(topic.nodes[ids[BRANCH_COLORS.length]].color).toBe(0);
  });

  it("같은 루트 안에서 옮기면 색을 유지하고 깊이 들어가면 잃는다", () => {
    const { topic, root, a, b, a1 } = sample();
    const before = topic.nodes[a].color;
    expect(moveNode(topic, a, root, "inside", "left").nodes[a].color).toBe(before);
    expect(moveNode(topic, b, a, "inside").nodes[b].color).toBeUndefined();
    const up = moveNode(topic, a1, root, "inside", "left");
    expect(up.nodes[a1].color).toBe(2);
  });

  function withColors(topic: Topic, colors: Record<string, number | undefined>): Topic {
    const nodes = { ...topic.nodes };
    for (const [id, color] of Object.entries(colors)) nodes[id] = { ...nodes[id], color };
    return { ...topic, nodes };
  }

  it("대주제를 하나씩 전부 반대쪽으로 옮겨도 색이 겹치지 않는다", () => {
    const { topic, root, a, b } = sample();
    const third = addChild(topic, root, "right");
    let moved = third.topic;
    for (const id of [a, b, third.id]) moved = moveNode(moved, id, root, "inside", "left");
    const colors = [a, b, third.id].map((id) => moved.nodes[id].color);
    expect(new Set(colors).size).toBe(3);
  });

  it("색 없이 저장된 대주제는 불러올 때 서로 다른 색을 받고 옮겨도 유지한다", () => {
    const { topic, root, a, b } = sample();
    const loaded = assignBranchColors(withColors(topic, { [a]: undefined, [b]: undefined }));
    expect(loaded.nodes[a].color).toBe(0);
    expect(loaded.nodes[b].color).toBe(1);
    const moved = moveNode(loaded, a, root, "inside", "left");
    expect(moved.nodes[a].color).toBe(0);
    expect(moved.nodes[b].color).toBe(1);
  });

  it("같은 색으로 겹쳐 저장된 대주제를 불러오면 다시 나눈다", () => {
    const { topic, a, b } = sample();
    const loaded = assignBranchColors(withColors(topic, { [a]: 0, [b]: 0 }));
    expect(loaded.nodes[a].color).toBe(0);
    expect(loaded.nodes[b].color).toBe(1);
  });

  it("색이 이미 서로 다르면 건드리지 않는다", () => {
    const { topic } = sample();
    expect(assignBranchColors(topic)).toBe(topic);
  });

  it("대주제가 색보다 많을 때만 겹치는 걸 허용한다", () => {
    let topic: Topic = createTopic("root");
    for (let i = 0; i <= BRANCH_COLORS.length; i++) topic = addChild(topic, topic.rootId).topic;
    expect(assignBranchColors(topic)).toBe(topic);
  });
});

describe("항목 폭", () => {
  it("정한 폭을 저장하고 비우면 글 길이에 맞추는 상태로 돌아간다", () => {
    const { topic, a } = sample();
    const wide = resizeNode(topic, a, 320);
    expect(wide.nodes[a].width).toBe(320);
    expect(resizeNode(wide, a).nodes[a].width).toBeUndefined();
  });

  it("너무 좁거나 넓게는 만들 수 없다", () => {
    const { topic, a } = sample();
    expect(resizeNode(topic, a, 1).nodes[a].width).toBe(60);
    expect(resizeNode(topic, a, 9999).nodes[a].width).toBe(640);
  });

  it("폭이 그대로면 새 상태를 만들지 않는다", () => {
    const { topic, a } = sample();
    const wide = resizeNode(topic, a, 320);
    expect(resizeNode(wide, a, 320)).toBe(wide);
    expect(resizeNode(topic, a)).toBe(topic);
  });

  it("옮겨도 폭을 유지한다", () => {
    const { topic, a, b } = sample();
    const wide = resizeNode(topic, a, 320);
    expect(moveNode(wide, a, b, "inside").nodes[a].width).toBe(320);
  });
});

describe("접기", () => {
  it("하위가 있는 항목만 접고 다시 펼 수 있다", () => {
    const { topic, a, b } = sample();
    const folded = toggleCollapsed(topic, a);
    expect(folded.nodes[a].collapsed).toBe(true);
    expect(toggleCollapsed(folded, a).nodes[a].collapsed).toBe(false);
    expect(toggleCollapsed(topic, b)).toBe(topic);
    expect(toggleCollapsed(topic, topic.rootId)).toBe(topic);
  });

  it("선택이 접히는 가지 안에 있으면 접는 항목으로 옮긴다", () => {
    const { topic, a, a1 } = sample();
    expect(toggleCollapsed({ ...topic, selectedId: a1 }, a).selectedId).toBe(a);
  });

  it("접힌 곳 안의 항목을 고르면 펼친다", () => {
    const { topic, a, a1 } = sample();
    const next = selectNode(toggleCollapsed(topic, a), a1);
    expect(next.selectedId).toBe(a1);
    expect(next.nodes[a].collapsed).toBe(false);
  });

  it("접힌 항목에 하위를 더하거나 안으로 옮기면 펼친다", () => {
    const { topic, a, b } = sample();
    const folded = toggleCollapsed(topic, a);
    expect(addChild(folded, a).topic.nodes[a].collapsed).toBe(false);
    expect(moveNode(folded, b, a, "inside").nodes[a].collapsed).toBe(false);
  });

  it("방향키는 접힌 하위를 건너뛴다", () => {
    const { topic, root, a, b } = sample();
    const folded = toggleCollapsed(topic, a);
    expect(outlineOrder(folded, true)).toEqual([root, a, b]);
    expect(outlineNeighbor(folded, a, "down")).toBe(b);
    expect(outlineNeighbor(folded, a, "right")).toBe(a);
    expect(neighbor(folded, a, "right")).toBe(a);
  });
});

describe("목록형 이동", () => {
  it("위아래는 보이는 순서대로 깊이를 넘나든다", () => {
    const { topic, root, a, b, a1, a2 } = sample();
    expect(outlineOrder(topic)).toEqual([root, a, a1, a2, b]);
    expect(outlineNeighbor(topic, a, "down")).toBe(a1);
    expect(outlineNeighbor(topic, a2, "down")).toBe(b);
    expect(outlineNeighbor(topic, b, "up")).toBe(a2);
    expect(outlineNeighbor(topic, b, "down")).toBe(b);
    expect(outlineNeighbor(topic, root, "up")).toBe(root);
  });

  it("왼쪽은 상위, 오른쪽은 첫 하위로 간다", () => {
    const { topic, root, a, a1 } = sample();
    expect(outlineNeighbor(topic, a1, "left")).toBe(a);
    expect(outlineNeighbor(topic, root, "left")).toBe(root);
    expect(outlineNeighbor(topic, a, "right")).toBe(a1);
    expect(outlineNeighbor(topic, a1, "right")).toBe(a1);
  });
});

describe("방향 이동", () => {
  it("좌우는 부모와 첫 자식으로 간다", () => {
    const { topic, root, a, a1 } = sample();
    expect(neighbor(topic, a, "left")).toBe(root);
    expect(neighbor(topic, a, "right")).toBe(a1);
  });

  it("위아래는 같은 깊이에서 움직이고 끝에선 멈춘다", () => {
    const { topic, a, b, a1, a2 } = sample();
    expect(neighbor(topic, a, "down")).toBe(b);
    expect(neighbor(topic, a1, "down")).toBe(a2);
    expect(neighbor(topic, a2, "down")).toBe(a2);
    expect(neighbor(topic, a, "up")).toBe(a);
  });
});
