import axios from "axios";

const language = "KO";

const WOL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

export const getJWORGTokenAPI = async () => {
  const value = await axios.get(`https://b.jw-cdn.org/tokens/jworg.jwt`);
  return value.data;
};

export const getVideoCategoriesAPI = async (config) => {
  const value = await axios.get(
    `https://b.jw-cdn.org/apis/mediator/v1/categories/${language}/VideoOnDemand?detailed=1&mediaLimit=0&clientType=www`,
    config
  );
  return value.data.category.subcategories;
};

export const getVideoSubCategoriesAPI = async (category, config) => {
  const value = await axios.get(
    `https://b.jw-cdn.org/apis/mediator/v1/categories/${language}/${category}?detailed=1&mediaLimit=0&clientType=www`,
    config
  );
  return value.data.category.subcategories;
};

export const getVideoListAPI = async (subCategory, config) => {
  const value = await axios.get(
    `https://b.jw-cdn.org/apis/mediator/v1/categories/${language}/${subCategory}?detailed=1&clientType=www`,
    config
  );

  return value.data.category.media;
};

export const getVideoSubtitleAPI = async (videoVttAddress) => {
  const value = await axios.get(videoVttAddress);
  return value.data;
};

export const getLvPageAPI = async (url) => {
  const value = await axios.get(url, { headers: WOL_HEADERS, timeout: 30000 });
  return value.data;
};

export const getPublicationTOCAPI = async (abbrev) => {
  const value = await axios.get(
    `https://wol.jw.org/ko/wol/publication/r8/lp-ko/${abbrev}`,
    { headers: WOL_HEADERS, timeout: 30000 }
  );
  return value.data;
};

export const getPublicationArticleAPI = async (docId) => {
  const value = await axios.get(
    `https://wol.jw.org/ko/wol/d/r8/lp-ko/${docId}`,
    { headers: WOL_HEADERS, timeout: 30000 }
  );
  return value.data;
};

// 307 리다이렉트 또는 200 페이지에서 대상 URL 반환
export const getRedirectTargetAPI = async (url) => {
  const resp = await axios.get(url, {
    headers: WOL_HEADERS,
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 15000,
  });
  // 307 등 리다이렉트
  if (resp.status >= 300 && resp.status < 400) {
    return resp.headers.location || null;
  }
  // 200: 일부 pc 링크는 리다이렉트 없이 본문에 docId 링크 포함
  if (resp.status === 200 && typeof resp.data === "string") {
    const match = resp.data.match(/\/wol\/d\/r8\/lp-ko\/(\d+)(?:#([^"'\s<>]*))?/);
    if (match) {
      const frag = match[2] ? `#${match[2]}` : "";
      return `/ko/wol/d/r8/lp-ko/${match[1]}${frag}`;
    }
  }
  return null;
};
