/**
 * 비디오 자막 성구 태그 테스트
 * - addScriptureTags() 함수의 동작 검증
 * - 다양한 성구 패턴 감지 확인
 * - wikilink 생성 + 태그 수집 확인
 */
import { addScriptureTags, loadMap } from "../docid-map.js";

const docidMap = loadMap();
console.log(`docid-map 항목 수: ${Object.keys(docidMap).length}\n`);

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
};

// ═══════════════════════════════════════
// 1. 기본 장:절 패턴
// ═══════════════════════════════════════
console.log("\n=== 1. 기본 장:절 패턴 ===\n");

const t1 = addScriptureTags("예수께서는 요한복음 14:1의 말씀을 하셨습니다.", docidMap);
console.log("  입력: 예수께서는 요한복음 14:1의 말씀을 하셨습니다.");
console.log("  출력:", t1);
assert(t1.includes("[[") && t1.includes("요한복음 14:1"), "요한복음 14:1 → wikilink 생성");
assert(t1.includes("#성구/요한복음/14/1"), "요한복음 14:1 → 태그 생성");

const t2 = addScriptureTags("이사야 41:10을 읽어 봅시다.", docidMap);
console.log("\n  입력: 이사야 41:10을 읽어 봅시다.");
console.log("  출력:", t2);
assert(t2.includes("#성구/이사야/41/10"), "이사야 41:10 → 태그 생성");

// ═══════════════════════════════════════
// 2. 절 범위 (dash)
// ═══════════════════════════════════════
console.log("\n=== 2. 절 범위 (dash) ===\n");

const t3 = addScriptureTags("마태복음 6:25-33에서 말하는 것처럼", docidMap);
console.log("  입력: 마태복음 6:25-33에서 말하는 것처럼");
console.log("  출력:", t3);
assert(t3.includes("#성구/마태복음/6/25"), "6:25-33 → 25절 태그");
assert(t3.includes("#성구/마태복음/6/33"), "6:25-33 → 33절 태그");

// ═══════════════════════════════════════
// 3. 쉼표 나열
// ═══════════════════════════════════════
console.log("\n=== 3. 쉼표 나열 ===\n");

const t4 = addScriptureTags("요한복음 5:28, 29에서는", docidMap);
console.log("  입력: 요한복음 5:28, 29에서는");
console.log("  출력:", t4);
assert(t4.includes("#성구/요한복음/5/28"), "5:28, 29 → 28절 태그");
assert(t4.includes("#성구/요한복음/5/29"), "5:28, 29 → 29절 태그");

// ═══════════════════════════════════════
// 4. 복합 책이름 (전서/후서)
// ═══════════════════════════════════════
console.log("\n=== 4. 복합 책이름 ===\n");

const t5 = addScriptureTags("고린도 전서 13:4에 나오는 사랑", docidMap);
console.log("  입력: 고린도 전서 13:4에 나오는 사랑");
console.log("  출력:", t5);
assert(t5.includes("#성구/고린도전서/13/4"), "고린도 전서 13:4 → 태그");

const t6 = addScriptureTags("베드로 전서 3:7의 말씀", docidMap);
console.log("\n  입력: 베드로 전서 3:7의 말씀");
console.log("  출력:", t6);
assert(t6.includes("#성구/베드로전서/3/7"), "베드로 전서 3:7 → 태그");

// ═══════════════════════════════════════
// 5. 접미사 생략형 (마태, 히브리 등)
// ═══════════════════════════════════════
console.log("\n=== 5. 접미사 생략형 ===\n");

const t7 = addScriptureTags("마태 6:33의 원칙", docidMap);
console.log("  입력: 마태 6:33의 원칙");
console.log("  출력:", t7);
assert(t7.includes("#성구/마태복음/6/33"), "마태 6:33 → 마태복음으로 매핑");

const t8 = addScriptureTags("히브리 11:1은 믿음에 대해", docidMap);
console.log("\n  입력: 히브리 11:1은 믿음에 대해");
console.log("  출력:", t8);
assert(t8.includes("#성구/히브리서/11/1"), "히브리 11:1 → 히브리서로 매핑");

// ═══════════════════════════════════════
// 6. 장/절 형식
// ═══════════════════════════════════════
console.log("\n=== 6. 장/절 형식 ===\n");

const t9 = addScriptureTags("히브리서 11장 24절을 보면", docidMap);
console.log("  입력: 히브리서 11장 24절을 보면");
console.log("  출력:", t9);
assert(t9.includes("#성구/히브리서/11/24"), "11장 24절 → 태그");

const t10 = addScriptureTags("마태복음 24장을 봅시다", docidMap);
console.log("\n  입력: 마태복음 24장을 봅시다");
console.log("  출력:", t10);
assert(t10.includes("#성구/마태복음/24"), "24장(절 없음) → 장 수준 태그");

// ═══════════════════════════════════════
// 7. 시편 편/절 형식
// ═══════════════════════════════════════
console.log("\n=== 7. 시편 편/절 형식 ===\n");

const t11 = addScriptureTags("시편 91편 11절을 보세요", docidMap);
console.log("  입력: 시편 91편 11절을 보세요");
console.log("  출력:", t11);
assert(t11.includes("#성구/시편/91/11"), "시편 91편 11절 → 태그");

const t12 = addScriptureTags("시편 83편을 보면", docidMap);
console.log("\n  입력: 시편 83편을 보면");
console.log("  출력:", t12);
assert(t12.includes("#성구/시편/83"), "시편 83편(절 없음) → 장 수준 태그");

// ═══════════════════════════════════════
// 8. 다중 성구
// ═══════════════════════════════════════
console.log("\n=== 8. 다중 성구 ===\n");

const t13 = addScriptureTags(
  "시편 83:18에서 하느님의 이름이 여호와라는 것을 알 수 있고 요한복음 17:3에서는 영원한 생명에 대해",
  docidMap
);
console.log("  입력: (다중 성구 포함 텍스트)");
console.log("  출력:", t13);
assert(t13.includes("#성구/시편/83/18"), "첫 번째 성구 태그");
assert(t13.includes("#성구/요한복음/17/3"), "두 번째 성구 태그");

// ═══════════════════════════════════════
// 9. 붙은 형태 (사무엘상, 열왕기하 등)
// ═══════════════════════════════════════
console.log("\n=== 9. 붙은 형태 ===\n");

const t14 = addScriptureTags("사무엘상 16:7은", docidMap);
console.log("  입력: 사무엘상 16:7은");
console.log("  출력:", t14);
assert(t14.includes("#성구/사무엘상/16/7"), "사무엘상 16:7 → 태그");

// ═══════════════════════════════════════
// 10. 오탐 방지 테스트
// ═══════════════════════════════════════
console.log("\n=== 10. 오탐 방지 ===\n");

const t15 = addScriptureTags("도시 83:18에서", docidMap);
console.log("  입력: 도시 83:18에서");
console.log("  출력:", t15);
assert(!t15.includes("#성구"), "도시 83:18 → 오탐 없음 (시 앞에 한글)");

const t16 = addScriptureTags("성구가 없는 평범한 자막 텍스트입니다.", docidMap);
assert(t16 === "성구가 없는 평범한 자막 텍스트입니다.", "성구 없는 텍스트 → 변경 없음");

// ═══════════════════════════════════════
// 11. 실제 자막 텍스트 테스트
// ═══════════════════════════════════════
console.log("\n=== 11. 실제 자막 샘플 ===\n");

const realSubtitle = `JW 방송에 오신 것을 환영합니다. 얼마 안 있어 제자들을 떠날 거라는 말씀을 하신 직후에 예수께서 남기신 말이죠. 예수께선 요한복음 14:1의 이러한 위로가 되는 말씀을 하십니다. "여러분은 마음에 근심하지 마십시오. 하느님께 믿음을 나타내고 나에게도 믿음을 나타내십시오." 이사야 41:10에서는 "두려워하지 마라. 내가 너와 함께하기 때문이다"라고 약속합니다. 시편 46:1에 따르면 하느님은 우리의 피난처이십니다.`;

const t17 = addScriptureTags(realSubtitle, docidMap);
console.log("  입력: (실제 자막 텍스트)");
console.log("  출력:\n");
console.log(t17);

const t17Tags = t17.match(/#성구\/[^\s]+/g) || [];
console.log(`\n  감지된 태그: ${t17Tags.length}개`);
for (const tag of t17Tags) console.log(`    ${tag}`);

assert(t17Tags.length >= 3, `3개 이상 성구 감지 (실제: ${t17Tags.length})`);

// ═══════════════════════════════════════
// 12. 장경계 범위 (cross-chapter)
// ═══════════════════════════════════════
console.log("\n=== 12. 장경계 범위 ===\n");

const t18 = addScriptureTags("이사야 9:1–10:15에 나오는 예언", docidMap);
console.log("  입력: 이사야 9:1–10:15에 나오는 예언");
console.log("  출력:", t18);
assert(t18.includes("#성구/이사야/9"), "장경계 → 9장 태그");
assert(t18.includes("#성구/이사야/10/1"), "장경계 → 10:1 태그");

// ═══════════════════════════════════════
// 결과 요약
// ═══════════════════════════════════════
console.log(`\n${"=".repeat(50)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) process.exit(1);
