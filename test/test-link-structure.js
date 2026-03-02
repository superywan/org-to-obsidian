import axios from "axios";
import * as cheerio from "cheerio";

const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" };
const docId = "1101990114";

const resp = await axios.get(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`, { headers, timeout: 30000 });
const $ = cheerio.load(resp.data);

// "1:3" 텍스트를 포함하는 <a> 태그 근처의 HTML 구조 확인
$("a").each((_, el) => {
  const text = $(el).text().trim();
  const href = $(el).attr("href") || "";
  if (!href.includes("/wol/bc/")) return;

  // 데살로니가 후서 관련 참조 찾기
  if (text.includes("1:3") || text.includes("10,") || text.includes("2:13") || text.includes("3:2") || text.includes("데살로니가")) {
    // 부모 요소의 전체 HTML 보기
    const parent = $(el).parent();
    console.log(`\n=== Link text: "${text}" ===`);
    console.log(`href: ${href}`);
    console.log(`parent tag: ${parent.prop("tagName")}`);
    console.log(`parent HTML snippet: ${parent.html().substring(0, 300)}`);
    console.log("---");
  }
});

// 더 넓게: "생계"를 포함하는 텍스트 근처 구조 확인
console.log("\n\n=== '생계' 근처 HTML 구조 ===");
$("p, li, td").each((_, el) => {
  const text = $(el).text();
  if (text.includes("생계를 위하여") || text.includes("1:3, 4")) {
    console.log(`\ntag: ${$(el).prop("tagName")}`);
    console.log(`HTML: ${$(el).html().substring(0, 500)}`);
  }
});
