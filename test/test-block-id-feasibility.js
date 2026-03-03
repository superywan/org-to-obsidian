/**
 * Phase 1: WOL HTML 구조 검증 — 단락 블록 ID 딥링크 가능성 테스트
 *
 * 확인 사항:
 * 1. 일반 기사(서적/통찰/색인)의 <p>, <h1>~<h3>에 id, data-pid 속성이 있는가?
 * 2. <a> 링크에 #h=, #p= 같은 fragment가 포함되는가?
 * 3. pc 리다이렉트 응답(Location 헤더)에 단락 fragment가 있는가?
 */
import axios from "axios";
import * as cheerio from "cheerio";

const WOL_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const fetchArticle = async (docId) => {
  const resp = await axios.get(
    `https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`,
    { headers: WOL_HEADERS, timeout: 30000 }
  );
  return resp.data;
};

const analyzeHtml = (html, label) => {
  const $ = cheerio.load(html);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${label}]`);
  console.log("=".repeat(60));

  // ── 1. 단락/제목 ID 확인 ──────────────
  const articleEl =
    $("#article").length > 0
      ? $("#article")
      : $("article").length > 0
      ? $("article")
      : $("body");

  const stats = { p: { total: 0, withId: 0, withDataPid: 0 } };
  const samplePIds = [];
  const headingSamples = [];

  articleEl.find("p").each((_, el) => {
    stats.p.total++;
    const id = $(el).attr("id");
    const dataPid = $(el).attr("data-pid");
    if (id) {
      stats.p.withId++;
      if (samplePIds.length < 8) samplePIds.push(id);
    }
    if (dataPid) stats.p.withDataPid++;
  });

  articleEl.find("h1, h2, h3").each((_, el) => {
    const tag = el.tagName;
    const id = $(el).attr("id");
    const text = $(el).text().replace(/\s+/g, " ").trim().substring(0, 60);
    headingSamples.push({ tag, id: id || "(none)", text });
  });

  console.log(`\n  <p> 태그: 총 ${stats.p.total}개`);
  console.log(`    id 속성 있음: ${stats.p.withId}개`);
  console.log(`    data-pid 속성 있음: ${stats.p.withDataPid}개`);
  console.log(`    샘플 id: ${samplePIds.join(", ") || "(없음)"}`);

  console.log(`\n  제목 태그:`);
  for (const h of headingSamples) {
    console.log(`    <${h.tag}> id="${h.id}" → "${h.text}"`);
  }

  // ── 전체 요소의 id 패턴 조사 ──────────
  const allIds = [];
  articleEl.find("*[id]").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const id = $(el).attr("id");
    if (allIds.length < 20) allIds.push(`<${tag} id="${id}">`);
  });
  console.log(`\n  id 속성이 있는 모든 요소 (최대 20개):`);
  for (const item of allIds) {
    console.log(`    ${item}`);
  }

  // ── 2. 링크 fragment 확인 ──────────────
  let totalLinks = 0;
  let linksWithHash = 0;
  const fragmentSamples = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    totalLinks++;
    if (href.includes("#")) {
      linksWithHash++;
      if (fragmentSamples.length < 15) {
        const text = $(el).text().trim().substring(0, 50);
        fragmentSamples.push({ text, href: href.substring(0, 150) });
      }
    }
  });

  console.log(`\n  <a> 링크: 총 ${totalLinks}개`);
  console.log(`    # fragment 포함: ${linksWithHash}개`);
  if (fragmentSamples.length > 0) {
    console.log(`    fragment 샘플:`);
    for (const s of fragmentSamples) {
      console.log(`      "${s.text}" → ${s.href}`);
    }
  }

  // ── 3. pc/tc 링크 패턴 분석 ──────────────
  const pcLinks = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("/wol/pc/") || href.includes("/wol/tc/")) {
      const text = $(el).text().trim().substring(0, 50);
      if (pcLinks.length < 10) pcLinks.push({ text, href });
    }
  });

  if (pcLinks.length > 0) {
    console.log(`\n  pc/tc 링크 샘플 (최대 10개):`);
    for (const link of pcLinks) {
      console.log(`    "${link.text}" → ${link.href}`);
    }
  }
};

// ── 3. pc 리다이렉트 fragment 확인 ──────────────
const testRedirectFragment = async (pcUrl) => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[리다이렉트 fragment 테스트]`);
  console.log("=".repeat(60));
  console.log(`  요청: ${pcUrl}`);

  try {
    const fullUrl = pcUrl.startsWith("http")
      ? pcUrl
      : `https://wol.jw.org${pcUrl}`;
    const resp = await axios.get(fullUrl, {
      headers: WOL_HEADERS,
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 15000,
    });

    console.log(`  응답 상태: ${resp.status}`);

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.location || "(없음)";
      console.log(`  Location 헤더: ${location}`);
      const hasFragment = location.includes("#");
      console.log(`  fragment 포함: ${hasFragment ? "YES" : "NO"}`);
      if (hasFragment) {
        const fragment = location.substring(location.indexOf("#"));
        console.log(`  fragment 값: ${fragment}`);
      }
    } else if (resp.status === 200) {
      console.log(`  200 응답 (리다이렉트 없음) — 본문에서 docId 링크 검색`);
      if (typeof resp.data === "string") {
        const match = resp.data.match(/\/wol\/d\/r8\/lp-ko\/(\d+)(#[^"'\s]*)?/);
        if (match) {
          console.log(`  본문 내 docId 링크: ${match[0]}`);
          console.log(`  fragment: ${match[2] || "(없음)"}`);
        }
      }
    }
  } catch (e) {
    console.error(`  오류: ${e.message}`);
  }
};

// ═══════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════
const main = async () => {
  console.log("WOL HTML 구조 검증 — 단락 블록 ID 가능성 테스트\n");

  // 1. 서적 기사
  console.log("서적 기사 가져오는 중 (docId: 1102002022)...");
  const bookHtml = await fetchArticle("1102002022");
  analyzeHtml(bookHtml, "서적: 가까이 가십시오 1장 (1102002022)");

  // 2. 색인 기사 (사용자 제시 예시)
  console.log("\n색인 기사 가져오는 중 (docId: 1200272288)...");
  const indexHtml = await fetchArticle("1200272288");
  analyzeHtml(indexHtml, "색인: 가구(집기) (1200272288)");

  // 3. 통찰 기사
  console.log("\n통찰 기사 가져오는 중 (docId: 1200000849)...");
  try {
    const insightHtml = await fetchArticle("1200000849");
    analyzeHtml(insightHtml, "통찰: (1200000849)");
  } catch (e) {
    console.log(`  통찰 기사 가져오기 실패: ${e.message}`);
    // 대체 docId 시도
    console.log("  대체 통찰 기사 (1200000005) 시도...");
    const insightHtml2 = await fetchArticle("1200000005");
    analyzeHtml(insightHtml2, "통찰: (1200000005)");
  }

  // 4. pc 리다이렉트 fragment 테스트
  // 색인 기사 내 pc 링크들 테스트
  await testRedirectFragment("/ko/wol/pc/r8/lp-ko/1200272288/0/0");
  await testRedirectFragment("/ko/wol/pc/r8/lp-ko/1200272288/0/2");

  // 서적에서의 pc 링크도 테스트
  await testRedirectFragment("/ko/wol/pc/r8/lp-ko/1102002022/0/0");

  // ── 결론 ──────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("검증 완료! 위 결과를 분석하여 Phase 2 진행 여부를 판단합니다.");
  console.log("=".repeat(60));
};

main().catch((e) => {
  console.error("테스트 실패:", e.message);
  process.exit(1);
});
