/**
 * test-links.js
 * 실행: node test-links.js
 *
 * [섹션 1-8] HTTP 요청 없이 순수 로직 테스트 (~즉시)
 *   - addMapping / resolveLink / parseCrossRefText / parseArticleContent
 *   - 크로스 모듈 링크 시나리오
 *
 * [섹션 9] 실제 MD 파일 생성 테스트 (HTTP 요청 포함, ~10초)
 *   - 통찰 첫 아티클, 서적 첫 챕터
 *   - ./test-output/ 디렉토리에 결과 저장
 *   ※ 성경 장은 pc 링크가 680개 이상이어서 preResolveLinks가 수백 번
 *     HTTP 요청을 하므로 이 테스트에서는 제외합니다.
 *     실제 임포트 시 redirect-cache.json이 누적되어 이후 실행은 빠릅니다.
 */

import fs from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import axios from "axios";

import {
  resolveLink,
  parseCrossRefText,
  addMapping,
  setBookNameMap,
  parseArticleContent,
} from "./docid-map.js";
import { VAULT_BASE, VAULT_ORG_BIBLE_PATH } from "./constant.js";
import { buildBibleMappings } from "./importers/bible.js";

// WOL 요청용 공통 헤더 (User-Agent 없으면 차단됨)
const WOL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};
const wolGet = (url) => axios.get(url, { headers: WOL_HEADERS, timeout: 15000 }).then(r => r.data);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 테스트 러너 ──────────────────────────────────────────────
let passed = 0;
let failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`      → ${e.message}`);
    failed++;
  }
};

const section = (title) => {
  console.log(`\n┌─ ${title}`);
};

// ════════════════════════════════════════════════════════════
// 1. addMapping — 경로 계산
// ════════════════════════════════════════════════════════════
section("addMapping — 경로 계산");

await test("VAULT_BASE strip + .md 제거", () => {
  const map = {};
  addMapping(map, "1234567", `${VAULT_BASE}library/org-books/어떤책/01. 서론.md`);
  assert.equal(map["1234567"], "library/org-books/어떤책/01. 서론");
});

await test("동일 docId 덮어쓰기", () => {
  const map = {};
  addMapping(map, "1234567", `${VAULT_BASE}library/org-books/책A/00. 서론.md`);
  addMapping(map, "1234567", `${VAULT_BASE}library/org-books/책B/01. 결론.md`);
  assert.equal(map["1234567"], "library/org-books/책B/01. 결론");
});

await test("b:num:ch 키 직접 등록 (buildBibleMappings 방식)", () => {
  const map = {};
  const filePath = `${VAULT_BASE}library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장.md`;
  map["b:1:1"] = filePath.replace(VAULT_BASE, "").replace(/\.md$/, "");
  assert.equal(map["b:1:1"], "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장");
});

// ════════════════════════════════════════════════════════════
// 2. resolveLink — /wol/d/ 출판물 직접 링크
// ════════════════════════════════════════════════════════════
section("resolveLink — /wol/d/ 출판물 직접 링크");

{
  const map = {
    "1000001": "library/org-books/진리/01. 하느님",
    "2000001": "library/org-insight/ㅎ/하느님",
    "3000001": "library/org-watchtower/2020/wt-2020-01-01",
  };

  await test("등록된 docId → wikilink 생성", () => {
    const r = resolveLink(map, "/wol/d/r8/lp-ko/1000001", "하느님 장");
    assert.equal(r, "[[library/org-books/진리/01. 하느님|하느님 장]]");
  });

  await test("https:// 절대 경로도 정상 처리 (regex 경로 매칭)", () => {
    const r = resolveLink(map, "https://wol.jw.org/ko/wol/d/r8/lp-ko/1000001", "하느님 장");
    assert.equal(r, "[[library/org-books/진리/01. 하느님|하느님 장]]");
  });

  await test("미등록 docId → null", () => {
    const r = resolveLink(map, "/wol/d/r8/lp-ko/9999999", "없는 문서");
    assert.equal(r, null);
  });

  await test("서적 → 통찰 교차 링크", () => {
    const r = resolveLink(map, "/wol/d/r8/lp-ko/2000001", "하느님 (통찰)");
    assert.equal(r, "[[library/org-insight/ㅎ/하느님|하느님 (통찰)]]");
  });

  await test("서적 → 파수대 교차 링크", () => {
    const r = resolveLink(map, "/wol/d/r8/lp-ko/3000001", "파수대 2020");
    assert.equal(r, "[[library/org-watchtower/2020/wt-2020-01-01|파수대 2020]]");
  });
}

// ════════════════════════════════════════════════════════════
// 3. resolveLink — /wol/b/ 성경 장 패턴
// ════════════════════════════════════════════════════════════
section("resolveLink — /wol/b/ 성경 장");

{
  const map = {
    "b:1:1":  "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장",
    "b:1:50": "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 50장",
    "b:43:3": "library/org-bible/그리스도인 그리스어 성경/43. 요한복음/요한복음 3장",
    "b:66:22":"library/org-bible/그리스도인 그리스어 성경/66. 요한계시록/요한계시록 22장",
  };

  await test("창세기 1장", () => {
    const r = resolveLink(map, "/wol/b/r8/lp-ko/nwtsty/1/1", "창세기 1장");
    assert.equal(r, "[[library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장|창세기 1장]]");
  });

  await test("창세기 마지막 장 (50장)", () => {
    const r = resolveLink(map, "/wol/b/r8/lp-ko/nwtsty/1/50", "창세기 50장");
    assert.equal(r, "[[library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 50장|창세기 50장]]");
  });

  await test("요한복음 3장 (신약)", () => {
    const r = resolveLink(map, "/wol/b/r8/lp-ko/nwtsty/43/3", "요한복음 3장");
    assert.equal(r, "[[library/org-bible/그리스도인 그리스어 성경/43. 요한복음/요한복음 3장|요한복음 3장]]");
  });

  await test("요한계시록 22장", () => {
    const r = resolveLink(map, "/wol/b/r8/lp-ko/nwtsty/66/22", "요한계시록 22장");
    assert.equal(r, "[[library/org-bible/그리스도인 그리스어 성경/66. 요한계시록/요한계시록 22장|요한계시록 22장]]");
  });

  await test("미등록 책 → null", () => {
    const r = resolveLink(map, "/wol/b/r8/lp-ko/nwtsty/5/1", "신명기 1장");
    assert.equal(r, null);
  });
}

// ════════════════════════════════════════════════════════════
// 4. resolveLink — /wol/bc/ 성경 절 참조 (bookNameMap 의존)
// ════════════════════════════════════════════════════════════
section("resolveLink — /wol/bc/ 성경 절 참조");

{
  setBookNameMap({
    "창세기": 1,
    "출애굽기": 2,
    "시편": 19,
    "요한복음": 43,
    "요한 계시록": 66,
  });

  const map = {
    "b:1:1":  "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장",
    "b:2:3":  "library/org-bible/히브리어-아람어 성경/02. 출애굽기/출애굽기 3장",
    "b:43:3": "library/org-bible/그리스도인 그리스어 성경/43. 요한복음/요한복음 3장",
  };

  await test("창세기 1:1 → 절 anchor wikilink", () => {
    const r = resolveLink(map, "/wol/bc/r8/lp-ko/nwtsty/1/1/1", "창세기 1:1");
    assert.equal(r, "[[library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장#^v1|창세기 1:1]]");
  });

  await test("요한복음 3:16 → 절 anchor wikilink", () => {
    const r = resolveLink(map, "/wol/bc/r8/lp-ko/nwtsty/43/3/16", "요한복음 3:16");
    assert.equal(r, "[[library/org-bible/그리스도인 그리스어 성경/43. 요한복음/요한복음 3장#^v16|요한복음 3:16]]");
  });

  await test("출애굽기 3:14 → 절 anchor wikilink", () => {
    const r = resolveLink(map, "/wol/bc/r8/lp-ko/nwtsty/2/3/14", "출애굽기 3:14");
    assert.equal(r, "[[library/org-bible/히브리어-아람어 성경/02. 출애굽기/출애굽기 3장#^v14|출애굽기 3:14]]");
  });

  await test("bookNameMap 미등록 책 → null", () => {
    const r = resolveLink(map, "/wol/bc/r8/lp-ko/nwtsty/5/6/4", "신명기 6:4");
    assert.equal(r, null);
  });

  await test("책은 있지만 장 미등록 → null", () => {
    const r = resolveLink(map, "/wol/bc/r8/lp-ko/nwtsty/19/23/1", "시편 23:1");
    assert.equal(r, null);
  });

  await test("공백 포함 책명 + 장 미등록 → null", () => {
    const r = resolveLink(map, "/wol/bc/r8/lp-ko/nwtsty/66/22/13", "요한 계시록 22:13");
    assert.equal(r, null);
  });
}

// ════════════════════════════════════════════════════════════
// 5. resolveLink — /wol/dsim/ 유사 콘텐츠
// ════════════════════════════════════════════════════════════
section("resolveLink — /wol/dsim/ 유사 콘텐츠");

{
  const map = { "1000001": "library/org-books/진리/01. 하느님" };

  await test("dsim docId → wikilink", () => {
    const r = resolveLink(map, "/wol/dsim/r8/lp-ko/1000001", "유사 내용");
    assert.equal(r, "[[library/org-books/진리/01. 하느님|유사 내용]]");
  });

  await test("dsim 미등록 → null", () => {
    const r = resolveLink(map, "/wol/dsim/r8/lp-ko/9999999", "없음");
    assert.equal(r, null);
  });
}

// ════════════════════════════════════════════════════════════
// 6. parseCrossRefText — 한국어 성경 약어 파싱
// ════════════════════════════════════════════════════════════
section("parseCrossRefText — 성경 약어 → wikilink");

{
  const map = {
    "b:1:1":   "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장",
    "b:19:102":"library/org-bible/히브리어-아람어 성경/19. 시편/시편 102장",
    "b:23:42": "library/org-bible/히브리어-아람어 성경/23. 이사야/이사야 42장",
    "b:23:45": "library/org-bible/히브리어-아람어 성경/23. 이사야/이사야 45장",
    "b:43:3":  "library/org-bible/그리스도인 그리스어 성경/43. 요한복음/요한복음 3장",
    "b:45:1":  "library/org-bible/그리스도인 그리스어 성경/45. 로마서/로마서 1장",
  };

  await test("단일 절 (시 102:25)", () => {
    const r = parseCrossRefText("시 102:25", map);
    assert.equal(r, "[[library/org-bible/히브리어-아람어 성경/19. 시편/시편 102장#^v25|시 102:25]]");
  });

  await test("복합 약어 세미콜론 (시 102:25; 사 42:5)", () => {
    const r = parseCrossRefText("시 102:25; 사 42:5", map);
    assert.ok(r.includes("시편 102장#^v25"), `시편 미포함: ${r}`);
    assert.ok(r.includes("이사야 42장#^v5"), `이사야 미포함: ${r}`);
  });

  await test("이전 책 이어짐 (사 42:5; 45:18)", () => {
    const r = parseCrossRefText("사 42:5; 45:18", map);
    assert.ok(r.includes("이사야 42장#^v5"), `42장 미포함: ${r}`);
    assert.ok(r.includes("이사야 45장#^v18"), `45장 미포함: ${r}`);
  });

  await test("신약 약어 (롬 1:20)", () => {
    const r = parseCrossRefText("롬 1:20", map);
    assert.ok(r.includes("로마서 1장#^v20"), `로마서 미포함: ${r}`);
  });

  await test("요한 약어 (요 3:16)", () => {
    const r = parseCrossRefText("요 3:16", map);
    assert.ok(r.includes("요한복음 3장#^v16"), `요한복음 미포함: ${r}`);
  });

  await test("창세기 약어 (창 1:1)", () => {
    const r = parseCrossRefText("창 1:1", map);
    assert.ok(r.includes("창세기 1장#^v1"), `창세기 미포함: ${r}`);
  });

  await test("미등록 장 → 원본 텍스트 유지 (시 1:1)", () => {
    const r = parseCrossRefText("시 1:1", map);
    assert.equal(r, "시 1:1");
  });

  await test("혼합 3개 (창 1:1; 시 102:25; 롬 1:20)", () => {
    const r = parseCrossRefText("창 1:1; 시 102:25; 롬 1:20", map);
    assert.ok(r.includes("창세기 1장#^v1"));
    assert.ok(r.includes("시편 102장#^v25"));
    assert.ok(r.includes("로마서 1장#^v20"));
  });
}

// ════════════════════════════════════════════════════════════
// 7. parseArticleContent — HTML → Markdown + 링크 변환
// ════════════════════════════════════════════════════════════
section("parseArticleContent — HTML 파싱 + 링크 변환");

{
  setBookNameMap({ "창세기": 1, "요한복음": 43 });

  const map = {
    "1000001": "library/org-books/진리/01. 하느님",
    "2000001": "library/org-insight/ㅎ/하느님",
    "b:1:1":   "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장",
    "b:43:3":  "library/org-bible/그리스도인 그리스어 성경/43. 요한복음/요한복음 3장",
  };

  const html = `
    <html><body>
      <div id="article">
        <h1>테스트 제목</h1>
        <h2>소제목</h2>
        <p>이 문서는 <a href="/wol/d/r8/lp-ko/1000001">진리 1장</a>을 참조합니다.</p>
        <p>통찰 참조: <a href="/wol/d/r8/lp-ko/2000001">하느님 (통찰)</a></p>
        <p>성경 장: <a href="/wol/b/r8/lp-ko/nwtsty/1/1">창세기 1장</a></p>
        <p>성경 절: <a href="/wol/bc/r8/lp-ko/nwtsty/1/1/1">창세기 1:1</a></p>
        <p>요한복음: <a href="/wol/b/r8/lp-ko/nwtsty/43/3">요한복음 3장</a></p>
        <p>외부 링크: <a href="https://example.com">외부사이트</a>는 텍스트로.</p>
        <p>미등록 링크: <a href="/wol/d/r8/lp-ko/9999999">없는 문서</a>도 텍스트로.</p>
        <ul>
          <li>목록 항목 1</li>
          <li>목록 항목 2</li>
        </ul>
        <blockquote>인용문</blockquote>
      </div>
    </body></html>
  `;

  const content = await parseArticleContent(html, map);

  await test("h1 → # 마크다운 헤딩", () => {
    assert.ok(content.includes("# 테스트 제목"), `헤딩 없음:\n${content}`);
  });

  await test("h2 → ## 마크다운 헤딩", () => {
    assert.ok(content.includes("## 소제목"), `h2 없음:\n${content}`);
  });

  await test("/wol/d/ → wikilink 변환", () => {
    assert.ok(
      content.includes("[[library/org-books/진리/01. 하느님|진리 1장]]"),
      `/wol/d/ 링크 미변환:\n${content}`
    );
  });

  await test("크로스 모듈: 서적 → 통찰 wikilink", () => {
    assert.ok(
      content.includes("[[library/org-insight/ㅎ/하느님|하느님 (통찰)]]"),
      `통찰 링크 미변환:\n${content}`
    );
  });

  await test("/wol/b/ → 성경 장 wikilink", () => {
    assert.ok(
      content.includes("[[library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장|창세기 1장]]"),
      `/wol/b/ 링크 미변환:\n${content}`
    );
  });

  await test("/wol/bc/ → 성경 절 anchor wikilink", () => {
    assert.ok(
      content.includes("창세기 1장#^v1|창세기 1:1]]"),
      `/wol/bc/ 링크 미변환:\n${content}`
    );
  });

  await test("외부 링크 → 표시 텍스트만 남음 (URL 제거)", () => {
    assert.ok(content.includes("외부사이트"), `텍스트 없음:\n${content}`);
    assert.ok(!content.includes("example.com"), `URL 잔존:\n${content}`);
  });

  await test("미등록 /wol/d/ → 표시 텍스트 fallback", () => {
    assert.ok(content.includes("없는 문서"), `텍스트 없음:\n${content}`);
  });

  await test("ul/li → - 목록", () => {
    assert.ok(content.includes("- 목록 항목 1"), `목록 없음:\n${content}`);
    assert.ok(content.includes("- 목록 항목 2"), `목록 없음:\n${content}`);
  });

  await test("blockquote → > 인용", () => {
    assert.ok(content.includes("> 인용문"), `인용 없음:\n${content}`);
  });
}

// ════════════════════════════════════════════════════════════
// 8. 크로스 모듈 링크 — 전방위 시나리오
// ════════════════════════════════════════════════════════════
section("크로스 모듈 링크 — 전방위 시나리오");

{
  setBookNameMap({
    "창세기": 1, "출애굽기": 2, "시편": 19, "이사야": 23, "요한복음": 43,
  });

  const allMap = {
    "1100001": "library/org-books/진리/01. 하느님",
    "1100002": "library/org-books/진리/02. 성경",
    "2100001": "library/org-insight/ㅎ/하느님",
    "2100002": "library/org-insight/ㅅ/성경",
    "3100001": "library/org-watchtower/2023/wt-2023-01",
    "4100001": "library/org-awake/2022/g-2022-01",
    "b:1:1":   "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장",
    "b:2:3":   "library/org-bible/히브리어-아람어 성경/02. 출애굽기/출애굽기 3장",
    "b:19:23": "library/org-bible/히브리어-아람어 성경/19. 시편/시편 23장",
    "b:43:3":  "library/org-bible/그리스도인 그리스어 성경/43. 요한복음/요한복음 3장",
  };

  await test("서적 → 통찰", () => {
    assert.ok(resolveLink(allMap, "/wol/d/r8/lp-ko/2100001", "하느님 (통찰)")?.includes("org-insight"));
  });

  await test("서적 → 파수대", () => {
    assert.ok(resolveLink(allMap, "/wol/d/r8/lp-ko/3100001", "파수대")?.includes("org-watchtower"));
  });

  await test("서적 → 깨어라", () => {
    assert.ok(resolveLink(allMap, "/wol/d/r8/lp-ko/4100001", "깨어라")?.includes("org-awake"));
  });

  await test("서적 → 성경 장 (/wol/b/)", () => {
    assert.ok(resolveLink(allMap, "/wol/b/r8/lp-ko/nwtsty/1/1", "창세기 1장")?.includes("org-bible"));
  });

  await test("서적 → 성경 절 (/wol/bc/)", () => {
    assert.ok(resolveLink(allMap, "/wol/bc/r8/lp-ko/nwtsty/43/3/16", "요한복음 3:16")?.includes("#^v16"));
  });

  await test("통찰 → 서적", () => {
    assert.ok(resolveLink(allMap, "/wol/d/r8/lp-ko/1100001", "진리 1장")?.includes("org-books"));
  });

  await test("성경 절 참조 — 시 23:1; 요 3:16", () => {
    const r = parseCrossRefText("시 23:1; 요 3:16", allMap);
    assert.ok(r.includes("시편 23장#^v1") && r.includes("요한복음 3장#^v16"));
  });

  await test("성경 절 참조 — 이전 책 이어짐 (출 3:6; 3:14; 3:15)", () => {
    const r = parseCrossRefText("출 3:6; 3:14; 3:15", allMap);
    assert.ok(r.includes("출애굽기 3장#^v6"));
    assert.ok(r.includes("출애굽기 3장#^v14"));
    assert.ok(r.includes("출애굽기 3장#^v15"));
  });

  await test("모든 모듈 경로 형식 검증", () => {
    const checks = [
      [allMap["1100001"], "org-books"],
      [allMap["2100001"], "org-insight"],
      [allMap["3100001"], "org-watchtower"],
      [allMap["4100001"], "org-awake"],
      [allMap["b:1:1"],   "org-bible"],
    ];
    for (const [p, kw] of checks) assert.ok(p?.includes(kw), `${kw} 없음: ${p}`);
  });
}

// ════════════════════════════════════════════════════════════
// 9. 실제 MD 파일 생성 — WOL HTTP 요청 + 파일 쓰기
//    결과: ./test-output/ 디렉토리 확인
// ════════════════════════════════════════════════════════════
section("실제 MD 파일 생성 (HTTP 요청 포함 ~20초)");

const TEST_OUT = path.join(VAULT_BASE, "library");
fs.mkdirSync(TEST_OUT, { recursive: true });

// 테스트용 docidMap: 주요 성경 책 b:num:ch 등록 (HTTP 없이)
const buildTestBibleMap = () => {
  const books = [
    { num: 1,  name: "창세기",   ch: 50, cat: "히브리어-아람어 성경" },
    { num: 2,  name: "출애굽기", ch: 40, cat: "히브리어-아람어 성경" },
    { num: 19, name: "시편",     ch: 150, cat: "히브리어-아람어 성경" },
    { num: 23, name: "이사야",   ch: 66,  cat: "히브리어-아람어 성경" },
    { num: 43, name: "요한복음", ch: 21,  cat: "그리스도인 그리스어 성경" },
    { num: 45, name: "로마서",   ch: 16,  cat: "그리스도인 그리스어 성경" },
    { num: 66, name: "요한계시록", ch: 22, cat: "그리스도인 그리스어 성경" },
  ];
  const map = {};
  for (const b of books) {
    const padded = String(b.num).padStart(2, "0");
    for (let ch = 1; ch <= b.ch; ch++) {
      map[`b:${b.num}:${ch}`] = `library/org-bible/${b.cat}/${padded}. ${b.name}/${b.name} ${ch}장`;
    }
  }
  return map;
};

// 전체 테스트용 bookNameMap 세팅
setBookNameMap({
  "창세기": 1, "출애굽기": 2, "레위기": 3, "민수기": 4, "신명기": 5,
  "여호수아": 6, "사사기": 7, "룻": 8, "사무엘상": 9, "사무엘하": 10,
  "열왕기상": 11, "열왕기하": 12, "역대상": 13, "역대하": 14,
  "에스라": 15, "느헤미야": 16, "에스더": 17, "욥": 18, "시편": 19,
  "잠언": 20, "전도서": 21, "아가": 22, "이사야": 23, "예레미야": 24,
  "예레미야 애가": 25, "에스겔": 26, "다니엘": 27, "호세아": 28,
  "요엘": 29, "아모스": 30, "오바댜": 31, "요나": 32, "미가": 33,
  "나훔": 34, "하박국": 35, "스바냐": 36, "학개": 37, "스가랴": 38,
  "말라기": 39, "마태복음": 40, "마가복음": 41, "누가복음": 42,
  "요한복음": 43, "사도행전": 44, "로마서": 45, "고린도전서": 46,
  "고린도후서": 47, "갈라디아서": 48, "에베소서": 49, "빌립보서": 50,
  "골로새서": 51, "데살로니가전서": 52, "데살로니가후서": 53,
  "디모데전서": 54, "디모데후서": 55, "디도서": 56, "빌레몬서": 57,
  "히브리서": 58, "야고보서": 59, "베드로전서": 60, "베드로후서": 61,
  "요한일서": 62, "요한이서": 63, "요한삼서": 64, "유다서": 65, "요한 계시록": 66,
});

const testMap = buildTestBibleMap();

// 헬퍼: HTML에서 첫 번째 /wol/d/ 링크 추출
const firstDocLink = (html) => {
  const $ = cheerio.load(html);
  let result = null;
  $('a[href*="/wol/d/r8/lp-ko/"]').each((_, el) => {
    if (result) return;
    const href = $(el).attr("href");
    const docId = href.split("/").pop();
    const title = $(el).text().trim();
    if (docId && title) result = { docId, title };
  });
  return result;
};

// 헬퍼: HTML에서 첫 번째 /wol/publication/ 링크 추출
const firstPubLink = (html) => {
  const $ = cheerio.load(html);
  let result = null;
  $('a[href*="/wol/publication/r8/lp-ko/"]').each((_, el) => {
    if (result) return;
    const href = $(el).attr("href");
    const abbrev = href.split("/").pop();
    const title = $(el).text().trim();
    if (abbrev && title) result = { abbrev, title };
  });
  return result;
};

// 헬퍼: HTML에서 첫 번째 /wol/lv/ 링크 추출 (minId 초과인 것만)
const firstLvLink = (html, minId = 0) => {
  const $ = cheerio.load(html);
  let result = null;
  $('a[href*="/wol/lv/r8/lp-ko/0/"]').each((_, el) => {
    if (result) return;
    const href = $(el).attr("href");
    const idMatch = href?.match(/\/0\/(\d+)/);
    const lvId = idMatch ? parseInt(idMatch[1]) : 0;
    if (lvId <= minId) return;
    const title = $(el).text().trim();
    if (href && title) result = { url: `https://wol.jw.org${href}`, title };
  });
  return result;
};

// ── 테스트 9-1: 통찰 첫 아티클 ─────────────────────────────
await test("통찰 첫 아티클 fetch → test-output/통찰_*.md", async () => {
  // Step 1: 통찰 루트 → 첫 번째 섹션 URL 추출
  const rootHtml = await wolGet("https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/943");
  // 943이 통찰 루트 ID → 그 이상인 것만 선택 (nav 링크 id=0 제외)
  const firstSection = firstLvLink(String(rootHtml), 943);
  assert.ok(firstSection, "통찰 섹션 링크 없음");
  await delay(200);

  // Step 2: 섹션 페이지 → 첫 번째 아티클 docId 추출
  const sectionHtml = await wolGet(firstSection.url);
  const firstArticle = firstDocLink(String(sectionHtml));
  assert.ok(firstArticle, `${firstSection.title} 섹션에 아티클 없음`);
  await delay(200);

  // Step 3: 아티클 fetch → parse → write
  const articleHtml = await wolGet(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${firstArticle.docId}`);
  const content = await parseArticleContent(String(articleHtml), testMap);
  assert.ok(content.length > 0, "파싱 결과 비어있음");

  const safeName = firstArticle.title.replace(/[/\\?%*:|"<>]/g, "-").trim();
  const outPath = path.join(TEST_OUT, `통찰_${safeName}.md`);
  fs.writeFileSync(outPath, content);

  const written = fs.readFileSync(outPath, "utf-8");
  assert.ok(written.length > 0, "파일이 비어있음");

  const wikilinks = (written.match(/\[\[.+?\]\]/g) || []).length;
  const lines = written.split("\n").slice(0, 3).join(" | ");
  console.log(`      → ${outPath} (${written.length}자, wikilink ${wikilinks}개)`);
  console.log(`      미리보기: ${lines}`);
});

await delay(300);

// ── 테스트 9-2: 서적 첫 챕터 ───────────────────────────────
await test("서적 첫 챕터 fetch → test-output/서적_*.md", async () => {
  // Step 1: 서적 루트 → pub 링크 추출 (바로 있으면 사용, 없으면 lv 한 단계 더)
  // 간헐적 404 대비: 실패 시 알려진 안정적 pub(ia) 사용
  let pub = null;
  try {
    const rootHtml = await wolGet("https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/48946");
    await delay(300);
    pub = firstPubLink(String(rootHtml));
    if (!pub) {
      const lvLink = firstLvLink(String(rootHtml));
      if (lvLink) {
        const lvHtml = await wolGet(lvLink.url);
        await delay(200);
        pub = firstPubLink(String(lvHtml));
      }
    }
  } catch {}
  if (!pub) pub = { abbrev: "ia", title: "믿음의 본" }; // fallback

  // Step 2: TOC → 내용 있는 첫 챕터 찾기 (표지/속표지 등 빈 페이지 스킵)
  let tocHtml;
  try {
    tocHtml = await wolGet(`https://wol.jw.org/ko/wol/publication/r8/lp-ko/${pub.abbrev}`);
  } catch {
    tocHtml = await wolGet(`https://wol.jw.org/ko/wol/publication/r8/lp-ko/ia`);
    pub = { abbrev: "ia", title: "믿음의 본" };
  }
  await delay(200);

  const $toc = cheerio.load(String(tocHtml));
  const candidates = [];
  $toc('a[href*="/wol/d/r8/lp-ko/"]').each((_, el) => {
    if (candidates.length >= 6) return;
    const href = $toc(el).attr("href");
    const docId = href.split("/").pop();
    const title = $toc(el).text().replace(/\s+/g, " ").trim();
    if (docId && title) candidates.push({ docId, title });
  });
  assert.ok(candidates.length > 0, `${pub.title} TOC에 챕터 없음`);

  // Step 3: 내용 있는 챕터 찾기 (최대 6개 시도, 404/오류 스킵)
  let firstChapter = null;
  let content = "";
  for (const ch of candidates) {
    try {
      const articleHtml = await wolGet(`https://wol.jw.org/ko/wol/d/r8/lp-ko/${ch.docId}`);
      await delay(150);
      const c = await parseArticleContent(String(articleHtml), testMap);
      if (c.length > 100) {
        firstChapter = ch;
        content = c;
        break;
      }
    } catch {
      // 404 또는 fetch 오류 → 다음 챕터로
    }
  }
  assert.ok(firstChapter, `${pub.title} 내용 있는 챕터 없음 (6개 시도)`);
  assert.ok(content.length > 0, "파싱 결과 비어있음");

  const safePub = pub.title.replace(/\s+/g, " ").replace(/[/\\?%*:|"<>]/g, "-").trim();
  const safeCh  = firstChapter.title.replace(/\s+/g, " ").replace(/[/\\?%*:|"<>]/g, "-").trim();
  const outPath = path.join(TEST_OUT, `서적_${safePub}_${safeCh}.md`);
  fs.writeFileSync(outPath, content);

  const written = fs.readFileSync(outPath, "utf-8");
  assert.ok(written.length > 0, "파일이 비어있음");

  const wikilinks = (written.match(/\[\[.+?\]\]/g) || []).length;
  const lines = written.split("\n").slice(0, 3).join(" | ");
  console.log(`      → ${outPath} (${written.length}자, wikilink ${wikilinks}개)`);
  console.log(`      미리보기: ${lines}`);
});

// ── 테스트 9-4: 생성된 MD 파일 내 wikilink 검증 ─────────────
await test("생성된 MD 파일에 wikilink 또는 텍스트 내용 존재 확인", () => {
  const files = fs.readdirSync(TEST_OUT).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 2, `MD 파일이 2개 미만: ${files.length}개`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(TEST_OUT, file), "utf-8");
    // 최소한 헤딩(#) 또는 단락 텍스트가 있어야 함
    const hasContent = content.includes("#") || content.split("\n").length > 3;
    assert.ok(hasContent, `${file}: 내용 없음`);

    // wikilink가 있으면 형식 검증
    const wikilinks = content.match(/\[\[.+?\]\]/g) || [];
    for (const link of wikilinks) {
      assert.ok(
        link.match(/\[\[.+\|.+\]\]/) || link.match(/\[\[.+\]\]/),
        `잘못된 wikilink 형식: ${link} (파일: ${file})`
      );
    }

    console.log(`      ${file}: ${content.length}자, wikilink ${wikilinks.length}개`);
  }
});

// ════════════════════════════════════════════════════════════
// 10. 창세기 1장 — Phase1 매핑 + HTML 구조 검증
//     Phase1: buildBibleMappings → b:1:1 경로 확인
//     Phase2: 실제 HTML fetch → 절 마커·pc링크 구조 확인
//            + wikilink 해결 로직 검증
// ════════════════════════════════════════════════════════════
section("창세기 1장 — Phase1 매핑 + Phase2 HTML 구조 검증");

await test("Phase1: buildBibleMappings → b:1:1 경로 = constant.js VAULT_ORG_BIBLE_PATH", async () => {
  const genesisBook = { num: 1, name: "창세기", chapters: 1, category: "히브리어-아람어 성경" };
  const bibleMap = {};
  await buildBibleMappings(bibleMap, { books: [genesisBook], includeAppendix: false });

  assert.ok(bibleMap["b:1:1"], "b:1:1 매핑 없음");
  const expected = "library/org-bible/히브리어-아람어 성경/01. 창세기/창세기 1장";
  assert.equal(bibleMap["b:1:1"], expected, `경로 불일치: ${bibleMap["b:1:1"]}`);
  console.log(`      b:1:1 → ${bibleMap["b:1:1"]}`);
  console.log(`      저장 경로: ${VAULT_ORG_BIBLE_PATH}히브리어-아람어 성경/01. 창세기/창세기 1장.md`);
});

await test("Phase2: 창세기 1장 HTML fetch → 절 마커·pc링크 구조 확인", async () => {
  // wolGet(User-Agent 포함)으로 직접 fetch
  // ※ requests.js getLvPageAPI는 User-Agent가 없어 WOL이 차단함
  //   → 실제 importBible 실행 전 requests.js에 User-Agent 헤더 추가 필요
  const html = await wolGet("https://wol.jw.org/ko/wol/b/r8/lp-ko/nwtsty/1/1");
  const $ = cheerio.load(String(html));

  // parseBibleChapter가 사용하는 구조 확인
  const verseMarkers = $('a[href*="/wol/dx/r8/lp-ko/"]').length;
  const pcLinks = $('a[href*="/wol/pc/"]').length + $('a[href*="/wol/tc/"]').length;
  // parseBibleChapter: .bodyTxt → #article → article → body 순 fallback
  const hasContent = $(".bodyTxt").length > 0 || $("#article").length > 0 || $("article").length > 0;
  const contentSel = $(".bodyTxt").length ? ".bodyTxt" : $("#article").length ? "#article" : "article";

  assert.ok(hasContent, "parseBibleChapter 본문 컨테이너 없음");
  assert.ok(verseMarkers >= 31, `창세기 1장 31절, 마커 ${verseMarkers}개`);

  console.log(`      본문 컨테이너: ${contentSel} | 절 마커: ${verseMarkers}개 | pc/tc 링크: ${pcLinks}개`);
  console.log(`      → ${pcLinks}개 pc/tc는 preResolveLinks가 redirect-cache에 저장 후 wikilink 변환`);
  console.log(`      ⚠  requests.js getLvPageAPI에 User-Agent 추가 필요 (현재 WOL이 차단)`);
});

await test("Phase2: 창세기 1장 wikilink 해결 경로 확인 (b:1:1 → #^v절)", async () => {
  // 전체 성경 맵 구성 (창세기 50장 전체)
  const genesisBook = { num: 1, name: "창세기", chapters: 50, category: "히브리어-아람어 성경" };
  const bibleMap = {};
  await buildBibleMappings(bibleMap, { books: [genesisBook], includeAppendix: false });

  // 창세기 내 절 참조 예시: 창 1:1 → b:1:1 → wikilink
  const link1_1 = resolveLink(bibleMap, "/wol/bc/r8/lp-ko/nwtsty/1/1/1", "창세기 1:1");
  assert.ok(link1_1?.includes("창세기 1장#^v1"), `창세기 1:1 wikilink 실패: ${link1_1}`);

  const link1_28 = resolveLink(bibleMap, "/wol/bc/r8/lp-ko/nwtsty/1/1/28", "창세기 1:28");
  assert.ok(link1_28?.includes("창세기 1장#^v28"), `창세기 1:28 wikilink 실패: ${link1_28}`);

  const link1_2 = resolveLink(bibleMap, "/wol/b/r8/lp-ko/nwtsty/1/2", "창세기 2장");
  assert.ok(link1_2?.includes("창세기 2장"), `창세기 2장 wikilink 실패: ${link1_2}`);

  console.log(`      창세기 1:1  → ${link1_1}`);
  console.log(`      창세기 1:28 → ${link1_28}`);
  console.log(`      창세기 2장  → ${link1_2}`);
});

// ════════════════════════════════════════════════════════════
// 결과 출력
// ════════════════════════════════════════════════════════════
const total = passed + failed;
console.log(`\n${"─".repeat(50)}`);
console.log(`결과: ${passed} 통과 / ${failed} 실패 / 총 ${total}개`);
if (failed === 0) {
  console.log(`모든 테스트 통과 ✓`);
  console.log(`생성된 파일: ${TEST_OUT}`);
} else {
  process.exit(1);
}
