import axios from "axios";
import * as cheerio from "cheerio";
import { loadMap } from "./docid-map.js";
import { resolveLink } from "./docid-map.js";

const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const docidMap = loadMap();

// 원래 문제 기사 + 사용자 제공 기사
const articles = [
  ["301997012", "통치체에서 보낸 편지 (연감 1997)"],
  ["1101990067", "여호수아 (모든 성경)"],
];

for (const [docId, label] of articles) {
  const resp = await axios.get(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`, {
    headers, timeout: 30000
  });
  const $ = cheerio.load(resp.data);

  let total = 0, pass = 0, fail = 0;
  let lastBookNum = null;
  const failed = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href.includes("/wol/bc/")) return;
    total++;
    const text = $(el).text().trim();
    const result = resolveLink(docidMap, href, text, lastBookNum);

    // 책 번호 추적
    const bookMatch = text.match(/^(.+)\s+(\d+):(\d+)/);
    if (bookMatch && result) {
      // resolveLink 성공 → 마지막 책 번호 업데이트
      const chVerseMatch = result.match(/#\^v\d+/);
      if (chVerseMatch) {
        // vault path에서 책 번호 추출은 어려우므로, 텍스트에서 추출
        const nameToNum = {
          "창세": 1, "출애굽": 2, "레위": 3, "민수": 4, "신명": 5,
          "여호수아": 6, "사사": 7, "룻": 8, "사무엘 상": 9, "사무엘 하": 10,
          "열왕 상": 11, "열왕 하": 12, "역대 상": 13, "역대 하": 14,
          "에스라": 15, "느헤미야": 16, "에스더": 17, "욥": 18, "시": 19,
          "잠언": 20, "전도서": 21, "이사야": 23, "예레미야": 24,
          "에스겔": 26, "다니엘": 27, "호세아": 28, "요엘": 29,
          "아모스": 30, "미가": 33, "학개": 37, "말라기": 39,
          "마태": 40, "마가": 41, "누가": 42, "요한": 43,
          "사도": 44, "로마": 45, "갈라디아": 48, "에베소": 49,
          "빌립보": 50, "골로새": 51, "히브리": 58, "야고보": 59,
          "계시": 66, "계시록": 66,
          "고린도 전": 46, "고린도 첫째": 46, "고린도 후": 47,
          "디모데 전": 54, "디모데 후": 55,
          "베드로 전": 60, "베드로 후": 61,
          "요한 첫째": 62, "유다": 65,
          "마태 복음": 40, "요한 복음": 43,
          "열왕기 상": 11, "열왕기 하": 12,
          "사무엘상": 9, "사무엘하": 10, "열왕기상": 11, "열왕기하": 12,
        };
        const name = bookMatch[1].trim();
        if (nameToNum[name]) lastBookNum = nameToNum[name];
      }
    }

    if (result) {
      pass++;
    } else {
      fail++;
      failed.push(text);
    }
  });

  console.log(`\n=== ${label} ===`);
  console.log(`총 ${total}개 bc 링크: ${pass} 성공, ${fail} 실패`);
  if (failed.length > 0) {
    console.log("실패:");
    failed.forEach(t => console.log(`  ❌ "${t}"`));
  }
}
