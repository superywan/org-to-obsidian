import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, resolveLink } from "../docid-map.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

const resp = await axios.get("https://wol.jw.org/ko/wol/d/r8/lp-ko/1101990114", { headers, timeout: 30000 });
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

  const norm = text.replace(/\u00A0/g, " ");
  const fullRef = norm.match(/^(.+)\s+(\d+):(\d+)/);
  if (fullRef) {
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

console.log(`[데살로니가 후서] ${pass}/${total} 성공`);
if (failed.length > 0) {
  console.log(`  실패 (${failed.length}개): ${failed.join(", ")}`);
}
