import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

import { VAULT_BASE } from "./constant.js";
import { getRedirectTargetAPI } from "./requests.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_FILE = path.join(__dirname, "docid-map.json");
const REDIRECT_CACHE_FILE = path.join(__dirname, "redirect-cache.json");
const BOOK_NAME_MAP_FILE = path.join(__dirname, "book-name-map.json");

const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 한국어 성경 약어 → 책 번호 ──────────────
const BOOK_ABBREV_MAP = {
  // 히브리어-아람어 성경 (1-2글자 약어)
  "창": 1, "창세": 1, "출": 2, "레": 3, "민": 4, "신": 5,
  "수": 6, "삿": 7, "룻": 8, "삼상": 9, "삼하": 10,
  "왕상": 11, "왕하": 12, "대상": 13, "대하": 14,
  "스": 15, "느": 16, "에": 17, "욥": 18, "시": 19,
  "잠": 20, "전": 21, "아": 22, "사": 23, "렘": 24,
  "애": 25, "겔": 26, "단": 27, "호": 28, "욜": 29,
  "암": 30, "옵": 31, "욘": 32, "미": 33, "나": 34,
  "합": 35, "습": 36, "학": 37, "슥": 38, "말": 39,
  // 그리스도인 그리스어 성경 (1-2글자 약어)
  "마": 40, "막": 41, "눅": 42, "요": 43, "행": 44,
  "롬": 45, "고전": 46, "고후": 47, "갈": 48, "엡": 49,
  "빌": 50, "골": 51, "살전": 52, "살후": 53,
  "딤전": 54, "딤후": 55, "딛": 56, "몬": 57, "히": 58,
  "약": 59, "벧전": 60, "벧후": 61, "요일": 62,
  "요이": 63, "요삼": 64, "유": 65, "계": 66,
  // WOL 중간 길이 약어 (링크 텍스트에서 사용)
  // 히브리어-아람어 성경
  "출애굽": 2, "레위": 3, "민수": 4, "신명": 5,
  "사사": 7,
  "사무엘 상": 9, "사무엘 하": 10, "사무엘 첫째": 9, "사무엘 둘째": 10,
  "열왕 상": 11, "열왕 하": 12, "열왕기 상": 11, "열왕기 하": 12, "열왕 첫째": 11, "열왕 둘째": 12,
  "역대 상": 13, "역대 하": 14, "역대 첫째": 13, "역대 둘째": 14,
  "전도": 21, "아가": 22,
  "애가": 25,
  // 그리스도인 그리스어 성경
  "마태": 40, "마가": 41, "누가": 42, "요한": 43,
  "마태 복음": 40, "마가 복음": 41, "누가 복음": 42, "요한 복음": 43,
  "사도": 44, "사도 행전": 44, "로마": 45,
  "I 고린도": 46, "II 고린도": 47,
  "I 데살로니가": 52, "II 데살로니가": 53,
  "I 디모데": 54, "II 디모데": 55,
  "I 베드로": 60, "II 베드로": 61,
  "I 요한": 62, "II 요한": 63, "III 요한": 64,
  "고린도 전": 46, "고린도 전서": 46, "고린도 첫째": 46,
  "고린도 후": 47, "고린도 후서": 47, "고린도 둘째": 47,
  "갈라디아": 48, "에베소": 49, "빌립보": 50, "골로새": 51,
  "데살로니가 전": 52, "데살로니가 전서": 52, "데살로니가 첫째": 52,
  "데살로니가 후": 53, "데살로니가 후서": 53, "데살로니가 둘째": 53,
  "디모데 전": 54, "디모데 전서": 54, "디모데 첫째": 54,
  "디모데 후": 55, "디모데 후서": 55, "디모데 둘째": 55,
  "디도": 56, "빌레몬": 57, "히브리": 58,
  "야고보": 59,
  "베드로 전": 60, "베드로 전서": 60, "베드로 첫째": 60,
  "베드로 후": 61, "베드로 후서": 61, "베드로 둘째": 61,
  "요한 첫째": 62, "요한 둘째": 63, "요한 셋째": 64,
  "유다": 65, "계시": 66, "계시록": 66,
  // 옛 맞춤법 / 띄어쓰기 없는 변형
  "빕립보": 50, "출애급": 2,
  "마태복음": 40, "마가복음": 41, "누가복음": 42, "요한복음": 43,
  // 서/기 표기 변형 (단장 성경)
  "요한 1서": 62, "요한 2서": 63, "요한 3서": 64,
  // 추가 중간 길이 약어
  "에스겔": 26, "다니엘": 27, "호세아": 28, "아모스": 30,
  "하박국": 35, "스바냐": 36, "학개": 37, "스가랴": 38, "말라기": 39, "요나서": 32,
  // 2024 신세계역 개정판 새 책이름
  "탈출": 2, "탈출기": 2, "재판관": 7, "재판관기": 7,
  "코헬렛": 21, "오바디야": 31, "하바꾹": 35,
  // 열왕기/역대기 기 표기
  "열왕기 첫째": 11, "열왕기 둘째": 12, "역대기 첫째": 13, "역대기 둘째": 14,
  // 초단축 약어 (scl 등에서 사용)
  "요1": 62, "요2": 63, "요3": 64,
  "벧전": 60, "벧후": 61,
  "라": 15, "더": 17,
};

// ── 책 번호 → 한국어 이름 (태그용, 공백 없음) ──
const BOOK_NUM_TO_NAME = {
  1: "창세기", 2: "출애굽기", 3: "레위기", 4: "민수기", 5: "신명기",
  6: "여호수아", 7: "재판관기", 8: "룻기", 9: "사무엘상", 10: "사무엘하",
  11: "열왕기상", 12: "열왕기하", 13: "역대기상", 14: "역대기하",
  15: "에스라", 16: "느헤미야", 17: "에스더", 18: "욥기", 19: "시편",
  20: "잠언", 21: "전도서", 22: "아가", 23: "이사야", 24: "예레미야",
  25: "애가", 26: "에스겔", 27: "다니엘", 28: "호세아", 29: "요엘",
  30: "아모스", 31: "오바댜", 32: "요나", 33: "미가", 34: "나훔",
  35: "하박국", 36: "스바냐", 37: "학개", 38: "스가랴", 39: "말라기",
  40: "마태복음", 41: "마가복음", 42: "누가복음", 43: "요한복음", 44: "사도행전",
  45: "로마서", 46: "고린도전서", 47: "고린도후서", 48: "갈라디아서", 49: "에베소서",
  50: "빌립보서", 51: "골로새서", 52: "데살로니가전서", 53: "데살로니가후서",
  54: "디모데전서", 55: "디모데후서", 56: "디도서", 57: "빌레몬서", 58: "히브리서",
  59: "야고보서", 60: "베드로전서", 61: "베드로후서", 62: "요한1서", 63: "요한2서",
  64: "요한3서", 65: "유다서", 66: "요한계시록",
};

// ── 성구 인라인 태그 생성 헬퍼 ──────────────
// 모든 태그 함수는 " #태그1 #태그2 " 형태로 앞뒤 공백 포함
// (앞 공백: wikilink와 분리, 뒤 공백: 한국어 텍스트와 분리하여 태그 경계 보장)
const makeBibleTag = (bookNum, chapter, verse) => {
  const name = BOOK_NUM_TO_NAME[bookNum];
  if (!name) return "";
  const tag = verse != null ? `#성구/${name}/${chapter}/${verse}` : `#성구/${name}/${chapter}`;
  return ` ${tag} `;
};

// "1, 2, 5-7" → [1, 2, 5, 6, 7]  (쉼표+범위 혼합 파싱)
const parseVerseSpec = (spec) => {
  const verses = new Set();
  for (const part of spec.split(/,/)) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
      const s = parseInt(rangeMatch[1], 10), e = parseInt(rangeMatch[2], 10);
      for (let v = s; v <= e; v++) verses.add(v);
    } else {
      const single = trimmed.match(/^(\d+)/);
      if (single) verses.add(parseInt(single[1], 10));
    }
  }
  return verses.size > 0 ? [...verses].sort((a, b) => a - b) : null;
};

// displayText에서 참조된 모든 절 추출
// "창세 3:15-17" → [15,16,17]  "대첫 17:1, 2" → [1,2]  "9-11" → [9,10,11]
// 장경계 범위 "9:1–10:15"는 null 반환 (extractCrossChapterRange로 처리)
const extractAllVerses = (text) => {
  // 장경계 범위 감지: "9:1–10:15" → 절 추출 불가, null 반환
  if (/\d+:\d+\s*[-–]\s*\d+:\d+/.test(text)) return null;
  // 1. 장:절 패턴: "17:1, 2" or "3:15-17"
  const chVerse = text.match(/\d+:([\d,\s\-–]+)/);
  if (chVerse) return parseVerseSpec(chVerse[1]);
  // 2. 절만 (continuation): "9-11", "6, 7"
  const verseOnly = text.match(/^([\d,\s\-–]+)/);
  if (verseOnly) return parseVerseSpec(verseOnly[1]);
  return null;
};

// 장경계 범위 감지: "여호수아 9:1–10:15" → { startCh:9, endCh:10, endVerse:15 }
const extractCrossChapterRange = (text) => {
  const m = text.match(/(\d+):\d+\s*[-–]\s*(\d+):(\d+)/);
  if (!m) return null;
  return { startCh: parseInt(m[1], 10), endCh: parseInt(m[2], 10), endVerse: parseInt(m[3], 10) };
};

// 장경계 범위에 대한 태그 생성
// 시작~중간 장: 장 수준 태그, 끝 장: 1절부터 endVerse까지 절 수준 태그
const makeCrossChapterTags = (bookNum, crossCh) => {
  const name = BOOK_NUM_TO_NAME[bookNum];
  if (!name) return "";
  const tags = [];
  for (let c = crossCh.startCh; c < crossCh.endCh; c++) tags.push(`#성구/${name}/${c}`);
  for (let v = 1; v <= crossCh.endVerse; v++) tags.push(`#성구/${name}/${crossCh.endCh}/${v}`);
  return tags.length > 0 ? ` ${tags.join(" ")} ` : "";
};

// 절 목록으로 태그 문자열 생성
const makeBibleVerseTags = (bookNum, chapter, verses) => {
  const name = BOOK_NUM_TO_NAME[bookNum];
  if (!name || !verses || verses.length === 0) return "";
  return ` ${verses.map(v => `#성구/${name}/${chapter}/${v}`).join(" ")} `;
};

// 단장(1장뿐인) 성경 책 번호
const SINGLE_CHAPTER_BOOKS = new Set([31, 57, 63, 64, 65]); // 오바댜, 빌레몬, 요한2서, 요한3서, 유다

// ── 모듈 레벨 캐시 ──────────────────────────
let _bookNameMap = {};
let _redirectCache = {};
let _scriptureRegex = null;

// ── docId 매핑 로드/저장 ─────────────────────
export const loadMap = () => {
  try {
    const map = JSON.parse(fs.readFileSync(MAP_FILE, "utf-8"));
    _bookNameMap = loadBookNameMap();
    _redirectCache = loadRedirectCache();
    _scriptureRegex = null; // 맵 변경 시 정규식 캐시 무효화
    return map;
  } catch {
    return {};
  }
};

export const saveMap = (map) => {
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
  saveRedirectCache();
};

// ── 책이름 맵 로드/저장 ─────────────────────
const loadBookNameMap = () => {
  try {
    return JSON.parse(fs.readFileSync(BOOK_NAME_MAP_FILE, "utf-8"));
  } catch {
    return {};
  }
};

export const setBookNameMap = (map) => {
  _bookNameMap = map;
  fs.writeFileSync(BOOK_NAME_MAP_FILE, JSON.stringify(map, null, 2));
};

// ── 리다이렉트 캐시 로드/저장 ───────────────
const loadRedirectCache = () => {
  try {
    return JSON.parse(fs.readFileSync(REDIRECT_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
};

const saveRedirectCache = () => {
  fs.writeFileSync(
    REDIRECT_CACHE_FILE,
    JSON.stringify(_redirectCache, null, 2)
  );
};

// ── docId → filePath 매핑 등록 ──────────────
export const addMapping = (map, docId, absoluteFilePath) => {
  const relative = absoluteFilePath
    .replace(VAULT_BASE, "")
    .replace(/\.md$/, "");
  map[docId] = relative;
};

// ── 참조 성구 약어 텍스트 → wikilink 변환 ───
export const parseCrossRefText = (text, docidMap) => {
  // "시 102:25; 사 42:5; 45:18; 롬 1:20" 형태를 파싱
  const parts = text.split(/;\s*/);
  let currentBookNum = null;

  const results = parts.map((part) => {
    part = part.trim();
    if (!part) return part;

    // 약어 + 장:절 패턴 (예: "시 102:25", "고전 11:7, 9")
    const withBook = part.match(/^([가-힣]+)\s+(\d+):(\d+)/);
    if (withBook) {
      const bookNum = BOOK_ABBREV_MAP[withBook[1]];
      if (bookNum) {
        currentBookNum = bookNum;
        const chapter = parseInt(withBook[2], 10);
        const verse = parseInt(withBook[3], 10);
        const key = `b:${bookNum}:${chapter}`;
        const vaultPath = docidMap[key];
        if (vaultPath) {
          const crossCh = extractCrossChapterRange(part);
          if (crossCh) return `[[${vaultPath}#^v${verse}|${part}]]${makeCrossChapterTags(bookNum, crossCh)}`;
          const allV = extractAllVerses(part);
          return `[[${vaultPath}#^v${verse}|${part}]]${allV ? makeBibleVerseTags(bookNum, chapter, allV) : makeBibleTag(bookNum, chapter, verse)}`;
        }
      }
    }

    // 장:절만 (이전 책 이어짐, 예: "45:18", "10:6")
    const contMatch = part.match(/^(\d+):(\d+)/);
    if (contMatch && currentBookNum) {
      const chapter = parseInt(contMatch[1], 10);
      const verse = parseInt(contMatch[2], 10);
      const key = `b:${currentBookNum}:${chapter}`;
      const vaultPath = docidMap[key];
      if (vaultPath) {
        const crossCh = extractCrossChapterRange(part);
        if (crossCh) return `[[${vaultPath}#^v${verse}|${part}]]${makeCrossChapterTags(currentBookNum, crossCh)}`;
        const allV = extractAllVerses(part);
        return `[[${vaultPath}#^v${verse}|${part}]]${allV ? makeBibleVerseTags(currentBookNum, chapter, allV) : makeBibleTag(currentBookNum, chapter, verse)}`;
      }
    }

    return part; // 해결 불가 → 원본 텍스트
  });

  return results.join("; ");
};

// ── 평문 텍스트에서 성구 참조 감지 및 태그 추가 ─
const _getScriptureRegex = () => {
  if (_scriptureRegex) return _scriptureRegex;
  const allNames = new Set([
    ...Object.keys(BOOK_ABBREV_MAP),
    ...Object.keys(_bookNameMap),
  ]);
  // 길이 역순 정렬 — "요한 계시록"이 "요한"보다 먼저 매칭
  const sorted = [...allNames].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const bookPattern = escaped.join("|");
  _scriptureRegex = new RegExp(
    `(?<![가-힣])(${bookPattern})\\s+` +
    `(\\d+:[\\d,\\s\\-–:]*\\d(?:\\s*절)?` +        // 장:절 (14:1, 6:25-33, 5:28, 29, 9:1–10:15)
    `|\\d+장(?:\\s*[\\d,\\s\\-–]*\\d\\s*절)?` +     // N장 [N절] (11장 24절, 24장)
    `|\\d+편(?:\\s*[\\d,\\s\\-–]*\\d\\s*절)?)`,      // N편 [N절] (91편 11절) — 시편
    "g"
  );
  return _scriptureRegex;
};

export const addScriptureTags = (text, docidMap = {}) => {
  const regex = _getScriptureRegex();
  regex.lastIndex = 0;

  return text.replace(regex, (fullMatch, bookName, refPart) => {
    const bookNum = _lookupBook(bookName);
    if (!bookNum) return fullMatch;

    let chapter = null;
    let firstVerse = null;
    let tagStr = "";

    // ── Pattern 1: 장:절 (colon) ──
    const colonMatch = refPart.match(/^(\d+):/);
    if (colonMatch) {
      chapter = parseInt(colonMatch[1], 10);
      const crossCh = extractCrossChapterRange(refPart);
      if (crossCh) {
        tagStr = makeCrossChapterTags(bookNum, crossCh);
        firstVerse = parseInt(refPart.match(/\d+:(\d+)/)?.[1], 10);
      } else {
        const verses = extractAllVerses(refPart);
        if (verses && verses.length > 0) {
          tagStr = makeBibleVerseTags(bookNum, chapter, verses);
          firstVerse = verses[0];
        } else {
          tagStr = makeBibleTag(bookNum, chapter, null);
        }
      }
    }

    // ── Pattern 2: N장 [N절] ──
    if (!chapter) {
      const jangMatch = refPart.match(/^(\d+)장/);
      if (jangMatch) {
        chapter = parseInt(jangMatch[1], 10);
        const verseMatch = refPart.match(/장\s*([\d,\s\-–]+)\s*절/);
        if (verseMatch) {
          const verses = parseVerseSpec(verseMatch[1]);
          if (verses && verses.length > 0) {
            tagStr = makeBibleVerseTags(bookNum, chapter, verses);
            firstVerse = verses[0];
          }
        }
        if (!tagStr) tagStr = makeBibleTag(bookNum, chapter, null);
      }
    }

    // ── Pattern 3: N편 [N절] (시편) ──
    if (!chapter) {
      const pyeonMatch = refPart.match(/^(\d+)편/);
      if (pyeonMatch) {
        chapter = parseInt(pyeonMatch[1], 10);
        const verseMatch = refPart.match(/편\s*([\d,\s\-–]+)\s*절/);
        if (verseMatch) {
          const verses = parseVerseSpec(verseMatch[1]);
          if (verses && verses.length > 0) {
            tagStr = makeBibleVerseTags(bookNum, chapter, verses);
            firstVerse = verses[0];
          }
        }
        if (!tagStr) tagStr = makeBibleTag(bookNum, chapter, null);
      }
    }

    if (!chapter) return fullMatch;

    // wikilink + 인라인 태그 생성
    const bibleKey = `b:${bookNum}:${chapter}`;
    const vaultPath = docidMap[bibleKey];
    if (vaultPath) {
      const anchor = firstVerse ? `#^v${firstVerse}` : "";
      return `[[${vaultPath}${anchor}|${fullMatch}]]${tagStr}`;
    }
    // vault 경로 없으면 태그만
    return tagStr.trim() ? `${fullMatch}${tagStr}` : fullMatch;
  });
};

// ── 책 이름 조회 헬퍼 ──────────────────────
const _lookupBook = (name) => {
  if (!name) return null;
  const clean = name.replace(/['\u2018\u2019\u02BC]/g, "").trim();
  return _bookNameMap[name] || BOOK_ABBREV_MAP[name] ||
         _bookNameMap[clean] || BOOK_ABBREV_MAP[clean] || null;
};

// ── 표시 텍스트 전처리 (에서, 작은따옴표, 참조 등) ──
const cleanBibleRefText = (text) => {
  let c = text.replace(/\u00A0/g, " ");
  // "에서" 분리: "계시 19:11에서 20:10" → "계시 19:11"
  const esoIdx = c.indexOf("에서");
  if (esoIdx > 0) c = c.substring(0, esoIdx).trim();
  // "참조" 접두어 제거
  c = c.replace(/^참조\s+/, "");
  // 작은따옴표 + 한글 접미사 제거: "히브리' 6:20" → "히브리 6:20"
  // "마태'의 기록 24장" → "마태 24장", "히브리'인들에게 써 보낸 책 11장" → "히브리 11장"
  c = c.replace(/['\u2018\u2019\u02BC][^0-9]*(?=\s*\d)/, " ");
  // 장:절 사이 공백: "7: 16" → "7:16"
  c = c.replace(/(\d+):\s+(\d+)/, "$1:$2");
  // "N장 N절" → "N:N"
  c = c.replace(/(\d+)장\s*(\d+)절?/, "$1:$2");
  return c.replace(/\s+/g, " ").trim();
};

// ── 성경 구절 표시 텍스트 파싱 ──────────────
const parseBibleRef = (displayText) => {
  // "창세기 1:1", "요한 계시록 11:18", "시 143:10", "고린도 첫째 15:33" 등
  // NBSP(\xA0) → 일반 공백 정규화
  const normalized = displayText.replace(/\u00A0/g, " ");
  const match = normalized.match(/^(.+)\s+(\d+):(\d+)/);
  if (!match) return null;
  const bookName = match[1].trim();
  const chapter = parseInt(match[2], 10);
  const verse = parseInt(match[3], 10);
  const bookNum = _bookNameMap[bookName] || BOOK_ABBREV_MAP[bookName];
  if (!bookNum) return null;
  return { bookNum, chapter, verse };
};

// ── href에서 단락 블록 ID fragment 추출 ──────
// #p9 → "^p9", #h=12:0-14:27 → "^p12", #h=47-53:0 → "^p47"
const parseFragment = (href) => {
  const hashIdx = href.indexOf("#");
  if (hashIdx < 0) return "";
  const frag = href.substring(hashIdx + 1);
  // #pN — 단락 직접 참조
  const pDirect = frag.match(/^p(\d+)$/);
  if (pDirect) return `#^p${pDirect[1]}`;
  // #h=N:... — 범위 참조의 시작 pid
  const hRange = frag.match(/^h=(\d+)/);
  if (hRange) return `#^p${hRange[1]}`;
  return "";
};

// ── WOL href → Obsidian wikilink 변환 (동기) ─
export const resolveLink = (map, href, displayText, lastBcCtx = null) => {
  // lastBcCtx: { bookNum, chapter } — 이전 bc 링크의 책+장 컨텍스트
  // 1. 표준 docId 패턴: /wol/d/r8/lp-ko/{docId}
  const docIdMatch = href.match(/\/wol\/d\/r8\/lp-ko\/(\d+)/);
  if (docIdMatch) {
    const vaultPath = map[docIdMatch[1]];
    if (vaultPath) {
      const fragment = parseFragment(href);
      return `[[${vaultPath}${fragment}|${displayText}]]`;
    }
  }

  // 2. 성경 장 패턴: /wol/b/r8/lp-ko/nwtsty/{bookNum}/{chapter}
  const bibleMatch = href.match(/\/wol\/b\/r8\/lp-ko\/nwtsty\/(\d+)\/(\d+)/);
  if (bibleMatch) {
    const bNum = parseInt(bibleMatch[1], 10);
    const bCh = parseInt(bibleMatch[2], 10);
    const key = `b:${bNum}:${bCh}`;
    const vaultPath = map[key];
    if (vaultPath) return `[[${vaultPath}|${displayText}]]${makeBibleTag(bNum, bCh, null)}`;
  }

  // 3. 성경 구절 참조: /wol/bc/ → 표시 텍스트에서 책+장+절 파싱
  if (href.includes("/wol/bc/")) {
    const normalized = displayText.replace(/\u00A0/g, " ");
    const cleaned = cleanBibleRefText(displayText);

    // 3a. 표준: "책이름 장:절"
    const ref = parseBibleRef(displayText);
    if (ref) {
      const key = `b:${ref.bookNum}:${ref.chapter}`;
      const vaultPath = map[key];
      if (vaultPath) {
        const crossCh = extractCrossChapterRange(normalized);
        if (crossCh) return `[[${vaultPath}#^v${ref.verse}|${displayText}]]${makeCrossChapterTags(ref.bookNum, crossCh)}`;
        const allV = extractAllVerses(normalized);
        return `[[${vaultPath}#^v${ref.verse}|${displayText}]]${allV ? makeBibleVerseTags(ref.bookNum, ref.chapter, allV) : makeBibleTag(ref.bookNum, ref.chapter, ref.verse)}`;
      }
    }

    // 3b. 전처리 후 재시도 (에서, 작은따옴표, 참조, 공백 등)
    if (cleaned !== normalized) {
      const ref2 = parseBibleRef(cleaned);
      if (ref2) {
        const key = `b:${ref2.bookNum}:${ref2.chapter}`;
        const vaultPath = map[key];
        if (vaultPath) {
          const crossCh = extractCrossChapterRange(cleaned);
          if (crossCh) return `[[${vaultPath}#^v${ref2.verse}|${displayText}]]${makeCrossChapterTags(ref2.bookNum, crossCh)}`;
          const allV = extractAllVerses(cleaned);
          return `[[${vaultPath}#^v${ref2.verse}|${displayText}]]${allV ? makeBibleVerseTags(ref2.bookNum, ref2.chapter, allV) : makeBibleTag(ref2.bookNum, ref2.chapter, ref2.verse)}`;
        }
      }
    }

    // 3c. 장만 (장/편): "다니엘 4장", "시편 23편"
    const chOnly = normalized.match(/^(.+)\s+(\d+)[장편]/);
    if (chOnly) {
      const bookNum = _lookupBook(chOnly[1].trim());
      if (bookNum) {
        const ch = parseInt(chOnly[2], 10);
        const key = `b:${bookNum}:${ch}`;
        const vaultPath = map[key];
        if (vaultPath) return `[[${vaultPath}|${displayText}]]${makeBibleTag(bookNum, ch, null)}`;
      }
    }

    // 3d. 전처리 후 장만: "에스겔'의 예언 9장", "히브리'인들에게 써 보낸 책 11장"
    if (cleaned !== normalized) {
      const chClean = cleaned.match(/^(.+)\s+(\d+)[장편]/);
      if (chClean) {
        const bookNum = _lookupBook(chClean[1].trim());
        if (bookNum) {
          const ch = parseInt(chClean[2], 10);
          const key = `b:${bookNum}:${ch}`;
          const vaultPath = map[key];
          if (vaultPath) return `[[${vaultPath}|${displayText}]]${makeBibleTag(bookNum, ch, null)}`;
        }
      }
    }

    // 3e. 장 범위: "창세 6-9장", "계시록 19-21장의", "시 113-118," → 첫 장으로 링크
    const rangeMatch = normalized.match(/^(.+)\s+(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
      const bookNum = _lookupBook(rangeMatch[1].trim());
      if (bookNum) {
        const chStart = parseInt(rangeMatch[2], 10);
        const chEnd = parseInt(rangeMatch[3], 10);
        const key = `b:${bookNum}:${chStart}`;
        const vaultPath = map[key];
        if (vaultPath) {
          let tags = "";
          for (let c = chStart; c <= chEnd; c++) tags += makeBibleTag(bookNum, c, null);
          return `[[${vaultPath}|${displayText}]]${tags}`;
        }
      }
    }

    // 3f. 단장 성경 절 참조: "유다 6, 7;", "요한 3서 9, 10"
    // word-split 방식: 왼→오른쪽으로 첫 숫자 찾아 책이름 분리
    const scWords = normalized.split(/\s+/);
    for (let i = 1; i < scWords.length; i++) {
      if (!/^\d/.test(scWords[i])) continue;
      const bookName = scWords.slice(0, i).join(" ");
      const bookNum = _lookupBook(bookName);
      if (bookNum && SINGLE_CHAPTER_BOOKS.has(bookNum)) {
        const verseMatch = scWords[i].match(/^(\d+)/);
        if (verseMatch) {
          const verse = parseInt(verseMatch[1], 10);
          const key = `b:${bookNum}:1`;
          const vaultPath = map[key];
          if (vaultPath) {
            const versePart = scWords.slice(i).join(" ");
            const allV = parseVerseSpec(versePart);
            return `[[${vaultPath}#^v${verse}|${displayText}]]${allV ? makeBibleVerseTags(bookNum, 1, allV) : makeBibleTag(bookNum, 1, verse)}`;
          }
        }
        break;
      }
    }

    // 3g. 장만 (장/편 없이): "마태복음 24," — 책이름 + 숫자 + 쉼표/세미콜론
    // normalized 및 cleaned 둘 다 시도
    for (const txt of [normalized, cleaned]) {
      const bareChMatch = txt.match(/^([가-힣\s]+)\s+(\d+)\s*[,;.]?\s*$/);
      if (bareChMatch) {
        const bookNum = _lookupBook(bareChMatch[1].trim());
        if (bookNum && !SINGLE_CHAPTER_BOOKS.has(bookNum)) {
          const ch = parseInt(bareChMatch[2], 10);
          const key = `b:${bookNum}:${ch}`;
          const vaultPath = map[key];
          if (vaultPath) return `[[${vaultPath}|${displayText}]]${makeBibleTag(bookNum, ch, null)}`;
        }
      }
    }

    // 3h. 표제 참조: "시 84: 표제,", "시편 27: 표제," → 장으로 링크
    const titleMatch = normalized.match(/^(.+)\s+(\d+)\s*:.*표제/);
    if (titleMatch) {
      const bookNum = _lookupBook(titleMatch[1].trim());
      if (bookNum) {
        const ch = parseInt(titleMatch[2], 10);
        const key = `b:${bookNum}:${ch}`;
        const vaultPath = map[key];
        if (vaultPath) return `[[${vaultPath}|${displayText}]]${makeBibleTag(bookNum, ch, null)}`;
      }
    }

    // 3i-3k. 이어지는 참조 (이전 bc 링크의 책 컨텍스트 사용)
    if (lastBcCtx) {
      // 3i. 장:절: "54:13, 14", "47:13-26"
      const contText = cleaned.replace(/^참조\s+/, "");
      const contMatch = contText.match(/^(\d+):(\d+)/);
      if (contMatch) {
        const chapter = parseInt(contMatch[1], 10);
        const verse = parseInt(contMatch[2], 10);
        const key = `b:${lastBcCtx.bookNum}:${chapter}`;
        const vaultPath = map[key];
        if (vaultPath) {
          const crossCh = extractCrossChapterRange(contText);
          if (crossCh) return `[[${vaultPath}#^v${verse}|${displayText}]]${makeCrossChapterTags(lastBcCtx.bookNum, crossCh)}`;
          const allV = extractAllVerses(contText);
          return `[[${vaultPath}#^v${verse}|${displayText}]]${allV ? makeBibleVerseTags(lastBcCtx.bookNum, chapter, allV) : makeBibleTag(lastBcCtx.bookNum, chapter, verse)}`;
        }
      }
      // 3j. 장 범위 이어짐: "42-45장"
      const contRange = normalized.match(/^(\d+)\s*[-–]\s*(\d+)[장편]?/);
      if (contRange) {
        const chStart = parseInt(contRange[1], 10);
        const chEnd = parseInt(contRange[2], 10);
        const key = `b:${lastBcCtx.bookNum}:${chStart}`;
        const vaultPath = map[key];
        if (vaultPath) {
          let tags = "";
          for (let c = chStart; c <= chEnd; c++) tags += makeBibleTag(lastBcCtx.bookNum, c, null);
          return `[[${vaultPath}|${displayText}]]${tags}`;
        }
      }
      // 3k. 절만: "21", "9-11", "30,"
      const verseOnly = normalized.match(/^(\d+)/);
      if (verseOnly && lastBcCtx.chapter) {
        const verse = parseInt(verseOnly[1], 10);
        const key = `b:${lastBcCtx.bookNum}:${lastBcCtx.chapter}`;
        const vaultPath = map[key];
        if (vaultPath) {
          const allV = extractAllVerses(normalized);
          return `[[${vaultPath}#^v${verse}|${displayText}]]${allV ? makeBibleVerseTags(lastBcCtx.bookNum, lastBcCtx.chapter, allV) : makeBibleTag(lastBcCtx.bookNum, lastBcCtx.chapter, verse)}`;
        }
      }
    }
  }

  // 4. 유사 콘텐츠: /wol/dsim/r8/lp-ko/{docId}
  const dsimMatch = href.match(/\/wol\/dsim\/r8\/lp-ko\/(\d+)/);
  if (dsimMatch) {
    const vaultPath = map[dsimMatch[1]];
    if (vaultPath) {
      const fragment = parseFragment(href);
      return `[[${vaultPath}${fragment}|${displayText}]]`;
    }
  }

  // 5. pc/tc 리다이렉트 캐시 조회
  if (href.includes("/wol/pc/") || href.includes("/wol/tc/")) {
    const cached = _redirectCache[href];
    if (cached) {
      // 캐시값이 "docId#fragment" 형태일 수 있음
      const [cachedDocId, cachedFrag] = cached.split("#");
      const vaultPath = map[cachedDocId];
      if (vaultPath) {
        const fragment = cachedFrag ? `#^p${cachedFrag}` : "";
        return `[[${vaultPath}${fragment}|${displayText}]]`;
      }
    }
  }

  return null;
};

// ── HTML에서 미해결 pc/tc 링크 배치 해결 ────
export const preResolveLinks = async (html) => {
  const $ = cheerio.load(html);
  const toResolve = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (
      (href.includes("/wol/pc/") || href.includes("/wol/tc/")) &&
      (!_redirectCache[href] || !String(_redirectCache[href]).includes("#"))
    ) {
      toResolve.add(href);
    }
  });

  if (toResolve.size === 0) return;

  console.log(`  [preResolve] ${toResolve.size}개 미캐시 링크 해석 시작...`);
  let resolved = 0;
  for (const href of toResolve) {
    try {
      const fullUrl = href.startsWith("http")
        ? href
        : `https://wol.jw.org${href}`;
      const redirectUrl = await getRedirectTargetAPI(fullUrl);
      if (redirectUrl) {
        const docIdMatch = redirectUrl.match(/\/wol\/d\/r8\/lp-ko\/(\d+)/);
        if (docIdMatch) {
          // fragment 보존: #h=12:0-14:27 → 시작 pid "12"
          const fragMatch = redirectUrl.match(/#h=(\d+)/);
          _redirectCache[href] = fragMatch
            ? `${docIdMatch[1]}#${fragMatch[1]}`
            : docIdMatch[1];
        }
      }
      resolved++;
      if (resolved % 20 === 0 || resolved === toResolve.size) {
        console.log(`  [preResolve] ${resolved}/${toResolve.size} 완료`);
      }
      await delay(100);
    } catch (e) {
      resolved++;
      console.log(`  [preResolve] ${resolved}/${toResolve.size} 실패: ${e.message?.substring(0, 60)}`);
    }
  }

  saveRedirectCache();
};

// ── 공유 아티클 콘텐츠 파서 (async — pc/tc 리다이렉트 해결) ──
export const parseArticleContent = async (html, docidMap = {}) => {
  await preResolveLinks(html);

  const $ = cheerio.load(html);

  $("script, style, nav, header, footer, .navLinks, .sidebar").remove();

  // WOL 링크 → Obsidian wikilink 변환, 나머지는 텍스트로
  let lastBcCtx = null; // bc 링크 연속 참조 컨텍스트 { bookNum, chapter }
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    const link = resolveLink(docidMap, href, text, lastBcCtx);
    if (link) {
      $(el).replaceWith(link);
    } else {
      $(el).replaceWith(text);
    }
    // bc 링크의 책+장 컨텍스트 추적
    if (href.includes("/wol/bc/")) {
      const normalized = text.replace(/\u00A0/g, " ");
      const cleaned = cleanBibleRefText(text);
      // 표준 파싱
      let ref = parseBibleRef(text);
      // 전처리 후 재시도
      if (!ref && cleaned !== normalized) ref = parseBibleRef(cleaned);
      if (ref) {
        lastBcCtx = { bookNum: ref.bookNum, chapter: ref.chapter };
      } else {
        // 장만 참조 (장/편): "다니엘 4장"
        const chOnly = (normalized.match(/^(.+)\s+(\d+)[장편]/) || cleaned.match(/^(.+)\s+(\d+)[장편]/));
        if (chOnly) {
          const bookNum = _lookupBook(chOnly[1].trim());
          if (bookNum) lastBcCtx = { bookNum, chapter: parseInt(chOnly[2], 10) };
        }
        // 장 범위: "창세 6-9장" → 마지막 장 기준
        else {
          const rangeMatch = normalized.match(/^(.+)\s+(\d+)\s*[-–]\s*(\d+)/);
          if (rangeMatch) {
            const bookNum = _lookupBook(rangeMatch[1].trim());
            if (bookNum) lastBcCtx = { bookNum, chapter: parseInt(rangeMatch[3], 10) };
          }
          // 단장 성경 또는 장만 참조: word-split 방식
          else {
            const scWords = normalized.split(/\s+/);
            let ctxSet = false;
            for (let i = 1; i < scWords.length; i++) {
              if (!/^\d/.test(scWords[i])) continue;
              const bookName = scWords.slice(0, i).join(" ");
              const bookNum = _lookupBook(bookName);
              if (bookNum && SINGLE_CHAPTER_BOOKS.has(bookNum)) {
                lastBcCtx = { bookNum, chapter: 1 };
                ctxSet = true;
              } else if (bookNum) {
                lastBcCtx = { bookNum, chapter: parseInt(scWords[i], 10) };
                ctxSet = true;
              }
              if (ctxSet) break;
            }
            // 이어짐: 장:절만, 장 범위만
            if (!ctxSet && lastBcCtx) {
              const contMatch = normalized.match(/^(\d+):(\d+)/);
              if (contMatch) {
                lastBcCtx = { ...lastBcCtx, chapter: parseInt(contMatch[1], 10) };
              } else {
                const contRange = normalized.match(/^(\d+)\s*[-–]\s*(\d+)[장편]?/);
                if (contRange) {
                  lastBcCtx = { ...lastBcCtx, chapter: parseInt(contRange[2], 10) };
                }
              }
            }
          }
        }
      }
    }
  });

  $(".footnote, .fn, #footnotes, .sourceCredit").remove();

  let articleEl =
    $("#article").length > 0
      ? $("#article")
      : $("article").length > 0
      ? $("article")
      : $(".article").length > 0
      ? $(".article")
      : null;

  const lines = [];

  // 요소의 id 속성에서 블록 ID 접미사 생성 ("p12" → " ^p12")
  const blockIdSuffix = (el) => {
    const id = $(el).attr("id");
    if (!id) return "";
    const m = id.match(/^p(\d+)$/);
    return m ? ` ^p${m[1]}` : "";
  };

  const extractText = (container) => {
    container.children().each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      const text = normalizeText($(el).text());

      if (!text) return;

      if (tag === "h1") {
        lines.push(`# ${text}${blockIdSuffix(el)}`);
      } else if (tag === "h2") {
        lines.push(`## ${text}${blockIdSuffix(el)}`);
      } else if (tag === "h3") {
        lines.push(`### ${text}${blockIdSuffix(el)}`);
      } else if (tag === "p") {
        lines.push(`${text}${blockIdSuffix(el)}`);
      } else if (tag === "ul" || tag === "ol") {
        $(el)
          .find("li")
          .each((_, li) => {
            const liText = normalizeText($(li).text());
            if (liText) lines.push(`- ${liText}`);
          });
      } else if (tag === "blockquote") {
        lines.push(`> ${text}`);
      } else if (["div", "section", "main"].includes(tag)) {
        extractText($(el));
      }
    });
  };

  if (articleEl) {
    extractText(articleEl);
  } else {
    extractText($("body"));
  }

  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n\n");
};
