// ka 출판물 프로덕션 테스트
import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

const resp = await axios.get("https://wol.jw.org/ko/wol/publication/r8/lp-ko/ka", { headers, timeout: 30000 });
const $ = cheerio.load(resp.data);
const articles = [];
$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  const m = href.match(/\/wol\/d\/r8\/lp-ko\/(\d+)/);
  if (m && !articles.find(a => a.docId === m[1])) {
    articles.push({ docId: m[1], text: $(el).text().trim().substring(0, 50) });
  }
});
console.log(`ka 출판물 아티클: ${articles.length}개\n`);

let totalBc = 0, totalWiki = 0, totalUnlinked = 0;
const allFailures = [];

for (const art of articles) {
  try {
    const html = await getPublicationArticleAPI(art.docId);
    const content = await parseArticleContent(html, docidMap);

    const $h = cheerio.load(html);
    let bcCount = 0;
    const bcTexts = [];
    $h("a").each((_, el) => {
      const href = $h(el).attr("href") || "";
      if (!href.includes("/wol/bc/")) return;
      bcCount++;
      bcTexts.push($h(el).text().trim());
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

    totalBc += bcCount;
    totalWiki += wikiCount;
    totalUnlinked += unlinked.length;

    const status = unlinked.length === 0 ? "OK" : `FAIL(${unlinked.length})`;
    console.log(`[${art.docId}] bc:${bcCount} wiki:${wikiCount} ${status} — ${art.text}`);
    if (unlinked.length > 0) {
      unlinked.forEach(t => {
        console.log(`  미링크: "${t}"`);
        allFailures.push({ docId: art.docId, text: t });
      });
    }
  } catch (e) {
    console.log(`[${art.docId}] 에러: ${e.message?.substring(0, 60)}`);
  }
}

console.log(`\n=== 종합 ===`);
console.log(`총 bc 링크: ${totalBc}`);
console.log(`총 wikilink: ${totalWiki}`);
console.log(`총 미링크: ${totalUnlinked}`);
if (allFailures.length > 0) {
  console.log(`\n전체 실패 목록:`);
  allFailures.forEach(f => console.log(`  [${f.docId}] "${f.text}"`));
}
