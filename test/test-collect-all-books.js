/**
 * WOL 통찰 색인 + 다양한 기사에서 사용되는 모든 성경 책 이름/약어 수집
 * 현재 BOOK_ABBREV_MAP과 _bookNameMap에서 누락된 것이 있는지 확인
 */
import axios from "axios";
import * as cheerio from "cheerio";

const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const delay = ms => new Promise(r => setTimeout(r, ms));

// 현재 매핑 (BOOK_ABBREV_MAP + 정식 명칭)
const knownNames = new Set([
  // 정식 명칭 (book-name-map.json)
  "창세기", "출애굽기", "레위기", "민수기", "신명기",
  "여호수아", "사사기", "룻기", "사무엘상", "사무엘하",
  "열왕기상", "열왕기하", "역대기상", "역대기하",
  "에스라", "느헤미야", "에스더", "욥기", "시편",
  "잠언", "전도서", "솔로몬의 노래", "이사야", "예레미야",
  "예레미야 애가", "에스겔", "다니엘", "호세아", "요엘",
  "아모스", "오바댜", "요나", "미가", "나훔",
  "하박국", "스바냐", "학개", "스가랴", "말라기",
  "마태복음", "마가복음", "누가복음", "요한복음",
  "사도행전", "로마서", "고린도 전서", "고린도 후서",
  "갈라디아서", "에베소서", "빌립보서", "골로새서",
  "데살로니가 전서", "데살로니가 후서",
  "디모데 전서", "디모데 후서", "디도서", "빌레몬서",
  "히브리서", "야고보서", "베드로 전서", "베드로 후서",
  "요한 1서", "요한 2서", "요한 3서", "유다서", "요한 계시록",
  // BOOK_ABBREV_MAP
  "창", "창세", "출", "레", "민", "신",
  "수", "삿", "룻", "삼상", "삼하",
  "왕상", "왕하", "대상", "대하",
  "스", "느", "에", "욥", "시",
  "잠", "전", "아", "사", "렘",
  "애", "겔", "단", "호", "욜",
  "암", "옵", "욘", "미", "나",
  "합", "습", "학", "슥", "말",
  "마", "막", "눅", "요", "행",
  "롬", "고전", "고후", "갈", "엡",
  "빌", "골", "살전", "살후",
  "딤전", "딤후", "딛", "몬", "히",
  "약", "벧전", "벧후", "요일", "요이", "요삼", "유", "계",
  // WOL 중간 약어
  "출애굽", "레위", "민수", "신명", "사사", "애가",
  "사무엘 상", "사무엘 하",
  "열왕 상", "열왕 하", "열왕기 상", "열왕기 하",
  "역대 상", "역대 하",
  "마태", "마가", "누가", "요한",
  "마태 복음", "마가 복음", "누가 복음", "요한 복음",
  "사도", "로마",
  "고린도 전", "고린도 전서", "고린도 첫째",
  "고린도 후", "고린도 후서", "고린도 둘째",
  "갈라디아", "에베소", "빌립보", "골로새",
  "데살로니가 전", "데살로니가 전서", "데살로니가 첫째",
  "데살로니가 후", "데살로니가 후서", "데살로니가 둘째",
  "디모데 전", "디모데 전서", "디모데 첫째",
  "디모데 후", "디모데 후서", "디모데 둘째",
  "디도", "빌레몬", "히브리",
  "야고보",
  "베드로 전", "베드로 전서", "베드로 첫째",
  "베드로 후", "베드로 후서", "베드로 둘째",
  "요한 첫째", "요한 둘째", "요한 셋째",
  "유다", "계시", "계시록",
]);

// 1. '모든 성경' 기사 전체 스캔 (66권 각 개요)
const allBibleDocIds = [];
for (let i = 34; i <= 99; i++) {
  allBibleDocIds.push(`11019900${i.toString().padStart(2, "0")}`);
}

// 추가 기사들 (다양한 약어 사용)
const extraArticles = [
  "301997012",  // 연감 1997
  "1102003078", // 통찰 기사
  "1102018809", // 행복한 삶
  "2020083",    // 파수대
  "2021325",    // 파수대
];

const allBookNames = new Map();
let total = 0;

console.log("WOL 기사에서 성경 bc 링크 수집 중...");

for (const docId of [...allBibleDocIds, ...extraArticles]) {
  try {
    const resp = await axios.get(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`, {
      headers, timeout: 30000
    });
    const $ = cheerio.load(resp.data);

    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!href.includes("/wol/bc/")) return;
      const text = $(el).text().trim().replace(/\u00A0/g, " ");
      const match = text.match(/^(.+)\s+(\d+):(\d+)/);
      if (match) {
        const name = match[1].trim();
        allBookNames.set(name, (allBookNames.get(name) || 0) + 1);
        total++;
      }
    });
    process.stdout.write(".");
    await delay(200);
  } catch {
    process.stdout.write("x");
    await delay(200);
  }
}

console.log(`\n\n총 ${total}개 bc 링크에서 ${allBookNames.size}개 고유 이름 발견\n`);

// 누락된 것 찾기
const missing = [];
const sorted = [...allBookNames.entries()].sort((a, b) => b[1] - a[1]);

for (const [name, count] of sorted) {
  if (!knownNames.has(name)) {
    missing.push({ name, count });
  }
}

if (missing.length > 0) {
  console.log(`=== 누락된 이름 (${missing.length}개) ===`);
  for (const { name, count } of missing) {
    console.log(`  ❌ "${name}" (${count}회)`);
  }
} else {
  console.log("모든 이름이 매핑되어 있습니다!");
}

console.log("\n=== 전체 이름 목록 ===");
for (const [name, count] of sorted) {
  const status = knownNames.has(name) ? "✅" : "❌";
  console.log(`  ${status} "${name}" (${count}회)`);
}
