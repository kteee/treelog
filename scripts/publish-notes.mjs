// 공개 빌드에 올릴 노트를 준비한다.
// 사용법: npm run notes            → 다운로드 폴더에서 가장 최근 백업 파일을 쓴다
//         npm run notes -- <파일>  → 지정한 백업 파일을 쓴다
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const target = resolve("public", "notes.json");

function newestBackup() {
  const dir = join(homedir(), "Downloads");
  const files = readdirSync(dir)
    .filter((f) => /^(treelog|logic-note)-backup-.*\.json$/.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (files.length === 0) {
    throw new Error(`${dir}에 treelog-backup-*.json 파일이 없어요. 앱에서 '백업 내보내기'를 먼저 해 주세요.`);
  }
  return files[0];
}

const source = process.argv[2] ? resolve(process.argv[2]) : newestBackup();
const backup = JSON.parse(readFileSync(source, "utf8"));
const topics = backup?.workspace?.topics;
// 백업 안의 앱 표시는 예전 이름(logic-note) 그대로다.
if (backup?.app !== "logic-note" || !Array.isArray(topics) || topics.length === 0) {
  throw new Error(`${source}는 트리로그 백업 파일이 아니에요.`);
}

mkdirSync("public", { recursive: true });
copyFileSync(source, target);
const docs = Object.keys(backup.docs ?? {}).length;
const kb = Math.round(statSync(target).size / 1024);
console.log(`${source}\n→ ${target}\n주제 ${topics.length}개, 문서 ${docs}개, ${kb}KB`);
