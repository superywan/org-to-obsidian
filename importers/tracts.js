import fs from "fs";
import * as cheerio from "cheerio";

import { VAULT_ORG_TRACTS_PATH } from "../constant.js";
import {
  getLvPageAPI,
  getPublicationTOCAPI,
  getPublicationArticleAPI,
} from "../requests.js";
import { parseArticleContent, addMapping } from "../docid-map.js";
import { getSectionUrl } from "../wol-sections.js";

const WOL_BASE_URL = "https://wol.jw.org";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
const sanitizeFilename = (name) => name.replace(/[/\\?%*:|"<>]/g, "-").trim();

// /wol/publication/ 링크 파싱 (모던 전도지)
const parsePublicationLinks = (html) => {
  const $ = cheerio.load(html);
  const publications = [];

  $('a[href*="/wol/publication/r8/lp-ko/"]').each((_, el) => {
    const href = $(el).attr("href");
    const abbrev = href.split("/").pop();
    const title = normalizeText($(el).text());
    if (abbrev && title) {
      publications.push({ title, abbrev });
    }
  });

  return publications;
};

// /wol/d/ 아티클 링크 파싱 (왕국소식·구형 전도지용)
const parseDocLinks = (html) => {
  const $ = cheerio.load(html);
  const docs = [];
  const seen = new Set();

  $('a[href*="/wol/d/r8/lp-ko/"]').each((_, el) => {
    const href = $(el).attr("href");
    const docId = href.split("/").pop();
    const title = normalizeText($(el).text());
    if (docId && !seen.has(docId)) {
      seen.add(docId);
      docs.push({ title, docId });
    }
  });

  return docs;
};

// /wol/lv/ 링크 파싱
const parseLvLinks = (html) => {
  const $ = cheerio.load(html);
  const links = [];
  const seen = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const match = href.match(/\/wol\/lv\/r8\/lp-ko\/0\/(\d+)/);
    if (match && !seen.has(href)) {
      seen.add(href);
      const title = normalizeText($(el).text());
      const fullUrl = href.startsWith("http") ? href : `${WOL_BASE_URL}${href}`;
      links.push({ title, url: fullUrl });
    }
  });

  return links;
};

const getLvId = (url) => {
  const m = url.match(/\/wol\/lv\/r8\/lp-ko\/0\/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

// lv 트리 재귀 탐색: pub 링크와 doc 링크 둘 다 수집
const collectAllItems = async (startUrl, visited = new Set(), minId = 0, contextTitle = "") => {
  if (visited.has(startUrl)) return { pubs: [], docs: [] };
  visited.add(startUrl);

  const currentId = getLvId(startUrl);
  const effectiveMinId = Math.max(minId, currentId);

  console.log(`  Scanning: ${startUrl}`);

  let html;
  try {
    html = await getLvPageAPI(startUrl);
    await delay(200);
  } catch (e) {
    console.error(`  Failed to fetch ${startUrl}: ${e.message}`);
    return { pubs: [], docs: [] };
  }

  const pubLinks = parsePublicationLinks(html);
  const docLinks = parseDocLinks(html).map((d) => ({
    ...d,
    title: d.title || contextTitle || d.docId,
  }));
  const lvLinks = parseLvLinks(html).filter(({ url }) => getLvId(url) > effectiveMinId);

  let allPubs = [...pubLinks];
  let allDocs = [...docLinks];

  for (const { title: lvTitle, url } of lvLinks) {
    const sub = await collectAllItems(url, visited, effectiveMinId, lvTitle);
    allPubs = allPubs.concat(sub.pubs);
    allDocs = allDocs.concat(sub.docs);
  }

  return { pubs: allPubs, docs: allDocs };
};

// pub-type TOC에서 챕터 링크 파싱
const parseChapterLinks = (html) => {
  const $ = cheerio.load(html);
  const chapters = [];
  const seen = new Set();

  $('a[href*="/wol/d/r8/lp-ko/"]').each((_, el) => {
    const href = $(el).attr("href");
    const docId = href.split("/").pop();
    const title = normalizeText($(el).text());
    if (docId && title && !seen.has(docId)) {
      seen.add(docId);
      chapters.push({ title, docId });
    }
  });

  return chapters;
};

export const getTractSections = async () => {
  const sectionUrl = await getSectionUrl("tracts");
  const html = await getLvPageAPI(sectionUrl);
  const currentId = getLvId(sectionUrl);
  const allLvLinks = parseLvLinks(html);
  const publications = parsePublicationLinks(html);
  const filteredLvLinks = currentId > 0
    ? allLvLinks.filter(link => getLvId(link.url) > currentId)
    : allLvLinks;
  const pubTitlesList = publications.map(p => normalizeText(p.title).toLowerCase());
  const sections = filteredLvLinks.filter(sec => {
    const secTitle = normalizeText(sec.title).toLowerCase();
    return !pubTitlesList.some(pt => pt.length >= 4 && secTitle.startsWith(pt));
  });
  return { sections, publications };
};

export const getSectionContents = async (url) => {
  const html = await getLvPageAPI(url);
  return {
    sections: parseLvLinks(html),
    publications: parsePublicationLinks(html),
  };
};

// Phase 1: 구조 크롤 + docId 매핑 등록
export const buildTractMappings = async (docidMap, pubSelection = null) => {
  console.log("Collecting Tracts from WOL (mapping phase)...");

  let allPubs = [];
  let allDocs = [];

  if (pubSelection === null) {
    const sectionUrl = await getSectionUrl("tracts");
    const result = await collectAllItems(sectionUrl);
    allPubs = result.pubs;
    allDocs = result.docs;
  } else {
    for (const url of (pubSelection.sectionUrls || [])) {
      const result = await collectAllItems(url);
      allPubs = allPubs.concat(result.pubs);
      allDocs = allDocs.concat(result.docs);
    }
    allPubs = allPubs.concat(pubSelection.directPubs || []);
  }

  // 중복 제거
  const seenAbbrev = new Set();
  const pubs = allPubs.filter(({ abbrev }) => {
    if (seenAbbrev.has(abbrev)) return false;
    seenAbbrev.add(abbrev);
    return true;
  });

  const seenDocId = new Set();
  const docs = allDocs.filter(({ docId }) => {
    if (seenDocId.has(docId)) return false;
    seenDocId.add(docId);
    return true;
  });

  console.log(`Found ${pubs.length} pub-type, ${docs.length} doc-type. Building mappings...`);

  // pub-type: TOC에서 챕터 목록 가져오기 + 매핑 등록
  // 전도지는 모든 챕터가 하나의 파일에 합쳐짐 → 모든 docId가 같은 파일을 가리킴
  const preparedPubs = [];
  for (const { title: pubTitle, abbrev } of pubs) {
    let tocHtml;
    try {
      tocHtml = await getPublicationTOCAPI(abbrev);
      await delay(200);
    } catch (e) {
      console.error(`  Failed to fetch TOC for ${abbrev}: ${e.message}`);
      continue;
    }

    const chapters = parseChapterLinks(tocHtml);
    if (chapters.length === 0) continue;

    const safeTitle = sanitizeFilename(pubTitle);
    const filePath = `${VAULT_ORG_TRACTS_PATH}${safeTitle}.md`;

    for (const { docId } of chapters) {
      addMapping(docidMap, docId, filePath);
    }

    preparedPubs.push({ title: pubTitle, abbrev, chapters });
  }

  // doc-type: 매핑 등록
  for (const { title, docId } of docs) {
    const safeTitle = sanitizeFilename(title) || docId;
    const filePath = `${VAULT_ORG_TRACTS_PATH}${safeTitle}.md`;
    addMapping(docidMap, docId, filePath);
  }

  console.log(`Tract mappings registered: ${preparedPubs.length} pub-type, ${docs.length} doc-type.`);
  return { preparedPubs, docs };
};

// Phase 2: 콘텐츠 임포트
export const importTracts = async (listOfExistingFiles, docidMap, preparedData) => {
  const { preparedPubs, docs } = preparedData;

  console.log(`\nStarting tract content import...`);
  fs.mkdirSync(VAULT_ORG_TRACTS_PATH, { recursive: true });

  // pub-type 전도지: TOC → 모든 챕터 연결 → pubTitle.md 단일 파일
  for (const { title: pubTitle, abbrev, chapters } of preparedPubs) {
    const safeTitle = sanitizeFilename(pubTitle);
    const filePath = `${VAULT_ORG_TRACTS_PATH}${safeTitle}.md`;

    if (filePath in listOfExistingFiles) {
      console.log(`  Skip: ${pubTitle}`);
      continue;
    }

    console.log(`  Pub: ${pubTitle} (${abbrev})`);

    const contentParts = [];
    for (const { docId } of chapters) {
      let articleHtml;
      try {
        articleHtml = await getPublicationArticleAPI(docId);
        await delay(150);
      } catch (e) {
        console.error(`  Failed to fetch article ${docId}: ${e.message}`);
        continue;
      }
      const content = await parseArticleContent(articleHtml, docidMap);
      if (content) contentParts.push(content);
    }

    const fullContent = contentParts.join("\n\n");
    if (!fullContent) {
      console.warn(`  Empty content for ${pubTitle}, skipping.`);
      continue;
    }

    try {
      fs.writeFileSync(filePath, fullContent, { flag: "wx" });
      console.log(`[NEW_FILE] ${filePath}`);
      console.log(`  Saved: ${safeTitle}.md`);
    } catch (e) {
      if (e.code !== "EEXIST") {
        console.error(`  Failed to write ${filePath}: ${e.message}`);
      } else {
        console.log(`  Skip (exists): ${safeTitle}.md`);
      }
    }
  }

  // doc-type 전도지: 아티클 직접 fetch → title.md 단일 파일
  for (const { title, docId } of docs) {
    const safeTitle = sanitizeFilename(title) || docId;
    const filePath = `${VAULT_ORG_TRACTS_PATH}${safeTitle}.md`;

    if (filePath in listOfExistingFiles) {
      continue;
    }

    let articleHtml;
    try {
      articleHtml = await getPublicationArticleAPI(docId);
      await delay(150);
    } catch (e) {
      console.error(`  Failed to fetch article ${docId}: ${e.message}`);
      continue;
    }

    const content = await parseArticleContent(articleHtml, docidMap);
    if (!content) {
      console.warn(`  Empty: ${title} (${docId}), skipping.`);
      continue;
    }

    try {
      fs.writeFileSync(filePath, content, { flag: "wx" });
      console.log(`[NEW_FILE] ${filePath}`);
      console.log(`  Saved: ${safeTitle}.md`);
    } catch (e) {
      if (e.code !== "EEXIST") {
        console.error(`  Failed to write ${filePath}: ${e.message}`);
      }
    }
  }

  console.log("\nTracts import complete.");
};
