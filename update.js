// update.js — 정기 업데이트 CLI (브라우저 불필요)
// ─────────────────────────────────────────────────────────────
// 지속적으로 새 항목이 나오는 출판물을 구조 캐시 기반으로 빠르게 재크롤·임포트한다.
// cron/launchd로 스케줄링해 자동 최신화에 쓸 수 있다.
//
// 사용법:
//   node update.js                      # 기본 프리셋(정기 갱신 출판물) 재크롤
//   node update.js watchtower awake     # 지정한 카테고리만
//   node update.js --no-cache           # 구조 캐시 없이 전체 재크롤
//
// 기본 프리셋: 영상·파수대·집회교재
// (다른 카테고리는 필요할 때 인자로 지정)
// ─────────────────────────────────────────────────────────────
import { runImport } from "./import-runner.js";

// 정기 업데이트 기본 대상. 여기에 카테고리 키를 넣거나 빼서 조정한다.
// 사용 가능한 키:
//   videos, bible, books, insight, watchtower, awake, meeting,
//   kingdomService, programs, brochures, tracts, webSeries,
//   guidelines, glossary, index
// (books는 개별 책이 아니라 서적 카테고리 전체를 뜻함)
const UPDATING = ["videos", "watchtower", "meeting"];
const ALL = [
  "bible", "books", "insight", "watchtower", "awake", "meeting",
  "kingdomService", "programs", "brochures", "tracts", "webSeries",
  "guidelines", "glossary", "index",
];

const args = process.argv.slice(2);
const noCache = args.includes("--no-cache");
const picked = args.filter((a) => !a.startsWith("--"));

const invalid = picked.filter((k) => !ALL.includes(k));
if (invalid.length) {
  console.error(`알 수 없는 카테고리: ${invalid.join(", ")}`);
  console.error(`사용 가능: ${ALL.join(", ")}`);
  process.exit(1);
}

const targets = picked.length ? picked : UPDATING;

// 선택 카테고리를 켜고, 구조 캐시 사용 시 강제 재크롤 대상으로 지정
const options = { useStructureCache: !noCache, refreshModules: targets };
for (const k of targets) options[k] = true;

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);

console.log(
  `[${ts()}] 정기 업데이트 시작 — 대상: ${targets.join(", ")}` +
    (noCache ? " (구조 캐시 미사용)" : "")
);

runImport(options, (type, msg) => {
  if (type === "error") console.error(msg);
  else console.log(msg);
})
  .then(({ mapSize }) => {
    console.log(`[${ts()}] ✅ 완료 — docid-map ${mapSize}개 항목`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(`[${ts()}] ❌ 오류: ${e.message}`);
    process.exit(1);
  });
