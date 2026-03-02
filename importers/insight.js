import fs from "fs";
import * as cheerio from "cheerio";

import { VAULT_ORG_INSIGHT_PATH } from "../constant.js";
import { getLvPageAPI, getPublicationArticleAPI } from "../requests.js";
import { parseArticleContent, addMapping } from "../docid-map.js";
import { getSectionUrl } from "../wol-sections.js";

const WOL_BASE_URL = "https://wol.jw.org";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
const sanitizeFilename = (name) => name.replace(/[/\\?%*:|"<>]/g, "-").trim();

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

const collectAllArticles = async (startUrl, visited = new Set()) => {
  if (visited.has(startUrl)) return [];
  visited.add(startUrl);

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
  const lvLinks = parseLvLinks(html);

  let allArticles = [...articles];
  for (const { url } of lvLinks) {
    const sub = await collectAllArticles(url, visited);
    allArticles = allArticles.concat(sub);
  }

  return allArticles;
};

export const getInsightSections = async () => {
  const insightUrl = await getSectionUrl("insight");
  const visited = new Set([insightUrl]);

  const rootHtml = await getLvPageAPI(insightUrl);
  await delay(200);

  const topSections = parseLvLinks(rootHtml);

  if (topSections.length === 0) return { sections: [] };

  const firstUrl = topSections[0].url;
  visited.add(firstUrl);
  const firstHtml = await getLvPageAPI(firstUrl);
  await delay(200);

  const firstArticles = parseArticleLinks(firstHtml);

  if (firstArticles.length > 0) {
    return { sections: topSections };
  }

  const letterSections = [];
  const firstSubSections = parseLvLinks(firstHtml);
  letterSections.push(...firstSubSections);

  for (let i = 1; i < topSections.length; i++) {
    const { url } = topSections[i];
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const html = await getLvPageAPI(url);
      await delay(200);
      const subSections = parseLvLinks(html);
      letterSections.push(...subSections);
    } catch (e) {
      console.error(`Failed to fetch ${url}: ${e.message}`);
    }
  }

  return {
    sections: letterSections.filter((s) => s.url !== insightUrl),
  };
};

// Phase 1: 구조 크롤 + docId 매핑 등록
export const buildInsightMappings = async (docidMap, insightSelection = null) => {
  console.log("Collecting insight articles from WOL (mapping phase)...");

  let sectionsToProcess;
  if (insightSelection === null) {
    const { sections } = await getInsightSections();
    sectionsToProcess = sections;
  } else {
    sectionsToProcess = insightSelection.sections || [];
  }

  const preparedSections = [];

  for (const section of sectionsToProcess) {
    const safeSectionName = sanitizeFilename(section.title);
    const sectionFolder = `${VAULT_ORG_INSIGHT_PATH}${safeSectionName}/`;

    console.log(`\n[${section.title}] Scanning...`);

    const insightUrl = await getSectionUrl("insight");
    const articles = await collectAllArticles(section.url, new Set([insightUrl]));
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

  console.log(`Insight mappings registered: ${preparedSections.length} sections.`);
  return preparedSections;
};

// Phase 2: 콘텐츠 임포트
export const importOrgInsight = async (listOfExistingFiles, docidMap, preparedSections) => {
  console.log("\nStarting insight content import...");

  for (const { section, articles } of preparedSections) {
    const safeSectionName = sanitizeFilename(section.title);
    const sectionFolder = `${VAULT_ORG_INSIGHT_PATH}${safeSectionName}/`;

    console.log(`\n[${section.title}] ${articles.length} articles.`);
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

  console.log("\nInsight import complete.");
};
