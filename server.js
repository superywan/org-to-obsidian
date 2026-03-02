import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getJWORGTokenAPI } from "./requests.js";
import { loadMap, saveMap } from "./docid-map.js";
import { getVideoCategoryTree, importOrgVideos } from "./importers/video.js";
import { getBookSections, getSectionContents, buildBookMappings, importOrgBooks } from "./importers/books.js";
import { getInsightSections, buildInsightMappings, importOrgInsight } from "./importers/insight.js";
import { getWatchtowerSections, buildWatchtowerMappings, importWatchtower } from "./importers/watchtower.js";
import { getAwakeSections, buildAwakeMappings, importAwake } from "./importers/awake.js";
import { getMeetingSections, buildMeetingMappings, importMeeting } from "./importers/meeting.js";
import { getKingdomServiceSections, buildKingdomServiceMappings, importKingdomService } from "./importers/kingdom-service.js";
import { getProgramSections, buildProgramMappings, importPrograms } from "./importers/programs.js";
import { getBrochureSections, buildBrochureMappings, importBrochures } from "./importers/brochures.js";
import { getTractSections, buildTractMappings, importTracts } from "./importers/tracts.js";
import { getWebSeriesSections, buildWebSeriesMappings, importWebSeries } from "./importers/web-series.js";
import { getGuidelineSections, buildGuidelineMappings, importGuidelines } from "./importers/guidelines.js";
import { getGlossarySections, buildGlossaryMappings, importGlossary } from "./importers/glossary.js";
import { getIndexSections, buildIndexMappings, importOrgIndex } from "./importers/wol-index.js";
import { getBibleSections, buildBibleMappings, importBible } from "./importers/bible.js";
import {
  VAULT_ORG_VIDEOS_PATH,
  VAULT_ORG_BOOKS_PATH,
  VAULT_ORG_INSIGHT_PATH,
  VAULT_ORG_WATCHTOWER_PATH,
  VAULT_ORG_AWAKE_PATH,
  VAULT_ORG_MEETING_PATH,
  VAULT_ORG_KINGDOM_SERVICE_PATH,
  VAULT_ORG_PROGRAMS_PATH,
  VAULT_ORG_BROCHURES_PATH,
  VAULT_ORG_TRACTS_PATH,
  VAULT_ORG_WEB_SERIES_PATH,
  VAULT_ORG_GUIDELINES_PATH,
  VAULT_ORG_GLOSSARY_PATH,
  VAULT_ORG_INDEX_PATH,
  VAULT_ORG_BIBLE_PATH,
} from "./constant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sseClients = [];
let isImporting = false;

const broadcast = (type, message) => {
  const data = JSON.stringify({ type, message: String(message) });
  sseClients.forEach((res) => res.write(`data: ${data}\n\n`));
};

const collectExistingFiles = (dirPath, result = {}) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) collectExistingFiles(full, result);
      else result[full] = true;
    }
  } catch {}
  return result;
};

const readBody = (req) =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });

const json = (res, data, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  // ── index.html ───────────────────────────────────────
  if (req.method === "GET" && req.url === "/") {
    const html = fs.readFileSync(path.join(__dirname, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // ── SSE 로그 스트림 ──────────────────────────────────
  if (req.method === "GET" && req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    sseClients.push(res);
    req.on("close", () => {
      sseClients = sseClients.filter((c) => c !== res);
    });
    return;
  }

  // ── 영상 카테고리 트리 ───────────────────────────────
  if (req.method === "GET" && req.url === "/api/video-categories") {
    try {
      const token = await getJWORGTokenAPI();
      const config = { headers: { Authorization: `Bearer ${token}` }, Referer: "https://www.jw.org/" };
      const tree = await getVideoCategoryTree(config);
      json(res, tree);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 출판물 섹션 목록 ─────────────────────────────────
  if (req.method === "GET" && req.url === "/api/book-sections") {
    try {
      const sections = await getBookSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 통찰 섹션 목록 ───────────────────────────────────
  if (req.method === "GET" && req.url === "/api/insight-sections") {
    try {
      const sections = await getInsightSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 파수대 연도 목록 ──────────────────────────────────
  if (req.method === "GET" && req.url === "/api/watchtower-sections") {
    try {
      const sections = await getWatchtowerSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 깨어라 연도 목록 ──────────────────────────────────
  if (req.method === "GET" && req.url === "/api/awake-sections") {
    try {
      const sections = await getAwakeSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 집회 교재 섹션 목록 ───────────────────────────────
  if (req.method === "GET" && req.url === "/api/meeting-sections") {
    try {
      const sections = await getMeetingSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 왕국 봉사 섹션 목록 ───────────────────────────────
  if (req.method === "GET" && req.url === "/api/kingdom-service-sections") {
    try {
      const sections = await getKingdomServiceSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 프로그램 섹션 목록 ────────────────────────────────
  if (req.method === "GET" && req.url === "/api/program-sections") {
    try {
      const sections = await getProgramSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 팜플렛 섹션 목록 ──────────────────────────────────
  if (req.method === "GET" && req.url === "/api/brochure-sections") {
    try {
      const sections = await getBrochureSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 전도지 섹션 목록 ──────────────────────────────────
  if (req.method === "GET" && req.url === "/api/tract-sections") {
    try {
      const sections = await getTractSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 연재 기사 섹션 목록 ───────────────────────────────
  if (req.method === "GET" && req.url === "/api/web-series-sections") {
    try {
      const sections = await getWebSeriesSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 지침 섹션 목록 ────────────────────────────────────
  if (req.method === "GET" && req.url === "/api/guideline-sections") {
    try {
      const sections = await getGuidelineSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 용어 설명 섹션 목록 ───────────────────────────────
  if (req.method === "GET" && req.url === "/api/glossary-sections") {
    try {
      const sections = await getGlossarySections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 색인 섹션 목록 ───────────────────────────────────
  if (req.method === "GET" && req.url === "/api/index-sections") {
    try {
      const sections = await getIndexSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 성경 섹션 목록 ──────────────────────────────────
  if (req.method === "GET" && req.url === "/api/bible-sections") {
    try {
      const sections = await getBibleSections();
      json(res, sections);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 섹션 콘텐츠 ──────────────────────────────────────
  if (req.method === "GET" && req.url.startsWith("/api/section-contents")) {
    const targetUrl = new URL(req.url, "http://localhost").searchParams.get("url");
    if (!targetUrl || !targetUrl.startsWith("https://wol.jw.org/")) {
      json(res, { error: "Invalid URL" }, 400);
      return;
    }
    try {
      const contents = await getSectionContents(targetUrl);
      json(res, contents);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── 임포트 시작 ──────────────────────────────────────
  if (req.method === "POST" && req.url === "/import") {
    if (isImporting) {
      json(res, { error: "이미 임포트가 진행 중입니다." }, 409);
      return;
    }

    const body = await readBody(req);
    const options = JSON.parse(body || "{}");
    json(res, { ok: true });

    isImporting = true;
    const orig = { log: console.log, error: console.error, warn: console.warn };
    console.log = (...a) => { orig.log(...a); broadcast("log", a.join(" ")); };
    console.error = (...a) => { orig.error(...a); broadcast("error", a.join(" ")); };
    console.warn = (...a) => { orig.warn(...a); broadcast("warn", a.join(" ")); };

    (async () => {
      try {
        const listOfExistingFiles = {};
        if (options.videos) collectExistingFiles(VAULT_ORG_VIDEOS_PATH, listOfExistingFiles);
        if (options.books) collectExistingFiles(VAULT_ORG_BOOKS_PATH, listOfExistingFiles);
        if (options.insight) collectExistingFiles(VAULT_ORG_INSIGHT_PATH, listOfExistingFiles);
        if (options.watchtower) collectExistingFiles(VAULT_ORG_WATCHTOWER_PATH, listOfExistingFiles);
        if (options.awake) collectExistingFiles(VAULT_ORG_AWAKE_PATH, listOfExistingFiles);
        if (options.meeting) collectExistingFiles(VAULT_ORG_MEETING_PATH, listOfExistingFiles);
        if (options.kingdomService) collectExistingFiles(VAULT_ORG_KINGDOM_SERVICE_PATH, listOfExistingFiles);
        if (options.programs) collectExistingFiles(VAULT_ORG_PROGRAMS_PATH, listOfExistingFiles);
        if (options.brochures) collectExistingFiles(VAULT_ORG_BROCHURES_PATH, listOfExistingFiles);
        if (options.tracts) collectExistingFiles(VAULT_ORG_TRACTS_PATH, listOfExistingFiles);
        if (options.webSeries) collectExistingFiles(VAULT_ORG_WEB_SERIES_PATH, listOfExistingFiles);
        if (options.guidelines) collectExistingFiles(VAULT_ORG_GUIDELINES_PATH, listOfExistingFiles);
        if (options.glossary) collectExistingFiles(VAULT_ORG_GLOSSARY_PATH, listOfExistingFiles);
        if (options.index) collectExistingFiles(VAULT_ORG_INDEX_PATH, listOfExistingFiles);
        if (options.bible) collectExistingFiles(VAULT_ORG_BIBLE_PATH, listOfExistingFiles);

        // ═══════════════════════════════════════════════════
        // Phase 1: 선택된 모듈의 docId 매핑 구축
        // 기존 매핑 로드 → 선택 모듈 구조 크롤 → 매핑 추가 → 저장
        // ═══════════════════════════════════════════════════
        const docidMap = loadMap();
        const prepared = {};

        broadcast("log", "=== docId 매핑 구축 시작 ===");

        if (options.books) {
          prepared.books = await buildBookMappings(docidMap, options.pubSelection ?? null);
        }
        if (options.insight) {
          prepared.insight = await buildInsightMappings(docidMap, options.insightSelection ?? null);
        }
        if (options.watchtower) {
          prepared.watchtower = await buildWatchtowerMappings(docidMap, options.watchtowerSelection ?? null);
        }
        if (options.awake) {
          prepared.awake = await buildAwakeMappings(docidMap, options.awakeSelection ?? null);
        }
        if (options.meeting) {
          prepared.meeting = await buildMeetingMappings(docidMap, options.meetingSelection ?? null);
        }
        if (options.kingdomService) {
          prepared.kingdomService = await buildKingdomServiceMappings(docidMap, options.kingdomServiceSelection ?? null);
        }
        if (options.programs) {
          prepared.programs = await buildProgramMappings(docidMap, options.programSelection ?? null);
        }
        if (options.brochures) {
          prepared.brochures = await buildBrochureMappings(docidMap, options.brochureSelection ?? null);
        }
        if (options.tracts) {
          prepared.tracts = await buildTractMappings(docidMap, options.tractSelection ?? null);
        }
        if (options.webSeries) {
          prepared.webSeries = await buildWebSeriesMappings(docidMap, options.webSeriesSelection ?? null);
        }
        if (options.guidelines) {
          prepared.guidelines = await buildGuidelineMappings(docidMap, options.guidelineSelection ?? null);
        }
        if (options.glossary) {
          prepared.glossary = await buildGlossaryMappings(docidMap, options.glossarySelection ?? null);
        }
        if (options.index) {
          prepared.index = await buildIndexMappings(docidMap, options.indexSelection ?? null);
        }
        if (options.bible) {
          prepared.bible = await buildBibleMappings(docidMap, options.bibleSelection ?? null);
        }

        saveMap(docidMap);
        const mapSize = Object.keys(docidMap).length;
        broadcast("log", `=== docId 매핑 구축 완료 (총 ${mapSize}개 항목) ===`);

        // ═══════════════════════════════════════════════════
        // Phase 2: 콘텐츠 임포트 (매핑 활용하여 내부 링크 변환)
        // ═══════════════════════════════════════════════════

        if (options.videos) {
          broadcast("log", "=== 영상 자막 임포트 시작 ===");
          const token = await getJWORGTokenAPI();
          const config = { headers: { Authorization: `Bearer ${token}` }, Referer: "https://www.jw.org/" };
          await importOrgVideos(config, listOfExistingFiles, options.videoSubcategoryKeys ?? null);
          broadcast("log", "=== 영상 자막 임포트 완료 ===");
        }

        if (options.books) {
          broadcast("log", "=== 서적 임포트 시작 ===");
          await importOrgBooks(listOfExistingFiles, docidMap, prepared.books);
          broadcast("log", "=== 서적 임포트 완료 ===");
        }

        if (options.insight) {
          broadcast("log", "=== 통찰 임포트 시작 ===");
          await importOrgInsight(listOfExistingFiles, docidMap, prepared.insight);
          broadcast("log", "=== 통찰 임포트 완료 ===");
        }

        if (options.watchtower) {
          broadcast("log", "=== 파수대 임포트 시작 ===");
          await importWatchtower(listOfExistingFiles, docidMap, prepared.watchtower);
          broadcast("log", "=== 파수대 임포트 완료 ===");
        }

        if (options.awake) {
          broadcast("log", "=== 깨어라 임포트 시작 ===");
          await importAwake(listOfExistingFiles, docidMap, prepared.awake);
          broadcast("log", "=== 깨어라 임포트 완료 ===");
        }

        if (options.meeting) {
          broadcast("log", "=== 집회 교재 임포트 시작 ===");
          await importMeeting(listOfExistingFiles, docidMap, prepared.meeting);
          broadcast("log", "=== 집회 교재 임포트 완료 ===");
        }

        if (options.kingdomService) {
          broadcast("log", "=== 왕국 봉사 임포트 시작 ===");
          await importKingdomService(listOfExistingFiles, docidMap, prepared.kingdomService);
          broadcast("log", "=== 왕국 봉사 임포트 완료 ===");
        }

        if (options.programs) {
          broadcast("log", "=== 프로그램 임포트 시작 ===");
          await importPrograms(listOfExistingFiles, docidMap, prepared.programs);
          broadcast("log", "=== 프로그램 임포트 완료 ===");
        }

        if (options.brochures) {
          broadcast("log", "=== 팜플렛 임포트 시작 ===");
          await importBrochures(listOfExistingFiles, docidMap, prepared.brochures);
          broadcast("log", "=== 팜플렛 임포트 완료 ===");
        }

        if (options.tracts) {
          broadcast("log", "=== 전도지 임포트 시작 ===");
          await importTracts(listOfExistingFiles, docidMap, prepared.tracts);
          broadcast("log", "=== 전도지 임포트 완료 ===");
        }

        if (options.webSeries) {
          broadcast("log", "=== 연재 기사 임포트 시작 ===");
          await importWebSeries(listOfExistingFiles, docidMap, prepared.webSeries);
          broadcast("log", "=== 연재 기사 임포트 완료 ===");
        }

        if (options.guidelines) {
          broadcast("log", "=== 지침 임포트 시작 ===");
          await importGuidelines(listOfExistingFiles, docidMap, prepared.guidelines);
          broadcast("log", "=== 지침 임포트 완료 ===");
        }

        if (options.glossary) {
          broadcast("log", "=== 용어 설명 임포트 시작 ===");
          await importGlossary(listOfExistingFiles, docidMap, prepared.glossary);
          broadcast("log", "=== 용어 설명 임포트 완료 ===");
        }

        if (options.index) {
          broadcast("log", "=== 색인 임포트 시작 ===");
          await importOrgIndex(listOfExistingFiles, docidMap, prepared.index);
          broadcast("log", "=== 색인 임포트 완료 ===");
        }

        if (options.bible) {
          broadcast("log", "=== 성경 임포트 시작 ===");
          await importBible(listOfExistingFiles, docidMap, prepared.bible);
          broadcast("log", "=== 성경 임포트 완료 ===");
        }

        broadcast("done", "모든 임포트가 완료됐습니다!");
      } catch (e) {
        broadcast("error", `오류 발생: ${e.message}`);
        broadcast("done", "임포트 중 오류가 발생했습니다.");
      } finally {
        console.log = orig.log;
        console.error = orig.error;
        console.warn = orig.warn;
        isImporting = false;
      }
    })();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n서버 실행 중: http://localhost:${PORT}\n브라우저에서 위 주소를 열어주세요.\n`);
});
