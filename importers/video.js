import fs from "fs";

import { VAULT_ORG_VIDEOS_PATH } from "../constant.js";
import {
  getVideoCategoriesAPI,
  getVideoSubCategoriesAPI,
  getVideoSubtitleAPI,
  getVideoListAPI,
} from "../requests.js";
import { addScriptureTags, loadMap } from "../docid-map.js";

const getVideoCategories = async (config) => {
  const categories = await getVideoCategoriesAPI(config);
  return categories.map((category) => ({ key: category.key, name: category.name }));
};

const getVideoSubCategories = async (config, categoryKey) => {
  const subCategories = await getVideoSubCategoriesAPI(categoryKey, config);
  return subCategories.map((sub) => ({ key: sub.key, name: sub.name }));
};

const importToObsidian = async (
  config,
  listOfExistingFiles,
  category,
  subCategory,
  docidMap
) => {
  const videoList = await getVideoListAPI(subCategory.key, config);
  // console.log(
  //   `Found ${videoList.length} media from ${category}/${subCategory}`
  // );

  let successNumber = 0;
  let failedNumber = 0;
  let existingNumber = 0;

  for (let i = 0; i < videoList.length; i++) {
    const title = await videoList[i].title;
    const subtitles = await videoList[i].files[0].subtitles;

    let currentPath = `${VAULT_ORG_VIDEOS_PATH}${category.name}/${subCategory.name}`;
    let currentPathWithTitle = `${currentPath}/${title}.md`;

    if (!(currentPathWithTitle in listOfExistingFiles)) {
      fs.mkdir(currentPath, { recursive: true }, (err) => {
        if (err) {
          console.error(err);
        }
      });

      if (subtitles) {
        const vttURL = subtitles.url;
        const subtitle = await getVideoSubtitleAPI(vttURL);

        const noTimestamps = subtitle.replace(
          /^(WEBVTT|(\d{2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(\d{2}:)?\d{2}:\d{2}\.\d{3}.*)$/gm,
          ""
        );

        const cleanText = noTimestamps
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line)
          .join(" ");

        // const regex =
        //   /^(?!WEBVTT\b)(?!\s*\d{2}:\d{2}:\d{2}\.\d+\s*-->\s*\d{2}:\d{2}:\d{2}\.\d+)(?!\s*\d+\s*$)(?!\s*$)(.+)$/gm;
        // const cleanSubtitle = [...subtitle.matchAll(regex)]
        //   .map((m) => m[1].trim())
        //   .join(" ");

        const taggedText = addScriptureTags(cleanText, docidMap);

        fs.writeFile(currentPathWithTitle, taggedText, { flag: "wx" }, (err) => {
          if (err) return;
          console.log(`[NEW_FILE] ${currentPathWithTitle}`);
        });
        successNumber++;
      }
    } else {
      existingNumber++;
    }
  }
  console.log(
    `${category.name}/${subCategory.name}: Finished importing ${successNumber} out of ${videoList.length} (${existingNumber} already exists)`
  );
};

// 카테고리 트리 반환 (서버 API용)
export const getVideoCategoryTree = async (config) => {
  const categories = await getVideoCategories(config);
  const tree = [];
  for (const cat of categories) {
    const subs = await getVideoSubCategories(config, cat.key);
    tree.push({ ...cat, subcategories: subs });
  }
  return tree;
};

// selectedSubcategoryKeys: string[] | null (null = 전체)
export const importOrgVideos = async (config, listOfExistingFiles, selectedSubcategoryKeys = null) => {
  const docidMap = loadMap();
  const categories = await getVideoCategories(config);
  for (const category of categories) {
    const subCategories = await getVideoSubCategories(config, category.key);
    for (const subCategory of subCategories) {
      if (selectedSubcategoryKeys !== null && !selectedSubcategoryKeys.includes(subCategory.key)) continue;
      await importToObsidian(config, listOfExistingFiles, category, subCategory, docidMap);
    }
  }
};