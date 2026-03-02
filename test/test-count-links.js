import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const cache = JSON.parse(fs.readFileSync("redirect-cache.json", "utf-8"));
console.log("캐시 항목:", Object.keys(cache).length);

const urls = [
  ["소개", "https://wol.jw.org/ko/wol/bibledocument/r8/lp-ko/nwtsty/1/introduction"],
  ["개요", "https://wol.jw.org/ko/wol/bibledocument/r8/lp-ko/nwtsty/1/outline"],
  ["1장", "https://wol.jw.org/ko/wol/b/r8/lp-ko/nwtsty/1/1"],
];

for (const [label, url] of urls) {
  console.log(`\n${label} 가져오는 중...`);
  const resp = await axios.get(url, { headers, timeout: 30000 });
  const $ = cheerio.load(String(resp.data));

  let total = 0, uncached = 0;
  const uncachedHrefs = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("/wol/pc/") || href.includes("/wol/tc/")) {
      total++;
      if (!cache[href]) {
        uncached++;
        if (uncachedHrefs.length < 3) uncachedHrefs.push(href);
      }
    }
  });
  console.log(`  pc/tc 링크: ${total}개 (미캐시: ${uncached}개)`);
  if (uncachedHrefs.length > 0) {
    uncachedHrefs.forEach(h => console.log(`    예: ${h}`));
  }
}

const totalUncached = urls.reduce((acc, [l]) => acc, 0);
