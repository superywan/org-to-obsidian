// cl 출판물 전체 프로덕션 테스트 — 실패 아티클 상세 분석
import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

const resp = await axios.get("https://wol.jw.org/ko/wol/publication/r8/lp-ko/cl", { headers, timeout: 30000 });
const $ = cheerio.load(resp.data);
const articles = [];
$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  const m = href.match(/\/wol\/d\/r8\/lp-ko\/(\d+)/);
  if (m && !articles.find(a => a.docId === m[1])) {
    articles.push({ docId: m[1], text: $(el).text().trim().substring(0, 40) });
  }
});

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
    if (unlinked.length > 0) {
      console.log(`[${art.docId}] bc:${bcCount} wiki:${wikiCount} FAIL(${unlinked.length}) — ${art.text}`);
      unlinked.slice(0, 3).forEach(t => {
        console.log(`  "${t}"`);
        // content에서 실제로 어떻게 나오는지
        const idx = normalizedContent.indexOf(normalizedText.replace(/\u00A0/g, " ").substring(0, 5));
        if (idx >= 0) {
          console.log(`    → ...${normalizedContent.substring(Math.max(0,idx-20), idx+60)}...`);
        }
        allFailures.push(t);
      });
      if (unlinked.length > 3) {
        unlinked.slice(3).forEach(t => allFailures.push(t));
        console.log(`  ... 외 ${unlinked.length - 3}개`);
      }
    }
  } catch (e) { /* skip */ }
}

console.log(`\n=== 종합 ===`);
console.log(`bc:${totalBc} wiki:${totalWiki} 미링크:${totalUnlinked}`);
// 실패 패턴 분석
const patterns = {};
for (const f of allFailures) {
  if (/탈출/.test(f)) patterns["탈출(Exodus)"] = (patterns["탈출(Exodus)"] || 0) + 1;
  else if (/열왕기/.test(f)) patterns["열왕기"] = (patterns["열왕기"] || 0) + 1;
  else if (/요한 \d서/.test(f)) patterns["요한N서"] = (patterns["요한N서"] || 0) + 1;
  else patterns[f.substring(0, 15)] = (patterns[f.substring(0, 15)] || 0) + 1;
}
console.log(`\n실패 패턴:`);
Object.entries(patterns).sort((a,b) => b[1]-a[1]).slice(0, 20).forEach(([k,v]) => console.log(`  ${v}x ${k}`));
