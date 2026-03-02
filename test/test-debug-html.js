// cl 1장에서 "잠언 27:11" 링크의 HTML 구조 확인
import { getPublicationArticleAPI } from "../requests.js";
import * as cheerio from "cheerio";

const html = await getPublicationArticleAPI("1102002022");
const $ = cheerio.load(html);

// "잠언" 텍스트를 포함하는 bc 링크 찾기
$("a").each((_, el) => {
  const href = $(el).attr("href") || "";
  const text = $(el).text().trim();
  if (!href.includes("/wol/bc/")) return;
  if (text.includes("잠언") || text.includes("이사야") || text.includes("신명기") || text.includes("시편 23")) {
    // 부모 계층 확인
    const parents = [];
    let p = $(el).parent();
    for (let i = 0; i < 5 && p.length; i++) {
      const tag = p.prop("tagName");
      const cls = p.attr("class") || "";
      const id = p.attr("id") || "";
      parents.push(`${tag}${cls ? "."+cls : ""}${id ? "#"+id : ""}`);
      p = p.parent();
    }
    console.log(`"${text}" → parents: ${parents.join(" > ")}`);
    console.log(`  outerHTML: ${$(el).parent().html()?.substring(0, 200)}`);
  }
});
