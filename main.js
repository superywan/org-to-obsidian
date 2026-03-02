import fs from "fs";
import path from "path";
import { getJWORGTokenAPI } from "./requests.js";
import { importOrgVideos } from "./importers/video.js";
import { importOrgBooks } from "./importers/books.js";
import { importOrgInsight } from "./importers/insight.js";
import {
  VAULT_ORG_VIDEOS_PATH,
  VAULT_ORG_BOOKS_PATH,
  VAULT_ORG_INSIGHT_PATH,
} from "./constant.js";

let listOfExistingFiles = {};

const getFilesInDirectorySync = async (dirPath) => {
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        getFilesInDirectorySync(fullPath);
      } else {
        listOfExistingFiles[fullPath] = true;
      }
    }
  } catch (error) {}
};

const getListOfExistingFiles = async () => {
  await getFilesInDirectorySync(VAULT_ORG_VIDEOS_PATH);
  await getFilesInDirectorySync(VAULT_ORG_BOOKS_PATH);
  await getFilesInDirectorySync(VAULT_ORG_INSIGHT_PATH);
};

const getJWORGToken = async () => {
  console.log("Getting Token from JW.ORG...");
  const token = await getJWORGTokenAPI();
  console.log("Got Token from JW.ORG!");
  const config = {
    headers: { Authorization: `Bearer ${token}` },
    Referer: "https://www.jw.org/",
  };
  console.log(config);
  return config;
};

const main = async () => {
  const config = await getJWORGToken();
  await getListOfExistingFiles();

  // IMPORTING VIDEO SUBTITLES
  await importOrgVideos(config, listOfExistingFiles);

  // IMPORTING BOOKS
  await importOrgBooks(listOfExistingFiles);

  // IMPORTING INSIGHT
  await importOrgInsight(listOfExistingFiles);
};

main();
