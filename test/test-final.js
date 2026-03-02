import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, resolveLink } from "../docid-map.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

const articles = [
  ["301997012", "연감 1997 편지"],
  ["1101990067", "여호수아 (모든 성경)"],
];

for (const [docId, label] of articles) {
  const resp = await axios.get(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`, { headers, timeout: 30000 });
  const $ = cheerio.load(resp.data);
  let total = 0, pass = 0;
  let lastBcCtx = null;
  const failed = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href.includes("/wol/bc/")) return;
    total++;
    const text = $(el).text().trim();
    const result = resolveLink(docidMap, href, text, lastBcCtx);

    if (result) {
      pass++;
    } else {
      failed.push(text);
    }

    // lastBcCtx 업데이트 (parseArticleContent와 동일한 로직)
    const norm = text.replace(/\u00A0/g, " ");
    const fullRef = norm.match(/^(.+)\s+(\d+):(\d+)/);
    if (fullRef) {
      const bookName = fullRef[1].trim();
      // result에서 bookNum 추론
      const pathMatch = (result || "").match(/(\d+)\. /);
      if (pathMatch) {
        lastBcCtx = { bookNum: parseInt(pathMatch[1], 10), chapter: parseInt(fullRef[2], 10) };
      }
    } else if (lastBcCtx) {
      const contMatch = norm.match(/^(\d+):(\d+)/);
      if (contMatch) {
        lastBcCtx = { ...lastBcCtx, chapter: parseInt(contMatch[1], 10) };
      }
      // verse-only는 ctx 변경 없음
    }
  });

  console.log(`[${label}] ${pass}/${total} 성공`);
  if (failed.length > 0) {
    console.log(`  실패 (${failed.length}개): ${failed.join(", ")}`);
  }
}
