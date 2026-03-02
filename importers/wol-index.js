import fs from "fs";
import * as cheerio from "cheerio";

import { VAULT_ORG_INDEX_PATH } from "../constant.js";
import { getLvPageAPI, getPublicationArticleAPI } from "../requests.js";
import { parseArticleContent, addMapping } from "../docid-map.js";
import { getSectionUrl } from "../wol-sections.js";

const WOL_BASE_URL = "https://wol.jw.org";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
const sanitizeFilename = (name) => name.replace(/[/\\?%*:|"<>]/g, "-").trim();

const getLvId = (url) => {
  const m = url.match(/\/wol\/lv\/r8\/lp-ko\/0\/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

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

const parseArticleLinks = (html) => {
  const $ = cheerio.load(html);
  const articles = [];
  const seen = new Set();

  $('a[href*="/wol/d/r8/lp-ko/"]').each((_, el) => {
    const href = $(el).attr("href");
    const docId = href.split("/").pop();
    const title = normalizeText($(el).text());
    if (docId && title && !seen.has(docId)) {
      seen.add(docId);
      articles.push({ title, docId });
    }
  });

  return articles;
};

const collectAllArticles = async (startUrl, visited = new Set(), minId = 0) => {
  if (visited.has(startUrl)) return [];
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
    return [];
  }

  const articles = parseArticleLinks(html);
  const lvLinks = parseLvLinks(html).filter(
    ({ url }) => getLvId(url) > effectiveMinId
  );

  let allArticles = [...articles];
  for (const { url } of lvLinks) {
    const sub = await collectAllArticles(url, visited, effectiveMinId);
    allArticles = allArticles.concat(sub);
  }

  return allArticles;
};

// UI용: 그룹별 섹션 목록 반환
// 출판물 색인 → children: [색인 1986-2026, 색인 1971-1985]
// 연구 자료   → children: [] (자체가 선택 단위)
// 동영상 자료 → children: [] (자체가 선택 단위)
export const getIndexSections = async () => {
  const indexUrl = await getSectionUrl("wol-index");
  const rootHtml = await getLvPageAPI(indexUrl);
  await delay(200);

  const rootId = getLvId(indexUrl);
  const topSections = parseLvLinks(rootHtml).filter(
    ({ url }) => getLvId(url) > rootId
  );

  if (topSections.length === 0) return { groups: [] };

  const groups = [];

  for (const section of topSections) {
    let html;
    try {
      html = await getLvPageAPI(section.url);
      await delay(200);
    } catch (e) {
      console.error(`Failed to fetch ${section.url}: ${e.message}`);
      continue;
    }

    const articles = parseArticleLinks(html);

    if (articles.length > 0) {
      // 아티클이 직접 있는 섹션 → 자체가 선택 단위
      groups.push({ title: section.title, url: section.url, children: [] });
    } else {
      // 아티클 없음 → 하위 섹션을 children으로
      const sectionId = getLvId(section.url);
      const children = parseLvLinks(html)
        .filter(({ url: u }) => getLvId(u) > sectionId)
        .map((s) => ({ title: s.title, url: s.url }));
      groups.push({ title: section.title, url: section.url, children });
    }
  }

  return { groups };
};

// groups → flat sections 변환 (buildMappings 전체 모드용)
const flattenGroups = (groups) => {
  const sections = [];
  for (const group of groups) {
    if (group.children.length > 0) {
      for (const child of group.children) {
        sections.push({ title: child.title, url: child.url, groupTitle: group.title });
      }
    } else {
      sections.push({ title: group.title, url: group.url });
    }
  }
  return sections;
};

// Phase 1: 구조 크롤 + docId 매핑 등록
export const buildIndexMappings = async (docidMap, indexSelection = null) => {
  console.log("Collecting index articles from WOL (mapping phase)...");

  let sectionsToProcess;
  if (indexSelection === null) {
    const { groups } = await getIndexSections();
    sectionsToProcess = flattenGroups(groups);
  } else {
    sectionsToProcess = indexSelection.sections || [];
  }

  const preparedSections = [];

  for (const section of sectionsToProcess) {
    const safeSectionName = sanitizeFilename(section.title);
    let sectionFolder;
    if (section.groupTitle) {
      const safeGroupName = sanitizeFilename(section.groupTitle);
      sectionFolder = `${VAULT_ORG_INDEX_PATH}${safeGroupName}/${safeSectionName}/`;
    } else {
      sectionFolder = `${VAULT_ORG_INDEX_PATH}${safeSectionName}/`;
    }

    console.log(`\n[${section.groupTitle ? section.groupTitle + ' > ' : ''}${section.title}] Scanning...`);

    const indexUrl = await getSectionUrl("wol-index");
    const articles = await collectAllArticles(
      section.url,
      new Set([indexUrl]),
      getLvId(indexUrl)
    );
    if (articles.length === 0) {
      console.log(`  No articles found.`);
      continue;
    }

    console.log(`  ${articles.length} articles found.`);

    for (const { title, docId } of articles) {
      const safeTitle = sanitizeFilename(title) || docId;
      const filePath = `${sectionFolder}${safeTitle}.md`;
      addMapping(docidMap, docId, filePath);
    }

    preparedSections.push({ section, articles });
  }

  console.log(`Index mappings registered: ${preparedSections.length} sections.`);
  return preparedSections;
};

// Phase 2: 콘텐츠 임포트
export const importOrgIndex = async (listOfExistingFiles, docidMap, preparedSections) => {
  console.log("\nStarting index content import...");

  for (const { section, articles } of preparedSections) {
    const safeSectionName = sanitizeFilename(section.title);
    let sectionFolder;
    if (section.groupTitle) {
      const safeGroupName = sanitizeFilename(section.groupTitle);
      sectionFolder = `${VAULT_ORG_INDEX_PATH}${safeGroupName}/${safeSectionName}/`;
    } else {
      sectionFolder = `${VAULT_ORG_INDEX_PATH}${safeSectionName}/`;
    }

    console.log(`\n[${section.groupTitle ? section.groupTitle + ' > ' : ''}${section.title}] ${articles.length} articles.`);
    fs.mkdirSync(sectionFolder, { recursive: true });

    let successCount = 0;
    let skipCount = 0;

    for (const { title, docId } of articles) {
      const safeTitle = sanitizeFilename(title) || docId;
      const filePath = `${sectionFolder}${safeTitle}.md`;

      if (filePath in listOfExistingFiles) {
        skipCount++;
        continue;
      }

      let articleHtml;
      try {
        articleHtml = await getPublicationArticleAPI(docId);
        await delay(150);
      } catch (e) {
        console.error(`  Failed to fetch ${docId}: ${e.message}`);
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
        successCount++;
      } catch (e) {
        if (e.code !== "EEXIST") {
          console.error(`  Failed to write ${filePath}: ${e.message}`);
        } else {
          skipCount++;
        }
      }
    }

    console.log(`  Done: ${successCount} saved, ${skipCount} skipped.`);
  }

  console.log("\nIndex import complete.");
};
