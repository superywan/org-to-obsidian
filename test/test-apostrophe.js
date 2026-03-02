// 작은따옴표 문자 확인
import { getPublicationArticleAPI } from "../requests.js";
import * as cheerio from "cheerio";

const html = await getPublicationArticleAPI("1101973016");
const $ = cheerio.load(html);
$("a").each((_, el) => {
  const text = $(el).text().trim();
  if (text.includes("히브리") && text.includes("6:20")) {
    console.log(`텍스트: "${text}"`);
    console.log(`길이: ${text.length}`);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const code = ch.codePointAt(0).toString(16).toUpperCase();
      if (code !== ch.charCodeAt(0).toString(16).toUpperCase() || ch === "'" || ch === "\u2019" || ch === "\u02BC" || ch === "\u2018") {
        console.log(`  [${i}] '${ch}' = U+${code}`);
      }
    }
    // 작은따옴표 위치의 유니코드 값 출력
    const apostIdx = text.indexOf("'");
    const apostIdx2 = text.indexOf("\u2019");
    const apostIdx3 = text.indexOf("\u02BC");
    console.log(`ASCII ' at: ${apostIdx}`);
    console.log(`U+2019 ' at: ${apostIdx2}`);
    console.log(`U+02BC ʼ at: ${apostIdx3}`);
  }
});
