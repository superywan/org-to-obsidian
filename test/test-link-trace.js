import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, resolveLink } from "../docid-map.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();
const docId = "1101990114";

const resp = await axios.get(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`, { headers, timeout: 30000 });
const $ = cheerio.load(resp.data);

// 모든 bc 링크를 순서대로 추적
let lastBcCtx = null;
let idx = 0;

$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  if (!href.includes("/wol/bc/")) return;
  idx++;
  const text = $(el).text().trim();
  const bid = $(el).attr("data-bid") || "";
  const result = resolveLink(docidMap, href, text, lastBcCtx);
  const status = result ? "OK" : "FAIL";

  // bid 20 근처만 상세 출력 (문제가 되는 부분)
  const bidNum = parseInt(bid.split("-")[0], 10);
  if (bidNum >= 14 || !result) {
    console.log(`#${idx} [${status}] bid=${bid} text="${text}" ctx=${JSON.stringify(lastBcCtx)}`);
    if (result) console.log(`   → ${result.substring(0, 80)}`);
  }

  // lastBcCtx 업데이트 (parseArticleContent와 동일한 로직)
  const norm = text.replace(/\u00A0/g, " ");
  const fullRef = norm.match(/^(.+)\s+(\d+):(\d+)/);
  if (fullRef) {
    const bookName = fullRef[1].trim();
    const pathMatch = (result || "").match(/(\d+)\. /);
    if (pathMatch) {
      lastBcCtx = { bookNum: parseInt(pathMatch[1], 10), chapter: parseInt(fullRef[2], 10) };
    }
  } else if (lastBcCtx) {
    const contMatch = norm.match(/^(\d+):(\d+)/);
    if (contMatch) {
      lastBcCtx = { ...lastBcCtx, chapter: parseInt(contMatch[1], 10) };
    }
  }
});

console.log(`\n총 bc 링크: ${idx}개`);
