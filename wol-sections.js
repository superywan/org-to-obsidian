/**
 * WOL 섹션 URL 동적 해석 모듈
 *
 * WOL lv ID는 주기적으로 변경됨 (예: 50608 → 50618).
 * 루트 페이지 https://wol.jw.org/ko/wol/lv/r8/lp-ko/0 에서
 * 섹션 제목으로 현재 URL을 동적으로 찾음.
 */

import * as cheerio from "cheerio";
import { getLvPageAPI } from "./requests.js";

const WOL_ROOT_URL = "https://wol.jw.org/ko/wol/lv/r8/lp-ko/0";
const WOL_BASE_URL = "https://wol.jw.org";

// 섹션 이름 → 한국어 키워드 매핑
const SECTION_KEYWORDS = {
  bible: "성서",
  glossary: "용어",
  insight: "통찰",
  "wol-index": "색인",
  watchtower: "파수대",
  awake: "깨어라",
  books: "서적",
  meeting: "집회",
  "kingdom-service": "왕국 봉사",
  brochures: "팜플렛",
  tracts: "전도지",
  programs: "프로그램",
  "web-series": "연재",
  guidelines: "지침",
};

let cachedSections = null;

/**
 * 루트 lv 페이지에서 모든 섹션을 가져옴 (세션당 1회 캐시)
 * @returns {Promise<Array<{title: string, url: string, id: string}>>}
 */
export const fetchWolSections = async () => {
  if (cachedSections) return cachedSections;

  let html;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      html = await getLvPageAPI(WOL_ROOT_URL);
      break;
    } catch (e) {
      console.error(`[wol-sections] 루트 페이지 요청 실패 (${attempt}/3): ${e.message}`);
      if (attempt === 3) {
        throw new Error(`WOL 루트 페이지를 가져올 수 없습니다: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  const $ = cheerio.load(html);
  const sections = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const match = href.match(/\/wol\/lv\/r8\/lp-ko\/0\/(\d+)/);
    if (!match) return;
    const title = $(el).text().replace(/\s+/g, " ").trim();
    if (!title) return;
    const fullUrl = href.startsWith("http") ? href : `${WOL_BASE_URL}${href}`;
    sections.push({ title, url: fullUrl, id: match[1] });
  });

  if (sections.length === 0) {
    throw new Error("WOL 루트 페이지에서 섹션을 찾을 수 없습니다");
  }

  console.log(`[wol-sections] ${sections.length}개 섹션 발견 (캐시됨)`);
  cachedSections = sections;
  return sections;
};

/**
 * 섹션 이름으로 현재 URL을 찾음
 * @param {string} sectionName - SECTION_KEYWORDS의 키 (예: "kingdom-service")
 * @returns {Promise<string>} - 전체 URL
 * @throws {Error} - 섹션을 찾을 수 없을 때
 */
export const getSectionUrl = async (sectionName) => {
  const keyword = SECTION_KEYWORDS[sectionName];
  if (!keyword) {
    throw new Error(`Unknown section name: ${sectionName}. Valid: ${Object.keys(SECTION_KEYWORDS).join(", ")}`);
  }

  const sections = await fetchWolSections();
  const found = sections.find((s) => s.title.includes(keyword));

  if (!found) {
    const available = sections.map((s) => s.title).join(", ");
    throw new Error(
      `Section "${sectionName}" (keyword: "${keyword}") not found. Available: ${available}`
    );
  }

  return found.url;
};

/** 캐시 초기화 (테스트용) */
export const clearSectionCache = () => {
  cachedSections = null;
};
