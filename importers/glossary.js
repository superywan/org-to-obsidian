import fs from "fs";
import * as cheerio from "cheerio";

import { VAULT_ORG_GLOSSARY_PATH } from "../constant.js";
import { getPublicationArticleAPI, getLvPageAPI } from "../requests.js";
import { parseArticleContent, addMapping } from "../docid-map.js";

const WOL_BASE_URL = "https://wol.jw.org";
const WOL_GLOSSARY_TOC_URL = `${WOL_BASE_URL}/ko/wol/publication/r8/lp-ko/nwtstg`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeText = (text) => text.replace(/\s+/g, " ").trim();
const sanitizeFilename = (name) => name.replace(/[/\\?%*:|"<>]/g, "-").trim();

const parseSectionLinks = (html) => {
  const $ = cheerio.load(html);
  const sections = [];
  const seen = new Set();

  $('a[href*="/wol/publication/r8/lp-ko/nwtstg/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || seen.has(href)) return;
    seen.add(href);
    const title = normalizeText($(el).text());
    if (!title) return;
    const fullUrl = href.startsWith("http") ? href : `${WOL_BASE_URL}${href}`;
    sections.push({ title, url: fullUrl });
  });

  return sections;
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

// UI용: ㄱ~ㅎ 섹션 목록 반환
export const getGlossarySections = async () => {
  console.log("Fetching glossary TOC...");
  const html = await getLvPageAPI(WOL_GLOSSARY_TOC_URL);
  const sections = parseSectionLinks(html);

  const result = [];
  for (const sec of sections) {
    try {
      const secHtml = await getLvPageAPI(sec.url);
      await delay(200);
      const articles = parseArticleLinks(secHtml);
      result.push({
        title: `${sec.title} (${articles.length}개)`,
        url: sec.url,
      });
    } catch (e) {
      result.push({ title: sec.title, url: sec.url });
    }
  }

  return { sections: result };
};

// Phase 1: 구조 크롤 + docId 매핑 등록
export const buildGlossaryMappings = async (docidMap, glossarySelection = null) => {
  console.log("Fetching glossary TOC (mapping phase)...");

  const html = await getLvPageAPI(WOL_GLOSSARY_TOC_URL);
  const allSections = parseSectionLinks(html);

  let sectionsToProcess;
  if (glossarySelection === null) {
    sectionsToProcess = allSections;
  } else {
    const selected = new Set((glossarySelection.sections || []).map((s) => s.url));
    sectionsToProcess = allSections.filter((s) => selected.has(s.url));
  }

  console.log(`Processing ${sectionsToProcess.length} glossary sections...`);

  const preparedSections = [];

  for (const section of sectionsToProcess) {
    console.log(`  [${section.title}] Fetching...`);

    let secHtml;
    try {
      secHtml = await getLvPageAPI(section.url);
      await delay(200);
    } catch (e) {
      console.error(`  Failed to fetch ${section.url}: ${e.message}`);
      continue;
    }

    const articles = parseArticleLinks(secHtml);
    if (articles.length === 0) {
      console.log(`  No articles found.`);
      continue;
    }

    console.log(`  ${articles.length} terms found.`);

    const sectionFolder = `${VAULT_ORG_GLOSSARY_PATH}${section.title}/`;

    for (const { title, docId } of articles) {
      const safeTitle = sanitizeFilename(title) || docId;
      const filePath = `${sectionFolder}${safeTitle}.md`;
      addMapping(docidMap, docId, filePath);
    }

    preparedSections.push({ section, articles });
  }

  console.log(`Glossary mappings registered: ${preparedSections.length} sections.`);
  return preparedSections;
};

// Phase 2: 콘텐츠 임포트
export const importGlossary = async (listOfExistingFiles, docidMap, preparedSections) => {
  console.log("\nStarting glossary content import...");

  for (const { section, articles } of preparedSections) {
    const sectionFolder = `${VAULT_ORG_GLOSSARY_PATH}${section.title}/`;

    console.log(`\n[${section.title}] ${articles.length} terms.`);
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

  console.log("\nGlossary import complete.");
};
