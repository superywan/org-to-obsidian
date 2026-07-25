// import-runner.js
// ─────────────────────────────────────────────────────────────
// 임포트 오케스트레이션(Phase 1 매핑 + Phase 2 콘텐츠)을 한 곳에 모아
// server.js(웹 UI)와 update.js(CLI)가 공유한다.
//
// runImport(options, log)
//   options: 웹 UI가 보내는 것과 동일한 형태
//     { bible, books, watchtower, ..., useStructureCache, refreshModules,
//       pubSelection, watchtowerSelection, ... }
//   log(type, message): 진행 로그 콜백 (server → broadcast, CLI → console.log)
//   반환: { mapSize }
//
// 임포터 내부의 console.log(예: "[NEW_FILE] ...")는 그대로 두어,
// server에서는 console.log 인터셉트로 브라우저에 중계되고 CLI에서는 터미널에 찍힌다.
// ─────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getJWORGTokenAPI } from "./requests.js";
import { loadMap, saveMap } from "./docid-map.js";
import { importOrgVideos } from "./importers/video.js";
import { buildBookMappings, importOrgBooks } from "./importers/books.js";
import { buildInsightMappings, importOrgInsight } from "./importers/insight.js";
import { buildWatchtowerMappings, importWatchtower } from "./importers/watchtower.js";
import { buildAwakeMappings, importAwake } from "./importers/awake.js";
import { buildMeetingMappings, importMeeting } from "./importers/meeting.js";
import { buildKingdomServiceMappings, importKingdomService } from "./importers/kingdom-service.js";
import { buildProgramMappings, importPrograms } from "./importers/programs.js";
import { buildBrochureMappings, importBrochures } from "./importers/brochures.js";
import { buildTractMappings, importTracts } from "./importers/tracts.js";
import { buildWebSeriesMappings, importWebSeries } from "./importers/web-series.js";
import { buildGuidelineMappings, importGuidelines } from "./importers/guidelines.js";
import { buildGlossaryMappings, importGlossary } from "./importers/glossary.js";
import { buildIndexMappings, importOrgIndex } from "./importers/wol-index.js";
import { buildBibleMappings, importBible } from "./importers/bible.js";
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

export async function runImport(options, log = () => {}) {
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
  // ═══════════════════════════════════════════════════
  const docidMap = loadMap();
  const prepared = {};

  const useStructureCache = !!options.useStructureCache;
  const refreshSet = new Set(options.refreshModules || []);
  const preparedCache = useStructureCache ? loadPreparedCache() : {};

  // 모듈별 헬퍼 — 캐시에 있고 재크롤 대상이 아니면 크롤 생략,
  // 아니면 크롤 후 docid-map과 prepared-cache를 함께 즉시 체크포인트.
  const prepareModule = async (name, builder) => {
    if (useStructureCache && preparedCache[name] !== undefined && !refreshSet.has(name)) {
      log("log", `  [구조 캐시] ${name} 재사용 (크롤 생략)`);
      return preparedCache[name];
    }
    if (useStructureCache && refreshSet.has(name)) {
      log("log", `  [재크롤] ${name} — 구조 캐시 무시하고 새로 탐색`);
    }
    const result = await builder();
    saveMap(docidMap);
    preparedCache[name] = result;
    savePreparedCache(preparedCache);
    return result;
  };

  log("log", "=== docId 매핑 구축 시작 ===");
  if (useStructureCache) log("log", "  (구조 캐시 사용: 캐시된 모듈은 재크롤 생략)");

  // 성경 매핑을 항상 최우선으로 구축 (book-name-map + b:책:장 키 준비)
  if (options.bible) {
    prepared.bible = await prepareModule("bible", () => buildBibleMappings(docidMap, options.bibleSelection ?? null));
  }
  if (options.books) {
    prepared.books = await prepareModule("books", () => buildBookMappings(docidMap, options.pubSelection ?? null));
  }
  if (options.insight) {
    prepared.insight = await prepareModule("insight", () => buildInsightMappings(docidMap, options.insightSelection ?? null));
  }
  if (options.watchtower) {
    prepared.watchtower = await prepareModule("watchtower", () => buildWatchtowerMappings(docidMap, options.watchtowerSelection ?? null));
  }
  if (options.awake) {
    prepared.awake = await prepareModule("awake", () => buildAwakeMappings(docidMap, options.awakeSelection ?? null));
  }
  if (options.meeting) {
    prepared.meeting = await prepareModule("meeting", () => buildMeetingMappings(docidMap, options.meetingSelection ?? null));
  }
  if (options.kingdomService) {
    prepared.kingdomService = await prepareModule("kingdomService", () => buildKingdomServiceMappings(docidMap, options.kingdomServiceSelection ?? null));
  }
  if (options.programs) {
    prepared.programs = await prepareModule("programs", () => buildProgramMappings(docidMap, options.programSelection ?? null));
  }
  if (options.brochures) {
    prepared.brochures = await prepareModule("brochures", () => buildBrochureMappings(docidMap, options.brochureSelection ?? null));
  }
  if (options.tracts) {
    prepared.tracts = await prepareModule("tracts", () => buildTractMappings(docidMap, options.tractSelection ?? null));
  }
  if (options.webSeries) {
    prepared.webSeries = await prepareModule("webSeries", () => buildWebSeriesMappings(docidMap, options.webSeriesSelection ?? null));
  }
  if (options.guidelines) {
    prepared.guidelines = await prepareModule("guidelines", () => buildGuidelineMappings(docidMap, options.guidelineSelection ?? null));
  }
  if (options.glossary) {
    prepared.glossary = await prepareModule("glossary", () => buildGlossaryMappings(docidMap, options.glossarySelection ?? null));
  }
  if (options.index) {
    prepared.index = await prepareModule("index", () => buildIndexMappings(docidMap, options.indexSelection ?? null));
  }

  saveMap(docidMap);
  const mapSize = Object.keys(docidMap).length;
  log("log", `=== docId 매핑 구축 완료 (총 ${mapSize}개 항목) ===`);

  // ═══════════════════════════════════════════════════
  // Phase 2: 콘텐츠 임포트 (성경부터 — 성구 wikilink 대상 우선 생성)
  // ═══════════════════════════════════════════════════
  if (options.bible) {
    log("log", "=== 성경 임포트 시작 ===");
    await importBible(listOfExistingFiles, docidMap, prepared.bible);
    log("log", "=== 성경 임포트 완료 ===");
  }
  if (options.videos) {
    log("log", "=== 영상 자막 임포트 시작 ===");
    const token = await getJWORGTokenAPI();
    const config = { headers: { Authorization: `Bearer ${token}` }, Referer: "https://www.jw.org/" };
    await importOrgVideos(config, listOfExistingFiles, options.videoSubcategoryKeys ?? null);
    log("log", "=== 영상 자막 임포트 완료 ===");
  }
  if (options.books) {
    log("log", "=== 서적 임포트 시작 ===");
    await importOrgBooks(listOfExistingFiles, docidMap, prepared.books);
    log("log", "=== 서적 임포트 완료 ===");
  }
  if (options.insight) {
    log("log", "=== 통찰 임포트 시작 ===");
    await importOrgInsight(listOfExistingFiles, docidMap, prepared.insight);
    log("log", "=== 통찰 임포트 완료 ===");
  }
  if (options.watchtower) {
    log("log", "=== 파수대 임포트 시작 ===");
    await importWatchtower(listOfExistingFiles, docidMap, prepared.watchtower);
    log("log", "=== 파수대 임포트 완료 ===");
  }
  if (options.awake) {
    log("log", "=== 깨어라 임포트 시작 ===");
    await importAwake(listOfExistingFiles, docidMap, prepared.awake);
    log("log", "=== 깨어라 임포트 완료 ===");
  }
  if (options.meeting) {
    log("log", "=== 집회 교재 임포트 시작 ===");
    await importMeeting(listOfExistingFiles, docidMap, prepared.meeting);
    log("log", "=== 집회 교재 임포트 완료 ===");
  }
  if (options.kingdomService) {
    log("log", "=== 왕국 봉사 임포트 시작 ===");
    await importKingdomService(listOfExistingFiles, docidMap, prepared.kingdomService);
    log("log", "=== 왕국 봉사 임포트 완료 ===");
  }
  if (options.programs) {
    log("log", "=== 프로그램 임포트 시작 ===");
    await importPrograms(listOfExistingFiles, docidMap, prepared.programs);
    log("log", "=== 프로그램 임포트 완료 ===");
  }
  if (options.brochures) {
    log("log", "=== 팜플렛 임포트 시작 ===");
    await importBrochures(listOfExistingFiles, docidMap, prepared.brochures);
    log("log", "=== 팜플렛 임포트 완료 ===");
  }
  if (options.tracts) {
    log("log", "=== 전도지 임포트 시작 ===");
    await importTracts(listOfExistingFiles, docidMap, prepared.tracts);
    log("log", "=== 전도지 임포트 완료 ===");
  }
  if (options.webSeries) {
    log("log", "=== 연재 기사 임포트 시작 ===");
    await importWebSeries(listOfExistingFiles, docidMap, prepared.webSeries);
    log("log", "=== 연재 기사 임포트 완료 ===");
  }
  if (options.guidelines) {
    log("log", "=== 지침 임포트 시작 ===");
    await importGuidelines(listOfExistingFiles, docidMap, prepared.guidelines);
    log("log", "=== 지침 임포트 완료 ===");
  }
  if (options.glossary) {
    log("log", "=== 용어 설명 임포트 시작 ===");
    await importGlossary(listOfExistingFiles, docidMap, prepared.glossary);
    log("log", "=== 용어 설명 임포트 완료 ===");
  }
  if (options.index) {
    log("log", "=== 색인 임포트 시작 ===");
    await importOrgIndex(listOfExistingFiles, docidMap, prepared.index);
    log("log", "=== 색인 임포트 완료 ===");
  }

  return { mapSize };
}
