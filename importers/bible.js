import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

import { VAULT_ORG_BIBLE_PATH, VAULT_BASE } from "../constant.js";
import {
  getLvPageAPI,
  getPublicationTOCAPI,
  getPublicationArticleAPI,
} from "../requests.js";
import { parseArticleContent, addMapping, resolveLink, preResolveLinks, setBookNameMap, parseCrossRefText } from "../docid-map.js";

const WOL_BASE_URL = "https://wol.jw.org";
const BIBLE_NAV_URL = `${WOL_BASE_URL}/ko/wol/binav/r8/lp-ko`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
const sanitizeFilename = (name) =>
  name
    .replace(/[\u200B\u200F\u2060\uFEFF]/g, "")
    .replace(/[\u2018\u2019\u02BC\u2035]/g, "'")
    .replace(/\u2015/g, "\u2014")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .trim();

// 각 성경 책의 총 장 수 (불변 데이터)
const CHAPTER_COUNTS = [
  0, // index 0 unused
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, // 1-10
  22, 25, 29, 36, 10, 13, 10, 42, 150, 31, // 11-20
  12, 8, 66, 52, 5, 48, 12, 14, 3, 9, // 21-30
  1, 4, 7, 3, 3, 3, 2, 14, 4, // 31-39
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6, // 40-49
  4, 4, 5, 3, 6, 4, 3, 1, 13, 5, // 50-59
  5, 3, 5, 1, 1, 1, 22, // 60-66
];

// 부록 출판물
const APPENDICES = [
  { pubId: "97", title: "부록 가" },
  { pubId: "116", title: "부록 나" },
  { pubId: "139", title: "부록 다" },
];

// ── binav 페이지에서 책 목록 파싱 ─────────────────
const parseBibleNav = (html) => {
  const $ = cheerio.load(html);
  const books = [];
  const seen = new Set();

  $('a[href*="/binav/r8/lp-ko/nwtsty/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/\/nwtsty\/(\d+)$/);
    if (!match) return;
    const num = parseInt(match[1], 10);
    if (num < 1 || num > 66 || seen.has(num)) return;
    seen.add(num);
    books.push({
      num,
      name: normalizeText($(el).find("span.name").text()),
      chapters: CHAPTER_COUNTS[num],
      category: num <= 39 ? "히브리어-아람어 성경" : "그리스도인 그리스어 성경",
    });
  });

  return books.sort((a, b) => a.num - b.num);
};

// ── 책 번호 → 폴더 경로 매핑 ──────────────────────
const buildBookPathMap = (books) => {
  const map = {};
  for (const book of books) {
    const padded = String(book.num).padStart(2, "0");
    const folderName = `${padded}. ${book.name}`;
    map[book.num] = {
      name: book.name,
      category: book.category,
      folderName,
      basePath: `${VAULT_ORG_BIBLE_PATH}${book.category}/${folderName}/`,
    };
  }
  return map;
};

// ── 성경 장 본문 파싱 (커스텀, async) ───────────────
const parseBibleChapter = async (html, bookName, chapterNum, bookPathMap, docidMap) => {
  // pc/tc 리다이렉트 사전 해결
  await preResolveLinks(html);

  const $ = cheerio.load(html);
  $("script, style, nav, header, footer").remove();

  const lines = [];
  lines.push(`# ${bookName} ${chapterNum}장`);

  // docId 추출 (첫 번째 dx 링크에서)
  let chapterDocId = null;
  const firstDx = $('a[href*="/wol/dx/r8/lp-ko/"]').first();
  if (firstDx.length) {
    const dxMatch = firstDx.attr("href").match(/\/wol\/dx\/r8\/lp-ko\/(\d+)\//);
    if (dxMatch) chapterDocId = dxMatch[1];
  }

  // ── 절별 보조 데이터 수집 ─────────────────────
  const verseData = {};
  const getVD = (num) => {
    if (!verseData[num])
      verseData[num] = { footnotes: [], crossRefs: [], studyRefs: [], indexRefs: [] };
    return verseData[num];
  };

  // ── 헬퍼: 요소 내 링크를 resolveLink로 통합 변환 후 텍스트 추출
  const convertLinksAndText = (el) => {
    const $el = $(el).clone();

    $el.find("a").each((_, a) => {
      const href = $(a).attr("href") || "";
      const text = normalizeText($(a).text());
      const link = resolveLink(docidMap, href, text);
      if (link) {
        $(a).replaceWith(link);
      } else {
        $(a).replaceWith(text);
      }
    });

    return normalizeText($el.text());
  };

  // studyDiscover: 각주 & 색인 (절별 section)
  $("#studyDiscover .section[data-key]").each((_, sec) => {
    const key = $(sec).attr("data-key") || "";
    const verseNum = key.split("-").pop();
    if (!verseNum) return;
    const vd = getVD(verseNum);

    // 각주
    $(sec).find(".item.footnote").each((_, li) => {
      const marker = $(li).find(".marker").first().text().trim();
      const pEl = $(li).find("p").first();
      const text = convertLinksAndText(pEl);
      if (text) vd.footnotes.push(marker ? `<sup>${marker}</sup> ${text}` : text);
    });

    // 연구 자료 찾아보기
    $(sec).find(".item.ref-rsg .scalableui").each((_, span) => {
      $(span).children().each((_, child) => {
        const text = convertLinksAndText(child);
        if (text) vd.studyRefs.push(text);
      });
    });

    // 출판물 색인
    $(sec).find(".item.ref-dx .scalableui").each((_, span) => {
      $(span).find("p").each((_, p) => {
        const text = convertLinksAndText(p);
        if (text) vd.indexRefs.push(text);
      });
    });
  });

  // studyMarginals: 참조 성구 (절별)
  $("#studyMarginals .marginalExpander").each((_, el) => {
    const source = normalizeText($(el).find(".source").text());
    const refs = normalizeText($(el).find("span.marginal").text());
    if (!source || !refs) return;
    const verseMatch = source.match(/(\d+)\s*$/);
    if (verseMatch) {
      getVD(verseMatch[1]).crossRefs.push(parseCrossRefText(refs, docidMap));
    }
  });

  // ── 본문 처리 ─────────────────────────────
  const content = $(".bodyTxt").length
    ? $(".bodyTxt")
    : $("#article").length
    ? $("#article")
    : $("article").length
    ? $("article")
    : $("body");

  // 절 번호를 마커로 교체
  content.find('a[href*="/wol/dx/"]').each((_, el) => {
    const num = $(el).text().trim();
    $(el).replaceWith(`\n【V${num}】`);
  });

  // 각주 마커를 placeholder로 유지 (.text() 후 <sup>로 변환)
  content.find('a[href*="/wol/fn/"]').each((_, el) => {
    const marker = $(el).text().trim();
    $(el).replaceWith(marker ? `【FN${marker}】` : "");
  });

  // 상호참조 마커 제거
  content.find('a[href*="/wol/bc/"]').each((_, el) => {
    $(el).remove();
  });

  // 나머지 링크 처리 (resolveLink 통합)
  content.find("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = normalizeText($(el).text());
    const link = resolveLink(docidMap, href, text);
    if (link) {
      $(el).replaceWith(link);
    } else {
      $(el).replaceWith(text);
    }
  });

  // 텍스트 추출 → 절 마커로 분리
  const rawText = content.text();
  const parts = rawText.split(/【V(\d+)】/);

  // WOL에서 매 장의 첫 구절은 절 번호 "1" 대신 장 번호를 표시하므로 보정
  if (parts.length >= 2) {
    const firstNum = parseInt(parts[1], 10);
    if (firstNum === chapterNum && chapterNum !== 1) {
      parts[1] = "1";
    }
  }

  // parts[0] = 첫 절 전 텍스트 (섹션 헤더 등)
  const prelude = normalizeText(parts[0]);
  if (prelude) lines.push(prelude);

  for (let i = 1; i < parts.length; i += 2) {
    const verseNum = parts[i];
    const verseText = normalizeText(parts[i + 1] || "");
    if (verseText) {
      lines.push(`**${verseNum}** ${verseText.replace(/【FN(.+?)】/g, '<sup>$1</sup>')} ^v${verseNum}`);
    }

    // 절별 보조 데이터 (하나의 접이식 callout)
    const vd = verseData[verseNum];
    if (vd) {
      const sections = [];
      const escBullet = (t) => t.replace(/^\* /,  '\\* ');
      if (vd.footnotes.length > 0) {
        sections.push([`> **📝 각주**`, ...vd.footnotes.map((fn) => `> ${escBullet(fn)}`)]);
      }
      if (vd.crossRefs.length > 0) {
        sections.push([`> **📖 참조 성구**`, ...vd.crossRefs.map((r) => `> ${escBullet(r)}`)]);
      }
      if (vd.studyRefs.length > 0) {
        sections.push([`> **📚 연구 자료**`, ...vd.studyRefs.map((r) => `> ${escBullet(r)}`)]);
      }
      if (vd.indexRefs.length > 0) {
        sections.push([`> **🗂️ 출판물 색인**`, ...vd.indexRefs.map((r) => `> ${escBullet(r)}`)]);
      }
      if (sections.length > 0) {
        const body = sections.map((s) => s.join("\n")).join("\n>\n> ---\n>\n");
        lines.push(`> [!note]- ${verseNum}절 참고\n${body}`);
      }
    }
  }

  return {
    content: lines.filter((l) => l.trim()).join("\n\n"),
    docId: chapterDocId,
  };
};

// ── UI: 성경 책 목록 반환 ──────────────────────────
export const getBibleSections = async () => {
  const html = await getLvPageAPI(BIBLE_NAV_URL);
  const books = parseBibleNav(html);

  return {
    categories: [
      {
        title: "히브리어-아람어 성경",
        books: books.filter((b) => b.num <= 39),
      },
      {
        title: "그리스도인 그리스어 성경",
        books: books.filter((b) => b.num >= 40),
      },
    ],
    appendices: APPENDICES,
  };
};

// ── Phase 1: 매핑 구축 ────────────────────────────
export const buildBibleMappings = async (docidMap, selection = null) => {
  console.log("Building Bible mappings...");

  let books;
  if (selection === null) {
    const html = await getLvPageAPI(BIBLE_NAV_URL);
    books = parseBibleNav(html);
  } else {
    books = selection.books || [];
  }

  const bookPathMap = buildBookPathMap(books);

  // 장 파일 경로를 b:{bookNum}:{chapter} 키로 등록
  for (const book of books) {
    const info = bookPathMap[book.num];
    for (let ch = 1; ch <= book.chapters; ch++) {
      const fileName = `${book.name} ${ch}장`;
      const filePath = `${info.basePath}${fileName}.md`;
      const key = `b:${book.num}:${ch}`;
      const relative = filePath.replace(VAULT_BASE, "").replace(/\.md$/, "");
      docidMap[key] = relative;
    }
  }

  // bookNameMap 생성·저장 (성경 구절 표시 텍스트 파싱용)
  const nameMap = {};
  for (const book of books) {
    nameMap[book.name] = book.num;
  }
  setBookNameMap(nameMap);

  const includeAppendix = selection === null || selection.includeAppendix;

  console.log(`Bible mappings registered for ${books.length} books.`);
  return { books, bookPathMap, includeAppendix };
};

// ── Phase 2: 콘텐츠 임포트 ────────────────────────
export const importBible = async (
  listOfExistingFiles,
  docidMap,
  prepared
) => {
  console.log("\nStarting Bible content import...");

  const { books, bookPathMap, includeAppendix } = prepared;

  for (const book of books) {
    const info = bookPathMap[book.num];
    fs.mkdirSync(info.basePath, { recursive: true });

    console.log(`\n[${book.name}] ${book.chapters} chapters.`);
    let success = 0;
    let skip = 0;

    // ── 소개 ──────────────────────────────
    const introPath = `${info.basePath}소개.md`;
    if (!(introPath in listOfExistingFiles)) {
      try {
        console.log(`  [${book.name}] 소개 가져오는 중...`);
        const url = `${WOL_BASE_URL}/ko/wol/bibledocument/r8/lp-ko/nwtsty/${book.num}/introduction`;
        const html = await getLvPageAPI(url);
        console.log(`  [${book.name}] 소개 HTML 수신 (${html.length}자), 파싱 중...`);
        await delay(200);
        const content = await parseArticleContent(html, docidMap);
        if (content) {
          fs.writeFileSync(introPath, content, { flag: "wx" });
          console.log(`[NEW_FILE] ${introPath}`);
          console.log(`  [${book.name}] 소개 저장 완료 (${content.length}자)`);
        } else {
          console.log(`  [${book.name}] 소개 내용 없음`);
        }
      } catch (e) {
        console.log(`  [${book.name}] 소개 건너뜀: ${e.message?.substring(0, 60)}`);
      }
    }

    // ── 개요 ──────────────────────────────
    const outlinePath = `${info.basePath}개요.md`;
    if (!(outlinePath in listOfExistingFiles)) {
      try {
        console.log(`  [${book.name}] 개요 가져오는 중...`);
        const url = `${WOL_BASE_URL}/ko/wol/bibledocument/r8/lp-ko/nwtsty/${book.num}/outline`;
        const html = await getLvPageAPI(url);
        console.log(`  [${book.name}] 개요 HTML 수신 (${html.length}자), 파싱 중...`);
        await delay(200);
        const content = await parseArticleContent(html, docidMap);
        if (content) {
          fs.writeFileSync(outlinePath, content, { flag: "wx" });
          console.log(`[NEW_FILE] ${outlinePath}`);
          console.log(`  [${book.name}] 개요 저장 완료 (${content.length}자)`);
        } else {
          console.log(`  [${book.name}] 개요 내용 없음`);
        }
      } catch (e) {
        console.log(`  [${book.name}] 개요 건너뜀: ${e.message?.substring(0, 60)}`);
      }
    }

    // ── 각 장 ─────────────────────────────
    for (let ch = 1; ch <= book.chapters; ch++) {
      const fileName = `${book.name} ${ch}장.md`;
      const filePath = `${info.basePath}${fileName}`;

      if (filePath in listOfExistingFiles) {
        skip++;
        continue;
      }

      try {
        const url = `${WOL_BASE_URL}/ko/wol/b/r8/lp-ko/nwtsty/${book.num}/${ch}`;
        const html = await getLvPageAPI(url);
        await delay(150);

        const result = await parseBibleChapter(
          html,
          book.name,
          ch,
          bookPathMap,
          docidMap
        );

        if (!result.content) {
          console.warn(`  Empty: ${book.name} ${ch}장, skipping.`);
          continue;
        }

        // docId가 있으면 매핑에 추가 (다른 임포터에서 참조 가능)
        if (result.docId) {
          const relative = filePath
            .replace(VAULT_BASE, "")
            .replace(/\.md$/, "");
          docidMap[result.docId] = relative;
        }

        fs.writeFileSync(filePath, result.content, { flag: "wx" });
        console.log(`[NEW_FILE] ${filePath}`);
        success++;
      } catch (e) {
        if (e.code !== "EEXIST") {
          console.error(`  Failed: ${book.name} ${ch}장 - ${e.message}`);
        } else {
          skip++;
        }
      }
    }

    console.log(`  Done: ${success} saved, ${skip} skipped.`);
  }

  // ── 부록 임포트 ─────────────────────────
  if (includeAppendix) {
    for (const appendix of APPENDICES) {
      const appendixFolder = `${VAULT_ORG_BIBLE_PATH}${appendix.title}/`;
      console.log(`\n[${appendix.title}] Fetching TOC...`);

      let toc;
      try {
        toc = await getPublicationTOCAPI(`nwtsty/${appendix.pubId}`);
        await delay(200);
      } catch (e) {
        console.error(`  Failed to fetch TOC: ${e.message}`);
        continue;
      }

      const $ = cheerio.load(toc);
      const articles = [];
      $('a[href*="/wol/d/r8/lp-ko/"]').each((_, el) => {
        const href = $(el).attr("href");
        const docId = href.split("/").pop();
        const title = normalizeText($(el).text());
        if (docId && title) articles.push({ docId, title });
      });

      if (articles.length === 0) {
        console.log(`  No articles found.`);
        continue;
      }

      fs.mkdirSync(appendixFolder, { recursive: true });
      console.log(`  ${articles.length} articles found.`);

      let aSuccess = 0;
      let aSkip = 0;

      for (let i = 0; i < articles.length; i++) {
        const { docId, title } = articles[i];
        const num = String(i + 1).padStart(2, "0");
        const safeTitle = sanitizeFilename(title) || docId;
        const filePath = `${appendixFolder}${num}. ${safeTitle}.md`;

        addMapping(docidMap, docId, filePath);

        if (filePath in listOfExistingFiles) {
          aSkip++;
          continue;
        }

        try {
          const articleHtml = await getPublicationArticleAPI(docId);
          await delay(150);
          const content = await parseArticleContent(articleHtml, docidMap);
          if (!content) {
            aSkip++;
            continue;
          }
          fs.writeFileSync(filePath, content, { flag: "wx" });
          console.log(`[NEW_FILE] ${filePath}`);
          aSuccess++;
        } catch (e) {
          if (e.code !== "EEXIST") {
            console.error(`  Failed: ${title} - ${e.message}`);
          } else {
            aSkip++;
          }
        }
      }

      console.log(`  Done: ${aSuccess} saved, ${aSkip} skipped.`);
    }
  }

  console.log("\nBible import complete.");
};
