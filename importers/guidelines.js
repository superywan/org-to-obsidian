import fs from "fs";
import * as cheerio from "cheerio";

import { VAULT_ORG_GUIDELINES_PATH } from "../constant.js";
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

const collectAllPublications = async (startUrl, visited = new Set(), minId = 0, pageTitle = '') => {
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

  const pubLinks = parsePublicationLinks(html);
  const lvLinks = parseLvLinks(html).filter(({ url }) => getLvId(url) > effectiveMinId);

  let allPubs = pubLinks.map((p) => ({ type: "pub", ...p }));

  if (pubLinks.length === 0 && lvLinks.length === 0) {
    const articles = parseChapterLinks(html);
    if (articles.length > 0) {
      const title = pageTitle || extractPageTitle(html);
      allPubs.push({ type: "direct", title, articles });
    }
  }

  for (const { title, url } of lvLinks) {
    const subPubs = await collectAllPublications(url, visited, effectiveMinId, title);
    allPubs = allPubs.concat(subPubs);
  }

  return allPubs;
};

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

const extractPageTitle = (html) => {
  const $ = cheerio.load(html);
  return normalizeText($("h1").first().text()) || "Unknown";
};

export const getGuidelineSections = async () => {
  const sectionUrl = await getSectionUrl("guidelines");
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
export const buildGuidelineMappings = async (docidMap, pubSelection = null) => {
  console.log("Collecting Guidelines from WOL (mapping phase)...");

  let rawPublications = [];

  if (pubSelection === null) {
    const sectionUrl = await getSectionUrl("guidelines");
    rawPublications = await collectAllPublications(sectionUrl);
  } else {
    for (const url of (pubSelection.sectionUrls || [])) {
      const pubs = await collectAllPublications(url);
      rawPublications = rawPublications.concat(pubs);
    }
    rawPublications = rawPublications.concat(
      (pubSelection.directPubs || []).map((p) => ({ type: "pub", ...p }))
    );
  }

  const seenKey = new Set();
  const publications = rawPublications.filter((pub) => {
    const key = pub.type === "direct" ? `direct:${pub.title}` : pub.abbrev;
    if (seenKey.has(key)) return false;
    seenKey.add(key);
    return true;
  });

  console.log(`Found ${publications.length} unique publications. Building mappings...`);

  const preparedPubs = [];

  for (const pub of publications) {
    let chapters;
    if (pub.type === "direct") {
      chapters = pub.articles;
    } else {
      let tocHtml;
      try {
        tocHtml = await getPublicationTOCAPI(pub.abbrev);
        await delay(200);
      } catch (e) {
        console.error(`  Failed to fetch TOC for ${pub.abbrev}: ${e.message}`);
        continue;
      }
      chapters = parseChapterLinks(tocHtml);
    }

    if (chapters.length === 0) continue;

    const safeTitle = sanitizeFilename(pub.title);
    const pubFolder = `${VAULT_ORG_GUIDELINES_PATH}${safeTitle}`;

    for (let j = 0; j < chapters.length; j++) {
      const { title: chapTitle, docId } = chapters[j];
      const safeChapTitle = sanitizeFilename(chapTitle) || docId;
      const num = String(j).padStart(2, "0");
      const filePath = `${pubFolder}/${num}. ${safeChapTitle}.md`;
      addMapping(docidMap, docId, filePath);
    }

    preparedPubs.push({ ...pub, chapters });
  }

  console.log(`Guideline mappings registered: ${preparedPubs.length} publications.`);
  return preparedPubs;
};

// Phase 2: 콘텐츠 임포트
export const importGuidelines = async (listOfExistingFiles, docidMap, preparedPubs) => {
  console.log(`\nStarting guideline content import (${preparedPubs.length} publications)...`);

  for (let i = 0; i < preparedPubs.length; i++) {
    const pub = preparedPubs[i];
    const safeTitle = sanitizeFilename(pub.title);
    const pubFolder = `${VAULT_ORG_GUIDELINES_PATH}${safeTitle}`;

    console.log(
      `\n[${i + 1}/${preparedPubs.length}] ${pub.title} (${pub.type === "direct" ? "direct" : pub.abbrev})`
    );

    const { chapters } = pub;
    console.log(`  ${chapters.length} chapters found.`);
    fs.mkdirSync(pubFolder, { recursive: true });

    let successCount = 0;
    let skipCount = 0;

    for (let j = 0; j < chapters.length; j++) {
      const { title: chapTitle, docId } = chapters[j];
      const safeChapTitle = sanitizeFilename(chapTitle) || docId;
      const num = String(j).padStart(2, "0");
      const filePath = `${pubFolder}/${num}. ${safeChapTitle}.md`;

      if (filePath in listOfExistingFiles) {
        skipCount++;
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
        console.warn(`  Empty content for ${chapTitle} (${docId}), skipping.`);
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

  console.log("\nGuidelines import complete.");
};
