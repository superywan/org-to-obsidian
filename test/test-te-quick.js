// 시편 23편 fix 확인 + te 전체 재테스트
import { loadMap, resolveLink, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";
import * as cheerio from "cheerio";

const docidMap = loadMap();

// 1. 직접 resolveLink 테스트
const result = resolveLink(docidMap, "/wol/bc/r8/lp-ko/fake", "시편 23편", null);
console.log(`resolveLink("시편 23편") → ${result ? result.substring(0, 80) : "NULL"}`);

// 2. 실패했던 아티클 1101971128 프로덕션 테스트
console.log("\n=== 1101971128 프로덕션 테스트 ===");
const html = await getPublicationArticleAPI("1101971128");
const content = await parseArticleContent(html, docidMap);

const $ = cheerio.load(html);
let bcCount = 0;
const bcTexts = [];
$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  if (!href.includes("/wol/bc/")) return;
  bcCount++;
  bcTexts.push($(el).text().trim());
});

const wikiCount = (content.match(/\[\[library\/org-bible\//g) || []).length;
const normalizedContent = content.replace(/\u00A0/g, " ");
const unlinked = [];
for (const text of bcTexts) {
  if (!text) continue;
  const normalizedText = text.replace(/\u00A0/g, " ");
  const escaped = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\[\\[.*?\\|${escaped}\\]\\]`);
  if (!re.test(normalizedContent)) {
    unlinked.push(text);
  }
}

console.log(`bc:${bcCount} wiki:${wikiCount} 미링크:${unlinked.length}`);
if (unlinked.length > 0) {
  unlinked.forEach(t => console.log(`  미링크: "${t}"`));
} else {
  console.log("ALL OK!");
}
