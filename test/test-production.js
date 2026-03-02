// parseArticleContent (프로덕션 코드) 직접 테스트
import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const docidMap = loadMap();
const docId = process.argv[2] || "1101999026";
console.log(`Testing docId: ${docId} (프로덕션 parseArticleContent)`);

const html = await getPublicationArticleAPI(docId);
const content = await parseArticleContent(html, docidMap);

// bc 링크가 걸려야 하는 참조들 찾기 - 원본 HTML에서 bc 링크 수 확인
import * as cheerio from "cheerio";
const $ = cheerio.load(html);
let bcTotal = 0;
const bcTexts = [];
$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  if (!href.includes("/wol/bc/")) return;
  bcTotal++;
  bcTexts.push($(el).text().trim());
});

// parseArticleContent 결과에서 wikilink 수 확인
const wikilinks = (content.match(/\[\[library\/org-bible\//g) || []);
const unlinked = [];
for (const text of bcTexts) {
  if (!text) continue;
  // wikilink에 이 텍스트가 포함되어 있는지 확인
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\[\\[.*?\\|${escaped}\\]\\]`);
  if (!re.test(content)) {
    unlinked.push(text);
  }
}

console.log(`\nbc 링크 총: ${bcTotal}개`);
console.log(`성경 wikilink: ${wikilinks.length}개`);
console.log(`미링크: ${unlinked.length}개`);
if (unlinked.length > 0) {
  console.log(`\n실패 목록:`);
  unlinked.forEach(t => console.log(`  "${t}"`));
}
