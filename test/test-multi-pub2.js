// 정확한 프로덕션 테스트: aside/removed 영역의 bc 링크를 제외하고 카운트
import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

// 테스트할 출판물 코드 (이미 검증된 te/su/ka 제외, 연감 제외)
const pubCodes = (process.argv[2] || "cl,fy,re,cf,ia,lvs,dp").split(",");

let grandTotalBc = 0, grandTotalWiki = 0, grandTotalUnlinked = 0;

for (const code of pubCodes) {
  try {
    const pubResp = await axios.get(`https://wol.jw.org/ko/wol/publication/r8/lp-ko/${code}`, { headers, timeout: 30000 });
    const $pub = cheerio.load(pubResp.data);
    const articles = [];
    $pub("a").each((_, el) => {
      const href = $pub(el).attr("href") || "";
      const m = href.match(/\/wol\/d\/r8\/lp-ko\/(\d+)/);
      if (m && !articles.find(a => a.docId === m[1])) {
        articles.push({ docId: m[1] });
      }
    });

    let pubBc = 0, pubWiki = 0, pubUnlinked = 0;
    const pubFailures = [];

    for (const art of articles) {
      try {
        const html = await getPublicationArticleAPI(art.docId);
        const content = await parseArticleContent(html, docidMap);
        const $h = cheerio.load(html);

        // extractText에서 제외되는 영역 마킹
        // aside, .groupFootnote 등은 extractText에서 처리 안 됨
        const skippedEls = new Set();
        $h("aside, .groupFootnote, .boxContent").each((_, el) => {
          $h(el).find("a").each((_, a) => skippedEls.add(a));
        });

        let bcCount = 0;
        const bcTexts = [];
        $h("a").each((_, el) => {
          const href = $h(el).attr("href") || "";
          if (!href.includes("/wol/bc/")) return;
          if (skippedEls.has(el)) return; // 제외 영역
          bcCount++;
          bcTexts.push($h(el).text().trim());
        });

        const wikiCount = (content.match(/\[\[library\/org-bible\//g) || []).length;
        const normalizedContent = content.replace(/\u00A0/g, " ");
        for (const text of bcTexts) {
          if (!text) continue;
          const normalizedText = text.replace(/\u00A0/g, " ");
          const escaped = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`\\[\\[.*?\\|${escaped}\\]\\]`);
          if (!re.test(normalizedContent)) {
            pubUnlinked++;
            pubFailures.push(text);
          }
        }
        pubBc += bcCount;
        pubWiki += wikiCount;
      } catch (e) { /* skip */ }
    }

    grandTotalBc += pubBc;
    grandTotalWiki += pubWiki;
    grandTotalUnlinked += pubUnlinked;

    const rate = pubBc > 0 ? ((1 - pubUnlinked / pubBc) * 100).toFixed(1) : "N/A";
    const status = pubUnlinked === 0 ? "OK" : `FAIL(${pubUnlinked})`;
    console.log(`[${code}] ${articles.length}편 bc:${pubBc} ${status} ${rate}%`);
    if (pubFailures.length > 0) {
      pubFailures.slice(0, 5).forEach(t => console.log(`  미링크: "${t}"`));
      if (pubFailures.length > 5) console.log(`  ... 외 ${pubFailures.length - 5}개`);
    }
  } catch (e) {
    console.log(`[${code}] 에러: ${e.message?.substring(0, 60)}`);
  }
}

console.log(`\n=== 종합 ===`);
console.log(`총 bc(본문만): ${grandTotalBc}`);
console.log(`총 미링크: ${grandTotalUnlinked}`);
console.log(`성공률: ${grandTotalBc > 0 ? ((1 - grandTotalUnlinked / grandTotalBc) * 100).toFixed(2) : "N/A"}%`);
