// ============================================================
// WHY2YUE — UPDATE CACHE
// FULL REPLACEMENT
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  S3Client,
  PutObjectCommand
} = require("@aws-sdk/client-s3");

// ============================================================
// PATH
// ============================================================

const ROOT_DIR = __dirname;

const ID_FILE =
  path.join(ROOT_DIR, "anime-ids.json");

// ============================================================
// ENVIRONMENT
// ============================================================

const R2_ENDPOINT =
  process.env.R2_ENDPOINT;

const R2_BUCKET =
  process.env.R2_BUCKET;

const R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID;

const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY;

// ============================================================
// REQUIRED ENVIRONMENT
// ============================================================

function requireEnvironment(name, value) {

  if (
    !value ||
    !String(value).trim()
  ) {

    throw new Error(
      `Missing environment variable: ${name}`
    );

  }

}

requireEnvironment(
  "R2_ENDPOINT",
  R2_ENDPOINT
);

requireEnvironment(
  "R2_BUCKET",
  R2_BUCKET
);

requireEnvironment(
  "R2_ACCESS_KEY_ID",
  R2_ACCESS_KEY_ID
);

requireEnvironment(
  "R2_SECRET_ACCESS_KEY",
  R2_SECRET_ACCESS_KEY
);

// ============================================================
// R2 CLIENT
// ============================================================

const r2 =
  new S3Client({

    region: "auto",

    endpoint:
      R2_ENDPOINT,

    credentials: {

      accessKeyId:
        R2_ACCESS_KEY_ID,

      secretAccessKey:
        R2_SECRET_ACCESS_KEY

    }

  });

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  // General
  // ----------------------------------------------------------

  animeDelay:
    1500,

  // ----------------------------------------------------------
  // AniList
  // ----------------------------------------------------------

  aniListURL:
    "https://graphql.anilist.co",

  aniListTimeout:
    15000,

  aniListMaxRetries:
    3,

  // 429:
  // 30s → 60s → 120s
  aniList429BaseDelay:
    30000,

  aniList429MaxDelay:
    120000,

  // Other temporary HTTP errors:
  // 5s → 10s → 20s
  aniListRetryBaseDelay:
    5000,

  // ----------------------------------------------------------
  // R2
  // ----------------------------------------------------------

  r2MaxRetries:
    3,

  r2RetryDelay:
    2000,

  // ----------------------------------------------------------
  // Cache
  // ----------------------------------------------------------

  cacheControl:
    "public, max-age=300"

};

// ============================================================
// UPDATE MODE
// ============================================================
//
// GitHub Actions:
//
// push
//      → incremental
//
// schedule
//      → full
//
// workflow_dispatch
//      → full
//
// Có thể override bằng:
// UPDATE_MODE=incremental
// ============================================================

const EVENT_NAME =
  process.env.GITHUB_EVENT_NAME ||
  "";

let UPDATE_MODE =
  process.env.UPDATE_MODE ||
  "";

if (!UPDATE_MODE) {

  if (
    EVENT_NAME === "push"
  ) {

    UPDATE_MODE =
      "incremental";

  } else {

    UPDATE_MODE =
      "full";

  }

}

if (
  UPDATE_MODE !== "incremental" &&
  UPDATE_MODE !== "full"
) {

  UPDATE_MODE =
    "full";

}

// ============================================================
// ANILIST QUERY
// ============================================================

const ANILIST_QUERY = `

query GetAnime($id: Int) {

  Media(
    id: $id
    type: ANIME
    isAdult: false
  ) {

    id

    title {
      romaji
      english
      native
    }

    status

    episodes

    duration

    startDate {
      year
      month
      day
    }

    endDate {
      year
      month
      day
    }

    season

    seasonYear

    nextAiringEpisode {
      airingAt
      episode
    }

    updatedAt

  }

}

`;

// ============================================================
// SLEEP
// ============================================================

function sleep(milliseconds) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );

}

// ============================================================
// READ anime-ids.json
// ============================================================

function readAnimeList() {

  if (
    !fs.existsSync(ID_FILE)
  ) {

    throw new Error(
      "anime-ids.json was not found."
    );

  }

  const raw =
    fs.readFileSync(
      ID_FILE,
      "utf8"
    );

  let parsed;

  try {

    parsed =
      JSON.parse(raw);

  } catch {

    throw new Error(
      "anime-ids.json contains invalid JSON."
    );

  }

  if (
    !Array.isArray(parsed)
  ) {

    throw new Error(
      "anime-ids.json must contain an array."
    );

  }

  return parsed;

}

// ============================================================
// NORMALIZE ID ENTRY
// ============================================================

function normalizeIdEntry(entry) {

  if (
    !entry ||
    typeof entry !== "object"
  ) {

    return null;

  }

  const id =
    Number(entry.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {

    return null;

  }

  const name =
    typeof entry.name === "string"
      ? entry.name.trim()
      : "";

  return {
    id,
    name
  };

}

// ============================================================
// NORMALIZE LIST
// ============================================================

function normalizeAnimeList(list) {

  const map =
    new Map();

  for (
    const entry of list
  ) {

    const normalized =
      normalizeIdEntry(entry);

    if (!normalized) {

      console.warn(
        "Skipping invalid anime entry:",
        entry
      );

      continue;

    }

    map.set(
      normalized.id,
      normalized
    );

  }

  return Array.from(
    map.values()
  );

}

// ============================================================
// GET BEST NAME
// ============================================================

function getBestName(anime) {

  if (
    !anime ||
    !anime.title
  ) {

    return "";

  }

  return (
    anime.title.english ||
    anime.title.romaji ||
    anime.title.native ||
    ""
  ).trim();

}

// ============================================================
// CREATE TIMEOUT
// ============================================================

function createTimeoutSignal(
  milliseconds
) {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      milliseconds
    );

  return {
    signal:
      controller.signal,
    clear:
      () => clearTimeout(timer)
  };

}

// ============================================================
// ANILIST ERROR
// ============================================================

function createHttpError(
  status,
  message,
  retryAfter
) {

  const error =
    new Error(message);

  error.httpStatus =
    status;

  if (
    retryAfter !== undefined
  ) {

    error.retryAfter =
      retryAfter;

  }

  return error;

}

// ============================================================
// RETRY DELAY
// ============================================================

function getRetryAfterMilliseconds(
  error,
  attempt
) {

  // ----------------------------------------------------------
  // AniList 429
  // ----------------------------------------------------------

  if (
    error.httpStatus === 429
  ) {

    if (
      Number.isFinite(
        Number(error.retryAfter)
      )
    ) {

      const seconds =
        Number(error.retryAfter);

      return Math.min(
        Math.max(
          seconds * 1000,
          CONFIG.aniList429BaseDelay
        ),
        CONFIG.aniList429MaxDelay
      );

    }

    return Math.min(
      CONFIG.aniList429BaseDelay *
      Math.pow(2, attempt - 1),
      CONFIG.aniList429MaxDelay
    );

  }

  // ----------------------------------------------------------
  // Other temporary errors
  // ----------------------------------------------------------

  return (
    CONFIG.aniListRetryBaseDelay *
    Math.pow(2, attempt - 1)
  );

}

// ============================================================
// FETCH ONE ANIME
// ============================================================

async function fetchAnime(id) {

  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <= CONFIG.aniListMaxRetries;
    attempt++
  ) {

    let timeout =
      null;

    try {

      console.log(
        `AniList ID ${id} — attempt ${attempt}/${CONFIG.aniListMaxRetries}`
      );

      timeout =
        createTimeoutSignal(
          CONFIG.aniListTimeout
        );

      const response =
        await fetch(
          CONFIG.aniListURL,
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              "Accept":
                "application/json"

            },

            body:
              JSON.stringify({

                query:
                  ANILIST_QUERY,

                variables: {
                  id
                }

              }),

            signal:
              timeout.signal

          }
        );

      if (!response.ok) {

        let retryAfter;

        const retryHeader =
          response.headers.get(
            "retry-after"
          );

        if (retryHeader) {

          const numeric =
            Number(retryHeader);

          if (
            Number.isFinite(numeric)
          ) {

            retryAfter =
              numeric;

          }

        }

        const status =
          response.status;

        const temporary =
          status === 429 ||
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504;

        const error =
          createHttpError(
            status,
            `AniList HTTP ${status}`,
            retryAfter
          );

        if (
          !temporary ||
          attempt >=
            CONFIG.aniListMaxRetries
        ) {

          throw error;

        }

        lastError =
          error;

        const delay =
          getRetryAfterMilliseconds(
            error,
            attempt
          );

        console.warn(
          `AniList ID ${id} — HTTP ${status}. Waiting ${Math.ceil(delay / 1000)}s before retry.`
        );

        await sleep(delay);

        continue;

      }

      const json =
        await response.json();

      if (
        Array.isArray(json.errors) &&
        json.errors.length > 0
      ) {

        const message =
          json.errors
            .map(
              error =>
                error.message
            )
            .join("; ");

        throw new Error(
          `AniList GraphQL error: ${message}`
        );

      }

      if (
        !json.data
      ) {

        throw new Error(
          "AniList returned no data."
        );

      }

      if (
        !json.data.Media
      ) {

        return null;

      }

      return json.data.Media;

    } catch (error) {

      lastError =
        error;

      // ------------------------------------------------------
      // Timeout / network error
      // ------------------------------------------------------

      const isAbort =
        error &&
        error.name ===
          "AbortError";

      const isNetwork =
        !error.httpStatus;

      if (
        attempt >=
        CONFIG.aniListMaxRetries
      ) {

        throw error;

      }

      if (
        error.httpStatus &&
        ![
          429,
          500,
          502,
          503,
          504
        ].includes(
          error.httpStatus
        )
      ) {

        throw error;

      }

      let delay;

      if (
        isAbort ||
        isNetwork
      ) {

        delay =
          CONFIG.aniListRetryBaseDelay *
          Math.pow(
            2,
            attempt - 1
          );

      } else {

        delay =
          getRetryAfterMilliseconds(
            error,
            attempt
          );

      }

      console.warn(
        `AniList ID ${id} — ${isAbort ? "timeout" : error.message}. Waiting ${Math.ceil(delay / 1000)}s before retry.`
      );

      await sleep(delay);

    } finally {

      if (timeout) {

        timeout.clear();

      }

    }

  }

  throw lastError ||
    new Error(
      `AniList ID ${id} failed.`
    );

      }

// ============================================================
// NORMALIZE ANIME DATA
// ============================================================

function normalizeAnime(anime) {

  if (
    !anime ||
    typeof anime !== "object"
  ) {

    return null;

  }

  const id =
    Number(anime.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {

    return null;

  }

  const title =
    anime.title &&
    typeof anime.title === "object"

      ? {

          romaji:
            anime.title.romaji ||
            null,

          english:
            anime.title.english ||
            null,

          native:
            anime.title.native ||
            null

        }

      : {

          romaji:
            null,

          english:
            null,

          native:
            null

        };

  const startDate =
    anime.startDate &&
    typeof anime.startDate === "object"

      ? {

          year:
            anime.startDate.year ??
            null,

          month:
            anime.startDate.month ??
            null,

          day:
            anime.startDate.day ??
            null

        }

      : null;

  const endDate =
    anime.endDate &&
    typeof anime.endDate === "object"

      ? {

          year:
            anime.endDate.year ??
            null,

          month:
            anime.endDate.month ??
            null,

          day:
            anime.endDate.day ??
            null

        }

      : null;

  const nextAiringEpisode =
    anime.nextAiringEpisode &&
    typeof anime.nextAiringEpisode === "object"

      ? {

          airingAt:
            anime.nextAiringEpisode.airingAt ??
            null,

          episode:
            anime.nextAiringEpisode.episode ??
            null

        }

      : null;

  return {

    id,

    title,

    status:
      anime.status ||
      null,

    episodes:
      anime.episodes ??
      null,

    duration:
      anime.duration ??
      null,

    startDate,

    endDate,

    season:
      anime.season ||
      null,

    seasonYear:
      anime.seasonYear ??
      null,

    nextAiringEpisode,

    updatedAt:
      anime.updatedAt ??
      null

  };

}

// ============================================================
// VALIDATE ANIME DATA
// ============================================================

function isValidAnime(anime, expectedId) {

  if (
    !anime ||
    typeof anime !== "object"
  ) {

    return false;

  }

  if (
    Number(anime.id) !==
    Number(expectedId)
  ) {

    return false;

  }

  if (
    !anime.title ||
    typeof anime.title !== "object"
  ) {

    return false;

  }

  const hasName =
    Boolean(
      anime.title.romaji ||
      anime.title.english ||
      anime.title.native
    );

  if (!hasName) {

    return false;

  }

  return true;

}

// ============================================================
// CREATE R2 BODY
// ============================================================

function createR2Body(anime) {

  return JSON.stringify(
    anime,
    null,
    2
  );

}

// ============================================================
// R2 RETRY DELAY
// ============================================================

function getR2RetryDelay(attempt) {

  return (
    CONFIG.r2RetryDelay *
    Math.pow(
      2,
      attempt - 1
    )
  );

}

// ============================================================
// SAVE ANIME TO R2
// ============================================================
//
// Important:
//
// Chỉ gọi hàm này sau khi dữ liệu AniList đã được validate.
//
// Nếu upload thất bại:
// - retry
// - không xóa file cũ
// - không ghi dữ liệu rỗng
//
// ============================================================

async function saveAnimeToR2(
  anime
) {

  const id =
    Number(anime.id);

  const key =
    `anime/${id}.json`;

  const body =
    createR2Body(anime);

  if (
    !body ||
    body.length < 20
  ) {

    throw new Error(
      `Refusing to upload invalid data for anime ${id}.`
    );

  }

  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <= CONFIG.r2MaxRetries;
    attempt++
  ) {

    try {

      console.log(
        `R2 ${key} — upload attempt ${attempt}/${CONFIG.r2MaxRetries}`
      );

      await r2.send(

        new PutObjectCommand({

          Bucket:
            R2_BUCKET,

          Key:
            key,

          Body:
            body,

          ContentType:
            "application/json; charset=utf-8",

          CacheControl:
            CONFIG.cacheControl

        })

      );

      console.log(
        `R2 ${key} — uploaded successfully.`
      );

      return true;

    } catch (error) {

      lastError =
        error;

      if (
        attempt >=
        CONFIG.r2MaxRetries
      ) {

        break;

      }

      const delay =
        getR2RetryDelay(
          attempt
        );

      console.warn(
        `R2 ${key} — upload failed: ${error.message}`
      );

      console.warn(
        `R2 ${key} — retrying in ${Math.ceil(delay / 1000)}s...`
      );

      await sleep(delay);

    }

  }

  throw (
    lastError ||
    new Error(
      `R2 upload failed for ${key}.`
    )
  );

}

// ============================================================
// READ PREVIOUS anime-ids.json FROM GIT
// ============================================================
//
// Dùng khi workflow chạy bằng PUSH.
//
// Ví dụ:
//
// commit trước:
//
// [
//   { "id": 21 },
//   { "id": 20 }
// ]
//
// commit mới:
//
// [
//   { "id": 21 },
//   { "id": 20 },
//   { "id": 196017 }
// ]
//
// → chỉ xử lý:
//
// 196017
//
// ============================================================

function getPreviousAnimeList() {

  const before =
    process.env.GITHUB_EVENT_BEFORE;

  const sha =
    process.env.GITHUB_SHA;

  if (
    !before ||
    !sha
  ) {

    return null;

  }

  // ----------------------------------------------------------
  // Initial commit
  // ----------------------------------------------------------

  if (
    /^0+$/.test(before)
  ) {

    return null;

  }

  try {

    const previousRaw =
      execFileSync(
        "git",
        [
          "show",
          `${before}:anime-ids.json`
        ],
        {
          encoding:
            "utf8"
        }
      );

    const parsed =
      JSON.parse(
        previousRaw
      );

    if (
      !Array.isArray(parsed)
    ) {

      return null;

    }

    return normalizeAnimeList(
      parsed
    );

  } catch (error) {

    console.warn(
      "Could not read previous anime-ids.json from Git."
    );

    console.warn(
      error.message
    );

    return null;

  }

}

// ============================================================
// FIND NEW ANIME IDS
// ============================================================

function getNewAnimeList(
  currentList
) {

  const previousList =
    getPreviousAnimeList();

  // ----------------------------------------------------------
  // Không có lịch sử để so sánh
  //
  // Trường hợp:
  // - initial commit
  // - git history không đủ
  // - không có GITHUB_EVENT_BEFORE
  //
  // → xử lý toàn bộ danh sách.
  // ----------------------------------------------------------

  if (
    previousList === null
  ) {

    console.log(
      "Previous anime list unavailable. Processing current list."
    );

    return currentList;

  }

  const previousIds =
    new Set(
      previousList.map(
        anime =>
          Number(anime.id)
      )
    );

  const newAnime =
    currentList.filter(
      anime =>
        !previousIds.has(
          Number(anime.id)
        )
    );

  return newAnime;

}

// ============================================================
// UPDATE LOCAL ANIME NAMES
// ============================================================
//
// Nếu anime-ids.json có:
//
// {
//   "id": 196017,
//   "name": "Anime 196017"
// }
//
// Sau khi AniList trả về:
//
// "ONE PIECE..."
//
// thì thay name bằng tên thật.
//
// ============================================================

function updateLocalAnimeNames(
  animeList,
  results
) {

  let changed =
    false;

  const resultMap =
    new Map();

  for (
    const result of results
  ) {

    if (
      !result ||
      !result.anime
    ) {

      continue;

    }

    const anime =
      result.anime;

    const id =
      Number(anime.id);

    const bestName =
      getBestName(anime);

    if (
      !bestName
    ) {

      continue;

    }

    resultMap.set(
      id,
      bestName
    );

  }

  const updatedList =
    animeList.map(
      entry => {

        const id =
          Number(entry.id);

        const newName =
          resultMap.get(id);

        if (
          !newName
        ) {

          return entry;

        }

        const oldName =
          typeof entry.name === "string"
            ? entry.name.trim()
            : "";

        if (
          oldName === newName
        ) {

          return entry;

        }

        changed =
          true;

        console.log(
          `Anime ${id}: "${oldName}" → "${newName}"`
        );

        return {

          ...entry,

          name:
            newName

        };

      }
    );

  if (
    changed
  ) {

    fs.writeFileSync(

      ID_FILE,

      JSON.stringify(
        updatedList,
        null,
        2
      ) + "\n",

      "utf8"

    );

    console.log(
      "anime-ids.json updated."
    );

  }

  return changed;

}

// ============================================================
// PROCESS ONE ANIME
// ============================================================
//
// Quan trọng:
//
// Hàm này KHÔNG throw ra ngoài sau khi xử lý lỗi.
//
// Nó trả về:
//
// {
//   success: true/false,
//   id,
//   anime,
//   error
// }
//
// Vì vậy một anime lỗi sẽ không làm chết cả batch.
//
// ============================================================

async function processAnime(
  entry
) {

  const id =
    Number(entry.id);

  console.log("");
  console.log(
    "============================================================"
  );

  console.log(
    `Processing anime ID: ${id}`
  );

  console.log(
    "============================================================"
  );

  try {

    // --------------------------------------------------------
    // 1. Fetch AniList
    // --------------------------------------------------------

    const rawAnime =
      await fetchAnime(id);

    // --------------------------------------------------------
    // 2. AniList không tìm thấy
    // --------------------------------------------------------

    if (
      rawAnime === null
    ) {

      throw new Error(
        `AniList anime ${id} was not found.`
      );

    }

    // --------------------------------------------------------
    // 3. Normalize
    // --------------------------------------------------------

    const anime =
      normalizeAnime(
        rawAnime
      );

    // --------------------------------------------------------
    // 4. Validate
    // --------------------------------------------------------

    if (
      !isValidAnime(
        anime,
        id
      )
    ) {

      throw new Error(
        `Invalid AniList data for anime ${id}.`
      );

    }

    // --------------------------------------------------------
    // 5. Save R2
    // --------------------------------------------------------

    await saveAnimeToR2(
      anime
    );

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    console.log(
      `Anime ${id} completed successfully.`
    );

    return {

      success:
        true,

      id,

      anime,

      error:
        null

    };

  } catch (error) {

    // --------------------------------------------------------
    // FAILURE
    // --------------------------------------------------------

    console.error(
      `Anime ${id} failed: ${error.message}`
    );

    return {

      success:
        false,

      id,

      anime:
        null,

      error:
        error.message

    };

  }

        }

// ============================================================
// PROCESS ANIME LIST
// ============================================================

async function processAnimeList(
  animeList
) {

  const results = [];

  const total =
    animeList.length;

  console.log("");
  console.log(
    "============================================================"
  );

  console.log(
    `Starting anime processing`
  );

  console.log(
    `Mode: ${UPDATE_MODE}`
  );

  console.log(
    `Total anime to process: ${total}`
  );

  console.log(
    "============================================================"
  );

  // ----------------------------------------------------------
  // Không có anime cần xử lý
  // ----------------------------------------------------------

  if (
    total === 0
  ) {

    console.log(
      "No anime needs processing."
    );

    return results;

  }

  // ----------------------------------------------------------
  // Sequential processing
  // ----------------------------------------------------------
  //
  // Cố ý KHÔNG dùng Promise.all().
  //
  // Mục đích:
  // - giảm áp lực AniList
  // - tránh 429
  // - dễ kiểm soát
  // - một anime lỗi không ảnh hưởng anime tiếp theo
  //
  // ----------------------------------------------------------

  for (
    let index = 0;
    index < total;
    index++
  ) {

    const entry =
      animeList[index];

    console.log("");

    console.log(
      `[${index + 1}/${total}] Anime ID ${entry.id}`
    );

    const result =
      await processAnime(
        entry
      );

    results.push(
      result
    );

    // --------------------------------------------------------
    // Delay giữa các anime
    //
    // Không delay sau anime cuối cùng.
    // --------------------------------------------------------

    if (
      index <
      total - 1
    ) {

      console.log(
        `Waiting ${CONFIG.animeDelay / 1000}s before next anime...`
      );

      await sleep(
        CONFIG.animeDelay
      );

    }

  }

  return results;

}

// ============================================================
// PRINT ANIME RESULT
// ============================================================

function printAnimeResult(
  result
) {

  if (
    result.success
  ) {

    const anime =
      result.anime;

    const title =
      getBestName(
        anime
      ) ||
      `ID ${result.id}`;

    console.log(
      `✓ ${result.id} — ${title}`
    );

    return;

  }

  console.log(
    `✗ ${result.id} — ${result.error || "Unknown error"}`
  );

}

// ============================================================
// PRINT SUMMARY
// ============================================================

function printSummary(
  results
) {

  const total =
    results.length;

  const success =
    results.filter(
      result =>
        result.success
    );

  const failed =
    results.filter(
      result =>
        !result.success
    );

  console.log("");
  console.log("");
  console.log(
    "============================================================"
  );

  console.log(
    "WHY2YUE — ANIME CACHE SUMMARY"
  );

  console.log(
    "============================================================"
  );

  console.log(
    `Mode:     ${UPDATE_MODE}`
  );

  console.log(
    `Total:    ${total}`
  );

  console.log(
    `Success:  ${success.length}`
  );

  console.log(
    `Failed:   ${failed.length}`
  );

  console.log(
    "============================================================"
  );

  // ----------------------------------------------------------
  // Successful anime
  // ----------------------------------------------------------

  if (
    success.length > 0
  ) {

    console.log("");
    console.log(
      "Successful:"
    );

    for (
      const result of success
    ) {

      printAnimeResult(
        result
      );

    }

  }

  // ----------------------------------------------------------
  // Failed anime
  // ----------------------------------------------------------

  if (
    failed.length > 0
  ) {

    console.log("");
    console.log(
      "Failed:"
    );

    for (
      const result of failed
    ) {

      printAnimeResult(
        result
      );

    }

    console.log("");
    console.log(
      "Failed IDs:"
    );

    console.log(
      failed
        .map(
          result =>
            result.id
        )
        .join(", ")
    );

  }

  console.log("");
  console.log(
    "============================================================"
  );

  // ----------------------------------------------------------
  // Cache safety reminder
  // ----------------------------------------------------------

  if (
    failed.length > 0
  ) {

    console.log(
      "IMPORTANT: Failed anime cache files were NOT deleted."
    );

    console.log(
      "Existing valid R2 cache remains untouched for failed anime."
    );

  }

  console.log(
    "============================================================"
  );

}

// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log("");
  console.log(
    "############################################################"
  );

  console.log(
    "# WHY2YUE — ANIME CACHE UPDATE"
  );

  console.log(
    "############################################################"
  );

  console.log(
    `Update mode: ${UPDATE_MODE}`
  );

  console.log(
    `GitHub event: ${EVENT_NAME || "unknown"}`
  );

  console.log(
    `Anime delay: ${CONFIG.animeDelay}ms`
  );

  console.log(
    `AniList timeout: ${CONFIG.aniListTimeout}ms`
  );

  console.log(
    "############################################################"
  );

  // ==========================================================
  // 1. Read current anime list
  // ==========================================================

  const originalList =
    readAnimeList();

  console.log("");
  console.log(
    `anime-ids.json entries: ${originalList.length}`
  );

  // ==========================================================
  // 2. Normalize current list
  // ==========================================================

  const currentList =
    normalizeAnimeList(
      originalList
    );

  console.log(
    `Valid anime entries: ${currentList.length}`
  );

  // ==========================================================
  // 3. Determine processing list
  // ==========================================================

  let animeToProcess;

  if (
    UPDATE_MODE ===
    "incremental"
  ) {

    animeToProcess =
      getNewAnimeList(
        currentList
      );

    console.log("");
    console.log(
      `New anime IDs detected: ${animeToProcess.length}`
    );

  } else {

    animeToProcess =
      currentList;

    console.log("");
    console.log(
      `Full update selected: ${animeToProcess.length} anime`
    );

  }

  // ==========================================================
  // 4. Incremental mode with no new anime
  // ==========================================================

  if (
    animeToProcess.length === 0
  ) {

    console.log("");
    console.log(
      "No new anime IDs detected."
    );

    console.log(
      "Nothing needs to be uploaded to R2."
    );

    console.log("");
    console.log(
      "Cache update finished successfully."
    );

    return;

  }

  // ==========================================================
  // 5. Process anime
  // ==========================================================

  const results =
    await processAnimeList(
      animeToProcess
    );

  // ==========================================================
  // 6. Update local names
  // ==========================================================
  //
  // Chỉ anime lấy dữ liệu thành công mới được đổi tên.
  //
  // Anime lỗi:
  // - giữ nguyên name cũ
  // - không bị thay bằng undefined
  // - không bị thay bằng null
  //
  // ==========================================================

  updateLocalAnimeNames(
    currentList,
    results
  );

  // ==========================================================
  // 7. Print result summary
  // ==========================================================

  printSummary(
    results
  );

  // ==========================================================
  // 8. Determine final workflow status
  // ==========================================================

  const successCount =
    results.filter(
      result =>
        result.success
    ).length;

  const failedCount =
    results.filter(
      result =>
        !result.success
    ).length;

  // ----------------------------------------------------------
  // Tất cả thất bại
  // ----------------------------------------------------------
  //
  // Đây là lỗi nghiêm trọng.
  //
  // Workflow phải fail để GitHub Actions báo đỏ.
  //
  // Tuy nhiên R2 cũ vẫn được giữ nguyên vì processAnime()
  // không xóa cache trước đó.
  //
  // ----------------------------------------------------------

  if (
    results.length > 0 &&
    successCount === 0
  ) {

    throw new Error(
      "All anime updates failed. Existing R2 cache was preserved."
    );

  }

  // ----------------------------------------------------------
  // Có một phần thành công
  // ----------------------------------------------------------
  //
  // Workflow vẫn thành công.
  //
  // Các anime thành công đã được cập nhật.
  // Các anime thất bại vẫn giữ cache cũ.
  //
  // ----------------------------------------------------------

  if (
    failedCount > 0
  ) {

    console.warn("");

    console.warn(
      `${failedCount} anime failed, but ${successCount} anime succeeded.`
    );

    console.warn(
      "The failed anime cache files were preserved."
    );

  }

  console.log("");
  console.log(
    "############################################################"
  );

  console.log(
    "# CACHE UPDATE FINISHED"
  );

  console.log(
    "############################################################"
  );

}

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

process.on(
  "unhandledRejection",
  error => {

    console.error("");
    console.error(
      "Unhandled promise rejection:"
    );

    console.error(
      error
    );

    process.exitCode =
      1;

  }
);

// ============================================================
// RUN
// ============================================================

main()
  .catch(
    error => {

      console.error("");
      console.error(
        "============================================================"
      );

      console.error(
        "FATAL ERROR"
      );

      console.error(
        "============================================================"
      );

      console.error(
        error.message
      );

      console.error(
        "============================================================"
      );

      process.exitCode =
        1;

    }
  );
