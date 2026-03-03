/**
 * Phase 3: 단락 블록 ID e2e 테스트
 *
 * 1. parseArticleContent() — 블록 ID가 정확히 생성되는지
 * 2. resolveLink() — fragment 파싱이 정상 동작하는지
 * 3. 실제 WOL 기사 fetch → 파싱 → 블록 ID 확인
 * 4. 샘플 출력 파일 생성
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseArticleContent, resolveLink, loadMap } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "test-output");

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
};

// ═══════════════════════════════════════
// 1. parseArticleContent 단위 테스트
// ═══════════════════════════════════════
console.log("\n=== 1. parseArticleContent 블록 ID 테스트 ===\n");

const mockHtml = `
<div id="article">
  <h1 id="p1">제목</h1>
  <p id="p2">첫 번째 단락입니다.</p>
  <p id="p3">두 번째 단락입니다.</p>
  <p>ID 없는 단락입니다.</p>
  <h2 id="p5">소제목</h2>
  <p id="p6">세 번째 단락입니다.</p>
  <ul><li>리스트 항목</li></ul>
  <blockquote>인용문</blockquote>
  <div>
    <p id="p10">중첩된 div 안의 단락</p>
  </div>
</div>
`;

const mockResult = await parseArticleContent(mockHtml, {});
console.log("  파싱 결과:\n");
mockResult.split("\n\n").forEach((line) => console.log(`    ${line}`));
console.log("");

assert(mockResult.includes("# 제목 ^p1"), "h1에 ^p1 블록 ID");
assert(mockResult.includes("첫 번째 단락입니다. ^p2"), "p에 ^p2 블록 ID");
assert(mockResult.includes("두 번째 단락입니다. ^p3"), "p에 ^p3 블록 ID");
assert(mockResult.includes("ID 없는 단락입니다.") && !mockResult.includes("ID 없는 단락입니다. ^"), "ID 없는 p에는 블록 ID 없음");
assert(mockResult.includes("## 소제목 ^p5"), "h2에 ^p5 블록 ID");
assert(mockResult.includes("세 번째 단락입니다. ^p6"), "p에 ^p6 블록 ID");
assert(mockResult.includes("- 리스트 항목"), "리스트 항목은 블록 ID 없음");
assert(mockResult.includes("> 인용문"), "인용문은 블록 ID 없음");
assert(mockResult.includes("중첩된 div 안의 단락 ^p10"), "중첩 div 안의 p에도 ^p10 블록 ID");

// ═══════════════════════════════════════
// 2. resolveLink fragment 파싱 테스트
// ═══════════════════════════════════════
console.log("\n=== 2. resolveLink fragment 파싱 테스트 ===\n");

const testMap = {
  "1102002022": "library/org-books/가까이 가십시오/01. 1장",
  "101999529": "library/org-awake/1999/어떤기사",
  "b:1:3": "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 3장",
};

// 2a. fragment 없는 일반 링크 (하위 호환)
const r1 = resolveLink(testMap, "/ko/wol/d/r8/lp-ko/1102002022", "텍스트");
assert(
  r1 === "[[library/org-books/가까이 가십시오/01. 1장|텍스트]]",
  "fragment 없는 링크: 기존과 동일"
);

// 2b. #pN fragment
const r2 = resolveLink(testMap, "/ko/wol/d/r8/lp-ko/1102002022#p9", "소제목");
assert(
  r2 === "[[library/org-books/가까이 가십시오/01. 1장#^p9|소제목]]",
  "#p9 fragment → #^p9"
);

// 2c. #h=N:... 범위 fragment
const r3 = resolveLink(testMap, "/ko/wol/d/r8/lp-ko/101999529#h=12:0-14:27", "깨어라 기사");
assert(
  r3 === "[[library/org-awake/1999/어떤기사#^p12|깨어라 기사]]",
  "#h=12:0-14:27 → #^p12"
);

// 2d. #h=47-53:0 (네모 참조)
const r4 = resolveLink(testMap, "/ko/wol/d/r8/lp-ko/1102002022#h=47-53:0", "네모");
assert(
  r4 === "[[library/org-books/가까이 가십시오/01. 1장#^p47|네모]]",
  "#h=47-53:0 → #^p47"
);

// 2e. 알 수 없는 fragment → 무시
const r5 = resolveLink(testMap, "/ko/wol/d/r8/lp-ko/1102002022#something", "텍스트");
assert(
  r5 === "[[library/org-books/가까이 가십시오/01. 1장|텍스트]]",
  "알 수 없는 fragment → 무시, 기존과 동일"
);

// 2f. 성경 링크는 fragment 영향 안 받음
const r6 = resolveLink(testMap, "/ko/wol/b/r8/lp-ko/nwtsty/1/3", "창세기 3장");
assert(
  r6 && r6.includes("창세기 3장") && !r6.includes("#^p"),
  "성경 링크는 paragraph fragment 없음"
);

// ═══════════════════════════════════════
// 3. 실제 WOL 기사 fetch → 블록 ID 확인
// ═══════════════════════════════════════
console.log("\n=== 3. 실제 WOL 기사 블록 ID 테스트 ===\n");

const docidMap = loadMap();

// 서적 기사 (CL 1장)
console.log("  서적 기사 (1102002022) 가져오는 중...");
const bookHtml = await getPublicationArticleAPI("1102002022");
const bookContent = await parseArticleContent(bookHtml, docidMap);

const blockIds = bookContent.match(/\^p\d+/g) || [];
console.log(`  블록 ID 개수: ${blockIds.length}`);
assert(blockIds.length > 10, `서적 기사에 10개 이상 블록 ID (실제: ${blockIds.length})`);

// 중복 확인
const uniqueIds = new Set(blockIds);
assert(uniqueIds.size === blockIds.length, `블록 ID 중복 없음 (${uniqueIds.size}/${blockIds.length})`);

// 블록 ID가 줄 끝에 위치하는지
const lines = bookContent.split("\n");
let endOfLine = 0;
for (const line of lines) {
  if (/\^p\d+$/.test(line.trim())) endOfLine++;
}
assert(endOfLine === blockIds.length, `모든 블록 ID가 줄 끝에 위치 (${endOfLine}/${blockIds.length})`);

// 내부 fragment 링크 확인 (기사 내 목차 등)
const fragLinks = bookContent.match(/\[\[.*?#\^p\d+\|.*?\]\]/g) || [];
console.log(`  fragment 포함 wikilink: ${fragLinks.length}개`);
if (fragLinks.length > 0) {
  console.log(`  샘플: ${fragLinks.slice(0, 3).join("\n         ")}`);
}

// ═══════════════════════════════════════
// 4. 샘플 출력 파일 생성
// ═══════════════════════════════════════
console.log("\n=== 4. 샘플 출력 파일 ===\n");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const bookOutPath = path.join(OUTPUT_DIR, "블록ID_서적_CL_1장.md");
fs.writeFileSync(bookOutPath, bookContent);
console.log(`  서적 기사 출력: ${bookOutPath}`);
console.log(`  (${bookContent.length}자, ${blockIds.length}개 블록 ID)`);

// 색인 기사도 파싱
console.log("\n  색인 기사 (1200272288) 가져오는 중...");
const indexHtml = await getPublicationArticleAPI("1200272288");
const indexContent = await parseArticleContent(indexHtml, docidMap);
const indexBlockIds = indexContent.match(/\^p\d+/g) || [];

const indexOutPath = path.join(OUTPUT_DIR, "블록ID_색인_가구.md");
fs.writeFileSync(indexOutPath, indexContent);
console.log(`  색인 기사 출력: ${indexOutPath}`);
console.log(`  (${indexContent.length}자, ${indexBlockIds.length}개 블록 ID)`);

// ═══════════════════════════════════════
// 결과 요약
// ═══════════════════════════════════════
console.log(`\n${"=".repeat(50)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) process.exit(1);

console.log(`
Obsidian에서 테스트하기:
1. test-output/ 의 .md 파일을 Obsidian Vault에 복사
2. 다른 노트에서 [[블록ID_서적_CL_1장#^ 입력
3. 자동완성에 p1, p2, p3... 등이 나타나는지 확인
4. 선택 후 링크를 클릭하면 해당 단락으로 스크롤되는지 확인
`);
