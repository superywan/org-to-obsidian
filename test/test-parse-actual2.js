import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const docidMap = loadMap();
const html = await getPublicationArticleAPI("1102021613");
const content = await parseArticleContent(html, docidMap);

// 전 4:10 근처 출력
const idx = content.indexOf("전 4:10");
if (idx >= 0) {
  console.log(`전 4:10 근처:\n${content.substring(idx - 5, idx + 200)}`);
}

// "12"가 실제로 <a> 태그인지 HTML에서 확인
import * as cheerio from "cheerio";
const $ = cheerio.load(html);
$("a").each((_, el) => {
  const text = $(el).text().trim();
  const href = $(el).attr("href") || "";
  if (href.includes("/wol/bc/") && text === "12") {
    const parent = $(el).parent();
    console.log(`\nFound "12" link: href="${href}"`);
    console.log(`parent HTML: ${parent.html().substring(0, 300)}`);
  }
});
