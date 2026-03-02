// cl 출판물 실패 원인 디버그
import { loadMap, resolveLink, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";
import * as cheerio from "cheerio";

const docidMap = loadMap();

// 직접 resolveLink 테스트
const tests = ["잠언 27:11;", "요한복음 5:21", "이사야 30:20;", "신명기 32:4", "마태 9:9;"];
for (const t of tests) {
  const r = resolveLink(docidMap, "/wol/bc/r8/lp-ko/fake", t, null);
  console.log(`resolveLink("${t}") → ${r ? "OK" : "NULL"}`);
}

// cl 첫번째 아티클에서 실제 실패 확인
const html = await getPublicationArticleAPI("1102017086"); // cl 1장
const $ = cheerio.load(html);

// 실패하는 링크의 실제 텍스트 분석
let count = 0;
$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  if (!href.includes("/wol/bc/")) return;
  const text = $(el).text().trim();
  const result = resolveLink(docidMap, href, text, null);
  if (!result && count < 10) {
    count++;
    console.log(`\n실패: "${text}"`);
    console.log(`  길이: ${text.length}`);
    console.log(`  charCodes: ${[...text].map(c => c.codePointAt(0).toString(16)).join(" ")}`);
    console.log(`  href: ${href.substring(0, 80)}`);
  }
});
if (count === 0) console.log("\n모든 링크 해결 성공!");
