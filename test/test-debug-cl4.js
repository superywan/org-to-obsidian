// cl 1장(1102002022) 상세 디버그 — 실패 링크의 실제 content 확인
import { loadMap, parseArticleContent, resolveLink } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";
import * as cheerio from "cheerio";

const docidMap = loadMap();
const html = await getPublicationArticleAPI("1102002022");
const content = await parseArticleContent(html, docidMap);
const normalizedContent = content.replace(/\u00A0/g, " ");

const $h = cheerio.load(html);
let lastBcCtx = null;
$h("a").each((_, el) => {
  const href = $h(el).attr("href") || "";
  if (!href.includes("/wol/bc/")) return;
  const text = $h(el).text().trim();

  const normalizedText = text.replace(/\u00A0/g, " ");
  const escaped = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\[\\[.*?\\|${escaped}\\]\\]`);
  const found = re.test(normalizedContent);

  if (!found) {
    console.log(`\n실패: "${text}" (len=${text.length})`);
    // charCodes 확인
    for (let i = 0; i < Math.min(text.length, 20); i++) {
      const c = text.codePointAt(i);
      if (c > 127) console.log(`  char[${i}] '${text[i]}' = U+${c.toString(16).toUpperCase()}`);
    }
    // resolveLink 직접 호출
    const direct = resolveLink(docidMap, href, text, lastBcCtx);
    console.log(`  resolveLink(ctx=${JSON.stringify(lastBcCtx)}): ${direct ? direct.substring(0, 80) : "NULL"}`);
    // content에서 텍스트 검색
    const idx = normalizedContent.indexOf(normalizedText);
    if (idx >= 0) {
      console.log(`  content에서 발견(idx=${idx}): "${normalizedContent.substring(Math.max(0,idx-30), idx+normalizedText.length+30)}"`);
    } else {
      // 부분 검색
      const partial = normalizedText.substring(0, 5);
      const pidx = normalizedContent.indexOf(partial);
      if (pidx >= 0) {
        console.log(`  부분("${partial}") 발견(idx=${pidx}): "${normalizedContent.substring(Math.max(0,pidx-20), pidx+40)}"`);
      } else {
        console.log(`  content에 텍스트 없음!`);
      }
    }
  }

  // context 업데이트 (프로덕션과 동일 로직)
  const norm = text.replace(/\u00A0/g, " ");
  const fullRef = norm.match(/^(.+)\s+(\d+):(\d+)/);
  if (fullRef) {
    lastBcCtx = null; // simplified
  }
});
