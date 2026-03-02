// 실패한 bc 링크가 footnote 안에 있는지 확인
import { getPublicationArticleAPI } from "../requests.js";
import * as cheerio from "cheerio";

const html = await getPublicationArticleAPI("1102002022"); // cl 1장
const $ = cheerio.load(html);

// footnote/removed 영역 안의 bc 링크 확인
const removedSelectors = ".footnote, .fn, #footnotes, .sourceCredit";
const removedEls = $(removedSelectors);
const removedBc = [];
removedEls.find("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  if (href.includes("/wol/bc/")) {
    removedBc.push($(el).text().trim());
  }
});

console.log(`제거 영역 안의 bc 링크 (${removedBc.length}개):`);
removedBc.forEach(t => console.log(`  "${t}"`));

// 전체 bc 링크
let totalBc = 0;
$("a").each((_, el) => {
  if ($(el).attr("href")?.includes("/wol/bc/")) totalBc++;
});
console.log(`\n전체 bc 링크: ${totalBc}개`);
console.log(`제거 영역: ${removedBc.length}개`);
console.log(`남은 bc 링크: ${totalBc - removedBc.length}개`);
