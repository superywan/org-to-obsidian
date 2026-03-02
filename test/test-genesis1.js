/**
 * 창세기 1장 단독 임포트 테스트
 *
 * 실제 server.js 임포트 플로우와 동일:
 *  1. docid-map.json 로드
 *  2. Phase 1: buildBibleMappings (전체 66권 매핑)
 *  3. docid-map.json 저장
 *  4. Phase 2: importBible (창세기 1장만)
 *  5. docid-map.json 재저장
 *  6. 결과 MD 파일 분석
 */
import { buildBibleMappings, importBible } from "./importers/bible.js";
import { loadMap, saveMap } from "./docid-map.js";
import fs from "fs";
import { VAULT_ORG_BIBLE_PATH } from "./constant.js";

const start = Date.now();
const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`;

// ─── Phase 1: 전체 성경 매핑 (다른 책 참조 성구 해석용) ───
console.log("=== Phase 1: 전체 성경 매핑 구축 ===");
const docidMap = loadMap();
const mapBefore = Object.keys(docidMap).length;
const prepared = await buildBibleMappings(docidMap, null);
saveMap(docidMap);
const mapAfter = Object.keys(docidMap).length;
console.log(`매핑: ${mapBefore} → ${mapAfter}개 (${elapsed()})`);

// ─── Phase 2: 창세기 1장만 임포트 ───
console.log("\n=== Phase 2: 창세기 1장 임포트 ===");
const genesisOnly = {
  ...prepared,
  books: prepared.books
    .filter((b) => b.num === 1)
    .map((b) => ({ ...b, chapters: 1 })),
  includeAppendix: false,
};

// 1장만 테스트 (소개/개요 건너뜀)
const basePath = prepared.bookPathMap[1].basePath;
const targetPath = basePath + "창세기 1장.md";
const introPath = basePath + "소개.md";
const outlinePath = basePath + "개요.md";

// 1장 기존 파일 삭제 (새로 생성)
if (fs.existsSync(targetPath)) {
  fs.unlinkSync(targetPath);
  console.log(`기존 파일 삭제: ${targetPath.split("/").slice(-2).join("/")}`);
}

// 소개/개요는 listOfExistingFiles에 넣어서 건너뛰기
const skipFiles = {};
skipFiles[introPath] = true;
skipFiles[outlinePath] = true;

console.log(`1장만 가져오는 중... (소개/개요 건너뜀)`);
await importBible(skipFiles, docidMap, genesisOnly);
saveMap(docidMap);

console.log(`\n=== 완료 (${elapsed()}) ===`);

// ─── 결과 분석 ───
if (fs.existsSync(targetPath)) {
  const content = fs.readFileSync(targetPath, "utf-8");
  console.log(`\n📄 파일: ${targetPath}`);
  console.log(`   크기: ${content.length}자, ${content.split("\n").length}줄`);

  // 위키링크 추출
  const wikilinks = content.match(/\[\[.*?\]\]/g) || [];
  const unique = [...new Set(wikilinks)];
  console.log(`\n🔗 위키링크 ${wikilinks.length}개 (고유 ${unique.length}개):`);
  unique.slice(0, 30).forEach((l) => console.log(`  ${l}`));
  if (unique.length > 30) console.log(`  ... 외 ${unique.length - 30}개`);

  // 첫 5절만 미리보기
  console.log("\n📖 내용 미리보기 (첫 5절):");
  const lines = content.split("\n");
  let verseCount = 0;
  for (const line of lines) {
    if (line.startsWith("**") && /^\*\*\d+\*\*/.test(line)) {
      verseCount++;
      console.log(`  ${line.substring(0, 120)}${line.length > 120 ? "..." : ""}`);
      if (verseCount >= 5) break;
    }
  }
} else {
  console.error("파일이 생성되지 않았습니다!");
}

// 소개/개요도 확인
for (const [label, p] of [["소개", introPath], ["개요", outlinePath]]) {
  if (fs.existsSync(p)) {
    const c = fs.readFileSync(p, "utf-8");
    console.log(`\n📄 ${label}: ${c.length}자`);
  }
}
