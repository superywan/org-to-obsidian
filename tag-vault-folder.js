// tag-vault-folder.js
// ─────────────────────────────────────────────────────────────
// 옵시디언 볼트의 특정 폴더(기본: tagging/) 안 .md 파일을 스캔해
// 성경 구절 패턴에 성구 태그(+성경 wikilink)를 추가한다.
// 임포터가 쓰는 성구 태깅 로직(addScriptureTags)을 그대로 재사용한다.
//
// 사용법:
//   node tag-vault-folder.js                 # 볼트의 tagging/ 폴더, 파일에 바로 적용
//   node tag-vault-folder.js --dry-run       # 미리보기만 (파일 수정 안 함)
//   node tag-vault-folder.js "메모/성구노트"  # 폴더 지정(볼트 기준 상대경로) 또는 절대경로
//
// 재실행 안전: 기존 [[wikilink]]는 보호되어 다시 태깅되지 않는다.
// docid-map에 성경 장(b:책:장) 키가 있으면 wikilink+태그, 없으면 태그만 추가.
// ─────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";

import { VAULT_BASE } from "./constant.js";
import { loadMap, addScriptureTags } from "./docid-map.js";

// ── 인자 파싱 ──────────────────────────────
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const folderArg = argv.find((a) => !a.startsWith("--"));

const targetFolder = folderArg
  ? path.isAbsolute(folderArg)
    ? folderArg
    : path.join(VAULT_BASE, folderArg)
  : path.join(VAULT_BASE, "tagging");

// ── .md 파일 재귀 수집 ─────────────────────
const collectMd = (dir, out = []) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectMd(full, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
};

// ── 기존 [[wikilink]] 보호 후 성구 태깅 (재실행 안전) ──
// U+FFFC(OBJECT REPLACEMENT CHARACTER)를 자리표시자 구분자로 사용한다.
// 자연 텍스트에 나타나지 않고, 성구 정규식(책이름+공백+숫자)과도 겹치지 않아
// wikilink 내부 표시 텍스트("로마서 15:19")가 다시 매칭되는 것을 막는다.
const SENT = String.fromCharCode(0xfffc);
const tagContent = (content, docidMap) => {
  const links = [];
  const masked = content.replace(/\[\[[^\[\]]*\]\]/g, (m) => {
    links.push(m);
    return SENT + (links.length - 1) + SENT;
  });

  let tagged = addScriptureTags(masked, docidMap);

  // 인접 중복 성구 태그 정리 (사용자가 이미 붙여둔 태그 + 새 태그가 겹칠 때)
  tagged = tagged.replace(/(#성구\/[^\s#]+)(?:\s+\1\b)+/g, "$1");

  // wikilink 복원
  const restore = new RegExp(SENT + "(\\d+)" + SENT, "g");
  return tagged.replace(restore, (_, i) => links[Number(i)]);
};

// ── 실행 ──────────────────────────────────
console.log("대상 폴더: " + targetFolder);
if (!fs.existsSync(targetFolder)) {
  console.error(
    "\n❌ 폴더가 없습니다. 볼트에 폴더를 만들고 .md 파일을 넣은 뒤 다시 실행하세요:\n   " +
      targetFolder +
      "\n"
  );
  process.exit(1);
}

const docidMap = loadMap();

// 사전 점검 — book-name-map / 성경 매핑 상태
if (!addScriptureTags("창세기 1:1", docidMap).includes("#성구")) {
  console.warn(
    "⚠️  book-name-map이 비어 있어 '창세기' 같은 정식 책이름이 인식되지 않습니다.\n" +
      "    성경 임포트를 먼저 완료해야 정확히 태깅됩니다 (약어는 일부 인식될 수 있음)."
  );
}
if (!Object.keys(docidMap).some((k) => k.startsWith("b:"))) {
  console.warn(
    "⚠️  docid-map에 성경 장(b:책:장) 키가 없어 wikilink 없이 태그만 추가됩니다.\n" +
      "    성경 임포트 완료 후 실행하면 wikilink까지 생성됩니다."
  );
}

const files = collectMd(targetFolder);
console.log(
  files.length + "개 .md 파일 발견" + (dryRun ? "  (dry-run: 파일 수정 안 함)" : "") + "\n"
);

let changedFiles = 0;
let totalTagsAdded = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf-8");
  const after = tagContent(before, docidMap);
  if (after === before) continue;

  const added =
    (after.match(/#성구\//g) || []).length -
    (before.match(/#성구\//g) || []).length;
  changedFiles++;
  totalTagsAdded += added;

  const rel = path.relative(VAULT_BASE, file);
  console.log("  " + (dryRun ? "[미리보기]" : "✍️ ") + " " + rel + "  (+" + added + " 태그)");
  if (!dryRun) fs.writeFileSync(file, after);
}

console.log(
  "\n완료: " +
    changedFiles +
    "개 파일 변경, 총 +" +
    totalTagsAdded +
    "개 성구 태그" +
    (dryRun ? "  (실제 적용 안 됨 — --dry-run)" : "")
);
