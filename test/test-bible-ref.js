import { loadMap } from "./docid-map.js";
import { resolveLink } from "./docid-map.js";

const docidMap = loadMap();

// parseBibleRef와 동일한 로직 (테스트용)
const BOOK_ABBREV = {
  "창": 1, "창세": 1, "출": 2, "레": 3, "민": 4, "신": 5,
  "수": 6, "삿": 7, "룻": 8, "삼상": 9, "삼하": 10,
  "왕상": 11, "왕하": 12, "대상": 13, "대하": 14,
  "스": 15, "느": 16, "에": 17, "욥": 18, "시": 19,
  "잠": 20, "전": 21, "아": 22, "사": 23, "렘": 24,
  "애": 25, "겔": 26, "단": 27, "호": 28, "욜": 29,
  "암": 30, "옵": 31, "욘": 32, "미": 33, "나": 34,
  "합": 35, "습": 36, "학": 37, "슥": 38, "말": 39,
  "마": 40, "막": 41, "눅": 42, "요": 43, "행": 44,
  "롬": 45, "고전": 46, "고후": 47, "갈": 48, "엡": 49,
  "빌": 50, "골": 51, "살전": 52, "살후": 53,
  "딤전": 54, "딤후": 55, "딛": 56, "몬": 57, "히": 58,
  "약": 59, "벧전": 60, "벧후": 61, "요일": 62,
  "요이": 63, "요삼": 64, "유": 65, "계": 66,
  "마태": 40, "마가": 41, "누가": 42, "요한": 43,
  "사도": 44, "로마": 45,
  "고린도 첫째": 46, "고린도 둘째": 47,
  "갈라디아": 48, "에베소": 49, "빌립보": 50, "골로새": 51,
  "디모데 첫째": 54, "디모데 둘째": 55,
  "디도": 56, "빌레몬": 57, "히브리": 58,
  "야고보": 59, "베드로 첫째": 60, "베드로 둘째": 61,
  "요한 첫째": 62, "요한 둘째": 63, "요한 셋째": 64,
  "유다": 65, "계시": 66,
  // 정식 이름
  "이사야": 23, "요엘": 29, "말라기": 39, "창세기": 1,
};

const getBookNum = (text) => {
  const match = text.match(/^(.+)\s+(\d+):(\d+)/);
  if (!match) return null;
  return BOOK_ABBREV[match[1].trim()] || null;
};

// 기본 약어 테스트
console.log("=== 기본 약어 테스트 ===");
const testCases = [
  ["/ko/wol/bc/r8/lp-ko/301997012/0/0", "누가 10:17,"],
  ["/ko/wol/bc/r8/lp-ko/301997012/1/0", "야고보 1:22"],
  ["/ko/wol/bc/r8/lp-ko/301997012/2/0", "말라기 3:10"],
  ["/ko/wol/bc/r8/lp-ko/301997012/3/0", "골로새 3:14"],
  ["/ko/wol/bc/r8/lp-ko/301997012/6/0", "요한 4:35"],
  ["/ko/wol/bc/r8/lp-ko/301997012/9/0", "시 18:25"],
  ["/ko/wol/bc/r8/lp-ko/301997012/10/0", "마태 6:31-33"],
  ["/ko/wol/bc/r8/lp-ko/301997012/13/0", "시 143:10"],
  ["/ko/wol/bc/r8/lp-ko/301997012/15/0", "계시 16:13-16;"],
  ["/ko/wol/bc/r8/lp-ko/301997012/16/0", "고린도 첫째 15:33;"],
  ["/ko/wol/bc/r8/lp-ko/301997012/17/0", "요한 첫째 2:15-17"],
];
let pass = 0, fail = 0;
for (const [href, text] of testCases) {
  const result = resolveLink(docidMap, href, text);
  if (result) { pass++; console.log(`  OK ${text}`); }
  else { fail++; console.log(`  FAIL ${text}`); }
}
console.log(`결과: ${pass}/${testCases.length}\n`);

// 연속 참조 테스트 (책 이름 생략 케이스)
console.log("=== 연속 참조 (책 이름 생략) ===");
const contCases = [
  // "이사야 50:4, 5; 54:13, 14"
  { prev: "이사야 50:4, 5;", curr: "54:13, 14", href: "/ko/wol/bc/r8/lp-ko/301997012/14/1" },
  // "요엘 1:1-4; 2:7,"
  { prev: "요엘 1:1-4;", curr: "2:7,", href: "/ko/wol/bc/r8/lp-ko/301997012/4/1" },
  // "이사야 2:2-4; 60:8-11"
  { prev: "이사야 2:2-4;", curr: "60:8-11", href: "/ko/wol/bc/r8/lp-ko/301997012/5/1" },
  // "요한 15:19; 17:14,"
  { prev: "요한 15:19;", curr: "17:14,", href: "/ko/wol/bc/r8/lp-ko/301997012/15/2" },
  // "계시 7:9, 14; 14:15, 16"
  { prev: "계시 7:9,", curr: "14:15, 16", href: "/ko/wol/bc/r8/lp-ko/301997012/8/4" },
];

let cPass = 0, cFail = 0;
for (const c of contCases) {
  const lastBookNum = getBookNum(c.prev);
  const result = resolveLink(docidMap, c.href, c.curr, lastBookNum);
  if (result) {
    cPass++;
    console.log(`  OK "${c.prev} ${c.curr}" → ${result.substring(0, 80)}`);
  } else {
    cFail++;
    console.log(`  FAIL "${c.prev} ${c.curr}" (lastBookNum=${lastBookNum})`);
  }
}
console.log(`결과: ${cPass}/${contCases.length}`);
