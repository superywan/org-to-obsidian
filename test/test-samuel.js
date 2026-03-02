// "사무엘 둘째 22:1," 디버그 + 프로덕션 테스트
import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";
import * as cheerio from "cheerio";

const docidMap = loadMap();

// 1. 직접 parseBibleRef 테스트
const { resolveLink } = await import("../docid-map.js");
const testText = "사무엘 둘째 22:1,";
const result = resolveLink(docidMap, "/wol/bc/r8/lp-ko/fake", testText, null);
console.log(`resolveLink("${testText}") → ${result ? result.substring(0, 80) : "NULL"}`);

// 2. 프로덕션 테스트: 1101999026
console.log("\n=== 1101999026 프로덕션 테스트 ===");
const html = await getPublicationArticleAPI("1101999026");
const content = await parseArticleContent(html, docidMap);

const $ = cheerio.load(html);
let bcTotal = 0;
const bcTexts = [];
$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  if (!href.includes("/wol/bc/")) return;
  bcTotal++;
  bcTexts.push($(el).text().trim());
});

const wikilinks = (content.match(/\[\[library\/org-bible\//g) || []);
const unlinked = [];
for (const text of bcTexts) {
  if (!text) continue;
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\[\\[.*?\\|${escaped}\\]\\]`);
  if (!re.test(content)) {
    unlinked.push(text);
  }
}

console.log(`bc 링크 총: ${bcTotal}개`);
console.log(`성경 wikilink: ${wikilinks.length}개`);
console.log(`미링크: ${unlinked.length}개`);
if (unlinked.length > 0) {
  console.log(`\n실패 목록:`);
  unlinked.forEach(t => {
    console.log(`  "${t}"`);
    // 해당 텍스트가 content에서 어떻게 나오는지 확인
    const idx = content.indexOf(t);
    if (idx >= 0) {
      console.log(`    → content에서 발견: ...${content.substring(Math.max(0, idx - 20), idx + t.length + 30)}...`);
    }
  });
}
