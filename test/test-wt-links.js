import axios from "axios";
import * as cheerio from "cheerio";
const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const fetchLvLinks = async (url, label) => {
  const resp = await axios.get(url, { headers, timeout: 30000 });
  const $ = cheerio.load(resp.data);
  const seen = new Set();
  const links = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/\/wol\/lv\/r8\/lp-ko\/0\/(\d+)/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      const text = $(el).text().replace(/\s+/g, " ").trim();
      links.push({ id: match[1], text: text.substring(0, 60) });
    }
  });
  console.log(`\n=== ${label} (${url.split("/").pop()}) ===`);
  links.forEach(l => console.log(`  [${l.id}] ${l.text}`));
  return links;
};

// 2023 > 배부용
const links1 = await fetchLvLinks("https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/20706", "파수대 2023 > 배부용");

// 첫 번째 하위 링크 따라가기
if (links1.length > 0) {
  const firstSub = links1.find(l => l.id !== "20398" && l.id !== "20705");
  if (firstSub) {
    const sub = await fetchLvLinks(`https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/${firstSub.id}`, `> ${firstSub.text}`);
    // 그 다음도
    if (sub.length > 0) {
      const nextSub = sub.find(l => l.id !== "20398" && l.id !== "20705" && l.id !== firstSub.id);
      if (nextSub) {
        await fetchLvLinks(`https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/${nextSub.id}`, `>> ${nextSub.text}`);
      }
    }
  }
}

// 2025 페이지도 확인
const links2025 = await fetchLvLinks("https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/20438", "파수대 2025");
for (const l of links2025) {
  if (l.id !== "20398") {
    const sub = await fetchLvLinks(`https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/${l.id}`, `2025 > ${l.text}`);
    // 첫 하위만 한 단계 더
    const deeper = sub.find(s => s.id !== "20398" && s.id !== "20438" && s.id !== l.id);
    if (deeper) {
      await fetchLvLinks(`https://wol.jw.org/ko/wol/lv/r8/lp-ko/0/${deeper.id}`, `2025 >> ${deeper.text}`);
      break;
    }
  }
}
