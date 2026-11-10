import { describe, expect, it } from "vitest";
import { createTopic, type Topic } from "./tree";
import {
  addGroup,
  moveGroup,
  moveTopic,
  normalizeGroups,
  removeGroup,
  topicsIn,
  type Workspace,
} from "./workspace";

function sample() {
  // 그룹 밖: a, b / g1: c / g2: (비어 있음)
  const [a, b, c] = ["a", "b", "c"].map((title) => createTopic(title));
  let w: Workspace = { topics: [a, b, c], groups: [], activeId: a.id };
  const r1 = addGroup(w);
  const r2 = addGroup(r1.workspace);
  w = r2.workspace;
  w = { ...w, topics: w.topics.map((t) => (t.id === c.id ? { ...t, groupId: r1.id } : t)) };
  return { w, a: a.id, b: b.id, c: c.id, g1: r1.id, g2: r2.id };
}

const ids = (topics: Topic[]) => topics.map((t) => t.id);

describe("주제 옮기기", () => {
  it("그룹 머리에 놓으면 그 그룹 맨 끝으로 간다", () => {
    const { w, a, c, g1 } = sample();
    const next = moveTopic(w, a, g1, null);
    expect(ids(topicsIn(next, g1))).toEqual([c, a]);
  });

  it("빈 그룹에도 넣을 수 있다", () => {
    const { w, a, g2 } = sample();
    expect(ids(topicsIn(moveTopic(w, a, g2, null), g2))).toEqual([a]);
  });

  it("주제 앞에 놓으면 그 자리로 간다", () => {
    const { w, a, c, g1 } = sample();
    const next = moveTopic(w, a, g1, c);
    expect(ids(topicsIn(next, g1))).toEqual([a, c]);
  });

  it("그룹 밖으로 빼고 순서도 바꾼다", () => {
    const { w, a, b, c } = sample();
    const next = moveTopic(w, c, null, a);
    expect(ids(topicsIn(next, null))).toEqual([c, a, b]);
    expect(next.topics.find((t) => t.id === c)!.groupId).toBeUndefined();
  });

  it("자기 앞에 놓으면 그대로다", () => {
    const { w, a } = sample();
    expect(moveTopic(w, a, null, a)).toBe(w);
  });
});

describe("그룹", () => {
  it("그룹을 지우면 안의 주제는 그룹 밖으로 나온다", () => {
    const { w, c, g1 } = sample();
    const next = removeGroup(w, g1);
    expect(next.groups.map((g) => g.id)).not.toContain(g1);
    expect(ids(topicsIn(next, null))).toContain(c);
  });

  it("그룹 순서를 바꾼다", () => {
    const { w, g1, g2 } = sample();
    expect(moveGroup(w, g2, g1).groups.map((g) => g.id)).toEqual([g2, g1]);
    expect(moveGroup(w, g1, null).groups.map((g) => g.id)).toEqual([g2, g1]);
  });

  it("그룹이 없던 데이터와 사라진 그룹을 가리키는 주제를 바로잡는다", () => {
    const { w, c } = sample();
    const old = { ...w, groups: undefined } as unknown as Workspace;
    const fixed = normalizeGroups(old);
    expect(fixed.groups).toEqual([]);
    expect(fixed.topics.find((t) => t.id === c)!.groupId).toBeUndefined();
  });
});
