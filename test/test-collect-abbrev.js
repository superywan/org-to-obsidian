/**
 * WOL에서 실제 사용되는 성경 약어 수집
 * 여러 기사에서 bc 링크 텍스트를 수집하여 어떤 책 이름 형태가 쓰이는지 분석
 */
import axios from "axios";
import * as cheerio from "cheerio";

const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// 다양한 성경 참조가 많은 기사들
const articles = [
  "1101990067", // 여호수아 (모든 성경)
  "1101990034", // 창세기 (모든 성경)
  "1101990045", // 열왕기상 (모든 성경)
  "1101990046", // 열왕기하 (모든 성경)
  "1101990052", // 시편 (모든 성경)
  "1101990060", // 이사야 (모든 성경)
  "1101990073", // 마태복음 (모든 성경)
  "1101990078", // 사도행전 (모든 성경)
  "1101990089", // 히브리서 (모든 성경)
  "1101990098", // 요한 계시록 (모든 성경)
];

const bookNames = new Map(); // 책이름 → 출현 횟수

for (const docId of articles) {
  try {
    const resp = await axios.get(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`, {
      headers, timeout: 30000
    });
    const $ = cheerio.load(resp.data);

    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!href.includes("/wol/bc/")) return;
      const text = $(el).text().trim();
      // 책이름 + 장:절 패턴 추출
      const match = text.match(/^(.+)\s+(\d+):(\d+)/);
      if (match) {
        const name = match[1].trim();
        bookNames.set(name, (bookNames.get(name) || 0) + 1);
      }
    });
    process.stdout.write(".");
  } catch (e) {
    process.stdout.write("x");
  }
  await new Promise(r => setTimeout(r, 300));
}

console.log("\n");

// 정렬하여 출력
const sorted = [...bookNames.entries()].sort((a, b) => b[1] - a[1]);
console.log(`총 ${sorted.length}개 고유 책 이름 형태 발견:\n`);
for (const [name, count] of sorted) {
  console.log(`  "${name}" (${count}회)`);
}
