// 여러 출판물 프로덕션 테스트 (lv 페이지에서 출판물 목록 추출)
import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

// lv 페이지에서 출판물 목록 추출
const resp = await axios.get("https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/48955", { headers, timeout: 30000 });
const $p = cheerio.load(resp.data);

const pubs = [];
$p("a").each((_, el) => {
  const href = $p(el).attr("href") || "";
  const m = href.match(/\/wol\/publication\/r8\/lp-ko\/(\w+)/);
  if (m) {
    const code = m[1];
    const text = $p(el).text().trim().substring(0, 60);
    if (!pubs.find(p => p.code === code)) {
      pubs.push({ code, text, href: `https://wol.jw.org${href}` });
    }
  }
});

console.log(`총 출판물: ${pubs.length}개`);
pubs.forEach(p => console.log(`  ${p.code}: ${p.text}`));

// 이미 테스트한 것(te, su, ka) 및 연감(yb) 제외
const skip = new Set(["te", "su", "ka"]);
const filtered = pubs.filter(p => {
  if (skip.has(p.code)) return false;
  if (p.code.startsWith("yb")) return false; // 연감 제외
  if (p.text.includes("연감")) return false;
  return true;
});

console.log(`\n테스트할 출판물: ${filtered.length}개 (이미 테스트: ${skip.size}개, 연감 제외)\n`);

// 각 출판물에서 샘플 아티클 테스트
let grandTotalBc = 0, grandTotalWiki = 0, grandTotalUnlinked = 0;
const pubResults = [];

for (const pub of filtered) {
  try {
    const pubResp = await axios.get(pub.href, { headers, timeout: 30000 });
    const $pub = cheerio.load(pubResp.data);
    const articles = [];
    $pub("a").each((_, el) => {
      const href = $pub(el).attr("href") || "";
      const m2 = href.match(/\/wol\/d\/r8\/lp-ko\/(\d+)/);
      if (m2 && !articles.find(a => a.docId === m2[1])) {
        articles.push({ docId: m2[1] });
      }
    });

    let pubBc = 0, pubWiki = 0, pubUnlinked = 0;
    const pubFailures = [];

    for (const art of articles) {
      try {
        const html = await getPublicationArticleAPI(art.docId);
        const content = await parseArticleContent(html, docidMap);

        const $h = cheerio.load(html);
        let bcCount = 0;
        const bcTexts = [];
        $h("a").each((_, el2) => {
          const href2 = $h(el2).attr("href") || "";
          if (!href2.includes("/wol/bc/")) return;
          bcCount++;
          bcTexts.push($h(el2).text().trim());
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
      } catch (e) {
        // skip individual article errors
      }
    }

    grandTotalBc += pubBc;
    grandTotalWiki += pubWiki;
    grandTotalUnlinked += pubUnlinked;

    const rate = pubBc > 0 ? ((pubWiki / pubBc) * 100).toFixed(1) : "N/A";
    const status = pubUnlinked === 0 ? "OK" : `FAIL(${pubUnlinked})`;
    console.log(`[${pub.code}] ${articles.length}편 bc:${pubBc} wiki:${pubWiki} ${rate}% ${status} — ${pub.text}`);
    if (pubFailures.length > 0 && pubFailures.length <= 5) {
      pubFailures.forEach(t => console.log(`  미링크: "${t}"`));
    } else if (pubFailures.length > 5) {
      pubFailures.slice(0, 5).forEach(t => console.log(`  미링크: "${t}"`));
      console.log(`  ... 외 ${pubFailures.length - 5}개`);
    }
    pubResults.push({ code: pub.code, text: pub.text, bc: pubBc, wiki: pubWiki, unlinked: pubUnlinked, articles: articles.length });
  } catch (e) {
    console.log(`[${pub.code}] 에러: ${e.message?.substring(0, 60)} — ${pub.text}`);
  }
}

console.log(`\n=== 전체 종합 ===`);
console.log(`출판물: ${pubResults.length}개`);
console.log(`총 bc 링크: ${grandTotalBc}`);
console.log(`총 wikilink: ${grandTotalWiki}`);
console.log(`총 미링크: ${grandTotalUnlinked}`);
console.log(`성공률: ${grandTotalBc > 0 ? ((grandTotalWiki / grandTotalBc) * 100).toFixed(2) : "N/A"}%`);
