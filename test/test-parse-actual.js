import { loadMap, parseArticleContent } from "../docid-map.js";
import { getPublicationArticleAPI } from "../requests.js";

const docidMap = loadMap();
const html = await getPublicationArticleAPI("1102021613");
const content = await parseArticleContent(html, docidMap);

// 링크가 안 걸렸던 참조들 확인
const checks = ["19:7", "30:8", "145:15", "19:9, 10", "12|"];
for (const check of checks) {
  const found = content.includes(`|${check}`) || content.includes(`${check}]]`);
  console.log(`"${check}" wikilink: ${found ? "OK" : "FAIL"}`);
}

// 전체 wikilink 수
const wikilinks = content.match(/\[\[/g) || [];
console.log(`\n총 wikilink: ${wikilinks.length}개`);

// 잠 10:15 근처 출력
const idx = content.indexOf("잠 10:15");
if (idx >= 0) {
  console.log(`\n잠 10:15 근처:\n${content.substring(idx - 5, idx + 120)}`);
}

// 시 37:25 근처 출력
const idx2 = content.indexOf("시 37:25");
if (idx2 >= 0) {
  console.log(`\n시 37:25 근처:\n${content.substring(idx2 - 5, idx2 + 120)}`);
}
