/**
 * Obsidian 딥링크 테스트 준비
 * - 색인 기사(1204453)와 그 링크 대상 기사 1개를 새로 파싱
 * - 두 파일을 Vault에 복사하여 딥링크 동작을 확인
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseArticleContent, loadMap } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";
import { VAULT_BASE } from "../constant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const docidMap = loadMap();
console.log(`docid-map 항목 수: ${Object.keys(docidMap).length}\n`);

// ── 1. 색인 기사 (1204453) 파싱 ──
console.log("1. 색인 기사 (1204453) 파싱 중...");
const indexHtml = await getPublicationArticleAPI("1204453");
const indexContent = await parseArticleContent(indexHtml, docidMap);
console.log(`   블록 ID: ${(indexContent.match(/\^p\d+/g) || []).length}개`);

// 색인 기사의 vault 경로 확인
const indexVaultRelPath = docidMap["1204453"];
if (indexVaultRelPath) {
  const indexVaultPath = `${VAULT_BASE}${indexVaultRelPath}.md`;
  fs.mkdirSync(path.dirname(indexVaultPath), { recursive: true });
  fs.writeFileSync(indexVaultPath, indexContent);
  console.log(`   저장: ${indexVaultPath}`);
} else {
  console.log("   색인 기사가 docid-map에 없음 — test-output/에 저장");
  fs.writeFileSync(path.join(__dirname, "..", "test-output", "블록ID_색인_1204453.md"), indexContent);
}

// ── 2. 대상 기사 찾기 ──
// 색인에서 fragment 딥링크의 대상 docId 추출
const fragLinkTargets = [];
const fragLinkRegex = /\[\[([^#\]]+)#\^p(\d+)\|([^\]]+)\]\]/g;
let match;
while ((match = fragLinkRegex.exec(indexContent)) !== null) {
  const targetPath = match[1];
  const pid = match[2];
  const displayText = match[3];
  // 이미 추가된 경로는 건너뜀
  if (!fragLinkTargets.find(t => t.path === targetPath)) {
    fragLinkTargets.push({ path: targetPath, pid, displayText });
  }
}

console.log(`\n2. fragment 딥링크 대상 기사: ${fragLinkTargets.length}개`);
for (const t of fragLinkTargets) {
  console.log(`   ${t.path} → ^p${t.pid} (${t.displayText})`);
}

// ── 3. 대상 기사 중 처음 3개를 새로 파싱하여 Vault에 저장 ──
console.log(`\n3. 대상 기사 파싱 및 저장 (최대 3개)...\n`);

// docid-map에서 vault 경로 → docId 역매핑
const pathToDocId = {};
for (const [docId, vaultPath] of Object.entries(docidMap)) {
  if (!docId.startsWith("b:")) { // 성경 제외
    pathToDocId[vaultPath] = docId;
  }
}

let savedCount = 0;
for (const target of fragLinkTargets.slice(0, 3)) {
  const docId = pathToDocId[target.path];
  if (!docId) {
    console.log(`   [건너뜀] ${target.path} — docId를 찾을 수 없음`);
    continue;
  }

  console.log(`   [${docId}] ${target.path}`);
  try {
    const html = await getPublicationArticleAPI(docId);
    const content = await parseArticleContent(html, docidMap);
    const blockIds = content.match(/\^p\d+/g) || [];

    // 대상 pid가 실제로 존재하는지 확인
    const hasTargetPid = content.includes(`^p${target.pid}`);

    console.log(`     블록 ID: ${blockIds.length}개, ^p${target.pid} 존재: ${hasTargetPid ? "YES ✓" : "NO ✗"}`);

    // Vault에 저장
    const vaultPath = `${VAULT_BASE}${target.path}.md`;
    fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
    fs.writeFileSync(vaultPath, content);
    console.log(`     저장: ${vaultPath}`);
    savedCount++;
  } catch (e) {
    console.error(`     오류: ${e.message}`);
  }
}

console.log(`\n=== 완료 ===`);
console.log(`Vault에 ${savedCount + (indexVaultRelPath ? 1 : 0)}개 파일을 저장했습니다.`);
console.log(`\nObsidian에서 테스트:`);
console.log(`1. Obsidian으로 Vault를 열고 색인 기사를 찾으세요`);
console.log(`2. fragment 딥링크 (예: [[...#^p15|통찰 ...]]) 를 클릭하세요`);
console.log(`3. 대상 기사의 해당 단락으로 스크롤되는지 확인하세요`);
