// cl 출판물의 실제 아티클로 프로덕션 테스트
import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

// cl 목차에서 아티클 docId 가져오기
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

// 첫 3개 아티클만 상세 디버그
for (const art of articles.slice(0, 3)) {
  console.log(`\n=== [${art.docId}] ${art.text} ===`);
  const html = await getPublicationArticleAPI(art.docId);
  const content = await parseArticleContent(html, docidMap);

  const $h = cheerio.load(html);
  const bcTexts = [];
  $h("a").each((_, el) => {
    const href = $h(el).attr("href") || "";
    if (href.includes("/wol/bc/")) bcTexts.push($h(el).text().trim());
  });

  const normalizedContent = content.replace(/\u00A0/g, " ");

  for (const text of bcTexts) {
    if (!text) continue;
    const normalizedText = text.replace(/\u00A0/g, " ");
    const escaped = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\[\\[.*?\\|${escaped}\\]\\]`);
    if (!re.test(normalizedContent)) {
      console.log(`  미링크: "${text}"`);
      // content에서 이 텍스트가 어디에 있는지 확인
      const idx = normalizedContent.indexOf(normalizedText);
      if (idx >= 0) {
        console.log(`    → content에서 발견 (idx=${idx}): ...${normalizedContent.substring(Math.max(0,idx-30), idx+normalizedText.length+30)}...`);
      } else {
        console.log(`    → content에서 텍스트 자체도 없음!`);
      }
    }
  }
}
