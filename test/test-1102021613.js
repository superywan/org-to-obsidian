import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap, resolveLink } from "../docid-map.js";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docidMap = loadMap();

const resp = await axios.get("https://wol.jw.org/ko/wol/d/r8/lp-ko/1102021613", { headers, timeout: 30000 });
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
    failed.push(`"${text}" (ctx=${JSON.stringify(lastBcCtx)})`);
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

console.log(`${pass}/${total} 성공`);
if (failed.length > 0) {
  console.log(`\n실패 (${failed.length}개):`);
  failed.forEach(f => console.log(`  ${f}`));
}

// 실패한 참조가 <a> 태그인지 확인
console.log("\n\n=== 잠 10:15 근처 HTML ===");
$("a").each((_, el) => {
  const text = $(el).text().trim();
  if (text.includes("잠") && text.includes("10:15")) {
    const parent = $(el).parent();
    console.log(`parent HTML: ${parent.html().substring(0, 400)}`);
  }
});

console.log("\n=== 19:7 링크 존재 여부 ===");
$("a").each((_, el) => {
  const text = $(el).text().trim();
  if (text === "19:7" || text === "19:7;" || text.startsWith("19:7")) {
    console.log(`Found: "${text}" href="${$(el).attr("href")}"`);
  }
});

console.log("\n=== 145:15 링크 존재 여부 ===");
$("a").each((_, el) => {
  const text = $(el).text().trim();
  if (text.startsWith("145:15")) {
    console.log(`Found: "${text}" href="${$(el).attr("href")}"`);
  }
});
