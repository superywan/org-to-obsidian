/**
 * 실제 vault 자막 파일로 addScriptureTags() 테스트
 */
import fs from "fs";
import { addScriptureTags, loadMap } from "../docid-map.js";

const docidMap = loadMap();

const files = [
  "/Users/waneddyyi/Documents/Obisidian Vaults/Theocratic/library/org-videos/JW 방송/월간 프로그램/JW 방송—2026년 3월.md",
  "/Users/waneddyyi/Documents/Obisidian Vaults/Theocratic/library/org-videos/성경/성경의 책들/창세기 소개.md",
];

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log(f + " — 파일 없음");
    continue;
  }
  const text = fs.readFileSync(f, "utf-8");
  const result = addScriptureTags(text, docidMap);

  const tags = result.match(/#성구\/[^\s]+/g) || [];
  const links = result.match(/\[\[library\/org-bible\/[^\]]+\]\]/g) || [];

  console.log("=== " + f.split("/").pop() + " ===");
  console.log("원본 길이: " + text.length + "자");
  console.log("변환 후: " + result.length + "자");
  console.log("감지된 성구: " + tags.length + "개");
  console.log("생성된 wikilink: " + links.length + "개");
  if (tags.length > 0) {
    console.log("태그 샘플: " + tags.slice(0, 8).join(", "));
  }
  if (links.length > 0) {
    console.log("wikilink 샘플:");
    for (const l of links.slice(0, 5)) console.log("  " + l);
  }
  console.log("결과 처음 600자:\n" + result.substring(0, 600) + "...\n");
}
