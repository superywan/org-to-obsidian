/**
 * docId 1204453 기사 파싱 테스트
 * - 블록 ID 생성 확인
 * - pc/tc 리다이렉트 fragment 보존 확인
 * - 결과를 test-output/에 저장
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseArticleContent, loadMap } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "test-output");

console.log("=== docId 1204453 파싱 테스트 ===\n");

// docid-map 로드 (기존 매핑 활용)
const docidMap = loadMap();
console.log(`docid-map 항목 수: ${Object.keys(docidMap).length}\n`);

// HTML 가져오기
console.log("기사 가져오는 중 (1204453)...");
const html = await getPublicationArticleAPI("1204453");
console.log(`HTML 크기: ${html.length}자\n`);

// 파싱
console.log("파싱 중...\n");
const content = await parseArticleContent(html, docidMap);

// 분석
const blockIds = content.match(/\^p\d+/g) || [];
const wikilinks = content.match(/\[\[.*?\]\]/g) || [];
const fragLinks = content.match(/\[\[.*?#\^p\d+\|.*?\]\]/g) || [];
const plainLinks = wikilinks.filter(l => !l.includes("#^p") && !l.includes("#^v"));
const unresolvedTexts = content.match(/(?:통-|파 |깨 |감 |봉 |연 |왕봉)\d/g) || [];

console.log("=== 분석 결과 ===");
console.log(`블록 ID: ${blockIds.length}개`);
console.log(`전체 wikilink: ${wikilinks.length}개`);
console.log(`  - fragment 딥링크 (#^pN): ${fragLinks.length}개`);
console.log(`  - 기사 수준 링크: ${plainLinks.length}개`);
console.log(`  - 미해결 텍스트 (약어+숫자): ${unresolvedTexts.length}개`);

if (fragLinks.length > 0) {
  console.log(`\nfragment 딥링크 샘플 (최대 10개):`);
  for (const link of fragLinks.slice(0, 10)) {
    console.log(`  ${link}`);
  }
}

if (plainLinks.length > 0) {
  console.log(`\n기사 수준 링크 샘플 (최대 10개):`);
  for (const link of plainLinks.slice(0, 10)) {
    console.log(`  ${link}`);
  }
}

// 전체 내용 출력
console.log("\n=== 파싱 결과 전체 ===\n");
console.log(content);

// 파일 저장
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const outPath = path.join(OUTPUT_DIR, "블록ID_색인_1204453.md");
fs.writeFileSync(outPath, content);
console.log(`\n\n저장: ${outPath}`);
