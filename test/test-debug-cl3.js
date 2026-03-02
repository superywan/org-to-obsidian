// cl 실패 아티클 직접 디버그 — bc 링크가 있는 아티클 찾기
import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, parseArticleContent, resolveLink } from "../docid-map.js";
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
    articles.push({ docId: m[1] });
  }
});

// bc 링크가 있는 첫 아티클 찾기
for (const art of articles) {
  const html = await getPublicationArticleAPI(art.docId);
  const $h = cheerio.load(html);
  let hasBc = false;
  $h("a").each((_, el) => {
    if ($h(el).attr("href")?.includes("/wol/bc/")) hasBc = true;
  });
  if (!hasBc) continue;

  console.log(`\n=== ${art.docId} (bc 링크 있음) ===`);
  const content = await parseArticleContent(html, docidMap);

  const normalizedContent = content.replace(/\u00A0/g, " ");
  let failures = 0;
  $h("a").each((_, el) => {
    const href = $h(el).attr("href") || "";
    if (!href.includes("/wol/bc/")) return;
    const text = $h(el).text().trim();

    // 1. resolveLink 직접 확인
    const directResult = resolveLink(docidMap, href, text, null);

    // 2. content에서 wikilink 확인
    const normalizedText = text.replace(/\u00A0/g, " ");
    const escaped = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\[\\[.*?\\|${escaped}\\]\\]`);
    const inContent = re.test(normalizedContent);

    if (!inContent) {
      failures++;
      if (failures <= 5) {
        console.log(`  미링크: "${text}"`);
        console.log(`    resolveLink: ${directResult ? "OK" : "NULL"}`);
        const idx = normalizedContent.indexOf(normalizedText);
        if (idx >= 0) {
          const ctx = normalizedContent.substring(Math.max(0,idx-40), idx+normalizedText.length+40);
          console.log(`    content 주변: ...${ctx}...`);
        } else {
          console.log(`    content에 텍스트 없음!`);
        }
      }
    }
  });
  console.log(`총 실패: ${failures}개`);
  break; // 첫 번째 아티클만
}
