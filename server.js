import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getJWORGTokenAPI } from "./requests.js";
import { loadMap, saveMap } from "./docid-map.js";
import { runImport } from "./import-runner.js";
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

// ── 구조 캐시 (Phase 1 크롤 결과) ────────────────
// 각 모듈의 buildXMappings 반환값(prepared)을 모듈별로 저장해두고,
// "구조 캐시 사용" 토글 시 재크롤을 생략한다. 오류로 재실행해도
// Phase 1을 건너뛰고 이어서 진행할 수 있다.
const PREPARED_CACHE_FILE = path.join(__dirname, "prepared-cache.json");
const loadPreparedCache = () => {
  try {
    return JSON.parse(fs.readFileSync(PREPARED_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
};
const savePreparedCache = (cache) => {
  fs.writeFileSync(PREPARED_CACHE_FILE, JSON.stringify(cache, null, 2));
};

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
        await runImport(options, (type, msg) => broadcast(type, msg));
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
