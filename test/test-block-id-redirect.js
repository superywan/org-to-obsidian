/**
 * pc 리다이렉트 fragment 보존 테스트
 * 기존 캐시를 우회하여 새로 리다이렉트를 해결하고 fragment가 포함되는지 확인
 */
import axios from "axios";

const WOL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const testPcLinks = [
  "/ko/wol/pc/r8/lp-ko/1200272288/0/0",
  "/ko/wol/pc/r8/lp-ko/1200272288/0/2",
  "/ko/wol/pc/r8/lp-ko/1200272288/1/0",
];

console.log("pc 리다이렉트 fragment 보존 테스트\n");

for (const pcUrl of testPcLinks) {
  try {
    const fullUrl = `https://wol.jw.org${pcUrl}`;
    const resp = await axios.get(fullUrl, {
      headers: WOL_HEADERS,
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 15000,
    });

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.location || "(없음)";
      const docIdMatch = location.match(/\/wol\/d\/r8\/lp-ko\/(\d+)/);
      const fragMatch = location.match(/#h=(\d+)/);

      const cachedValue = fragMatch
        ? `${docIdMatch?.[1]}#${fragMatch[1]}`
        : docIdMatch?.[1] || "(매칭 실패)";

      console.log(`${pcUrl}`);
      console.log(`  → Location: ${location}`);
      console.log(`  → 캐시값: ${cachedValue}`);
      console.log(`  → wikilink fragment: ${fragMatch ? `#^p${fragMatch[1]}` : "(없음)"}`);
      console.log();
    } else {
      console.log(`${pcUrl} → 상태 ${resp.status} (리다이렉트 아님)`);
    }
  } catch (e) {
    console.error(`${pcUrl} → 오류: ${e.message}`);
  }
}
