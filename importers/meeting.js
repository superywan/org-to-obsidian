import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

import { VAULT_ORG_MEETING_PATH } from "../constant.js";
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

const scanStructure = async (url, folderPath, visited, docidMap) => {
  if (visited.has(url)) return [];
  visited.add(url);

  console.log(`  Scanning: ${url}`);

  let html;
  try {
    html = await getLvPageAPI(url);
    await delay(200);
  } catch (e) {
    console.error(`  Failed to fetch ${url}: ${e.message}`);
    return [];
  }

  const articles = parseArticleLinks(html);
  const sections = parseLvLinks(html);

  const entries = [];

  for (let i = 0; i < articles.length; i++) {
    const { title, docId } = articles[i];
    const num = String(i + 1).padStart(2, "0");
    const safeTitle = sanitizeFilename(title) || docId;
    const filePath = `${folderPath}${num}. ${safeTitle}.md`;
    addMapping(docidMap, docId, filePath);
    entries.push({ docId, filePath, title });
  }

  for (const { title, url: subUrl } of sections) {
    const subFolder = `${folderPath}${sanitizeFilename(title)}/`;
    const subEntries = await scanStructure(subUrl, subFolder, visited, docidMap);
    entries.push(...subEntries);
  }

  return entries;
};

export const getMeetingSections = async () => {
  const url = await getSectionUrl("meeting");
  const html = await getLvPageAPI(url);
  return { sections: parseLvLinks(html) };
};

// Phase 1: 구조 크롤 + docId 매핑 등록
export const buildMeetingMappings = async (docidMap, selection = null) => {
  console.log("Collecting Meeting structure (mapping phase)...");

  let sectionsToProcess;
  if (selection === null) {
    const url = await getSectionUrl("meeting");
    const html = await getLvPageAPI(url);
    sectionsToProcess = parseLvLinks(html);
  } else {
    sectionsToProcess = selection.sections || [];
  }

  const preparedSections = [];

  const rootUrl = await getSectionUrl("meeting");
  const siblingUrls = new Set([rootUrl, ...sectionsToProcess.map(s => s.url)]);

  for (const section of sectionsToProcess) {
    console.log(`\n[${section.title}] Scanning...`);
    const sectionFolder = `${VAULT_ORG_MEETING_PATH}${sanitizeFilename(section.title)}/`;
    const visited = new Set(siblingUrls);
    visited.delete(section.url);
    const entries = await scanStructure(section.url, sectionFolder, visited, docidMap);
    if (entries.length > 0) {
      preparedSections.push({ section, entries });
    }
    console.log(`  ${entries.length} articles found.`);
  }

  console.log(`Meeting mappings registered: ${preparedSections.length} sections.`);
  return preparedSections;
};

// Phase 2: 콘텐츠 임포트
export const importMeeting = async (listOfExistingFiles, docidMap, preparedSections) => {
  console.log("\nStarting Meeting content import...");

  for (const { section, entries } of preparedSections) {
    console.log(`\n[${section.title}] ${entries.length} articles.`);

    let success = 0;
    let skip = 0;

    for (const { docId, filePath, title } of entries) {
      if (filePath in listOfExistingFiles) {
        skip++;
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
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, { flag: "wx" });
        console.log(`[NEW_FILE] ${filePath}`);
        success++;
      } catch (e) {
        if (e.code !== "EEXIST") {
          console.error(`  Failed to write ${filePath}: ${e.message}`);
        } else {
          skip++;
        }
      }
    }

    console.log(`  Done: ${success} saved, ${skip} skipped.`);
  }

  console.log("\nMeeting import complete.");
};
