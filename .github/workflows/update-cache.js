// ============================================================
// WHY2YUE — UPDATE ANIME CACHE
// ============================================================
//
// AniList
//    ↓
// lấy 1.500 anime
//    ↓
// RELEASING
// NOT_YET_RELEASED
// FINISHED
//    ↓
// Cloudflare R2
//
// Mỗi anime:
//
// anime/21.json
// anime/16498.json
// anime/xxxxx.json
//
// ============================================================

"use strict";


const {

  S3Client,

  PutObjectCommand,

  ListObjectsV2Command,

  DeleteObjectsCommand

} = require("@aws-sdk/client-s3");


// ============================================================
// ENVIRONMENT
// ============================================================

const endpoint =
  process.env.R2_ENDPOINT;

const bucket =
  process.env.R2_BUCKET;

const accessKeyId =
  process.env.R2_ACCESS_KEY_ID;

const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY;


// ------------------------------------------------------------
// KIỂM TRA ENV
// ------------------------------------------------------------

if (!endpoint) {

  throw new Error(
    "Missing R2_ENDPOINT"
  );

}

if (!bucket) {

  throw new Error(
    "Missing R2_BUCKET"
  );

}

if (!accessKeyId) {

  throw new Error(
    "Missing R2_ACCESS_KEY_ID"
  );

}

if (!secretAccessKey) {

  throw new Error(
    "Missing R2_SECRET_ACCESS_KEY"
  );

}


// ============================================================
// R2 CLIENT
// ============================================================

const client =
  new S3Client({

    region: "auto",

    endpoint,

    credentials: {

      accessKeyId,

      secretAccessKey

    }

  });


// ============================================================
// SETTINGS
// ============================================================

// AniList cho phép tối đa 50 item/page.
const PER_PAGE = 50;


// Tổng anime muốn lưu.
const MAX_ANIME = 1500;


// Khoảng nghỉ giữa các request AniList.
// Giúp workflow nhẹ hơn và giảm nguy cơ request dồn.
const REQUEST_DELAY = 1000;


// Số lần retry khi AniList/R2 gặp lỗi.
const MAX_RETRIES = 3;


// Cache-Control cho file R2.
// Trình duyệt countdown vẫn thêm ?t=timestamp,
// nên có thể lấy bản mới.
const CACHE_CONTROL =
  "public, max-age=300";


// ============================================================
// ANILIST GRAPHQL
// ============================================================
//
// Không còn:
//
// status: RELEASING
//
// và cũng KHÔNG còn:
//
// nextAiringEpisode !== null
//
// Vì nếu lọc như cũ:
//
// FINISHED → bị loại
// NOT_YET_RELEASED → bị loại
// RELEASING không có lịch → bị loại
//
// ============================================================

const query = `

query (
  $page: Int,
  $perPage: Int
) {

  Page(
    page: $page
    perPage: $perPage
  ) {

    pageInfo {

      currentPage

      lastPage

      hasNextPage

    }


    media(

      type: ANIME

      status_in: [
        RELEASING,
        NOT_YET_RELEASED,
        FINISHED
      ]

      isAdult: false

      sort: [
        START_DATE_DESC,
        UPDATED_AT_DESC
      ]

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

}

`;


// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {

  return new Promise(

    resolve =>
      setTimeout(
        resolve,
        ms
      )

  );

}


// ============================================================
// FETCH ANILIST WITH RETRY
// ============================================================

async function fetchAniListPage(
  page
) {

  let lastError =
    null;


  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {

    try {

      console.log(
        `AniList page ${page} — attempt ${attempt}/${MAX_RETRIES}`
      );


      const response =
        await fetch(
          "https://graphql.anilist.co",
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

                query,

                variables: {

                  page,

                  perPage:
                    PER_PAGE

                }

              })

          }
        );


      if (!response.ok) {

        throw new Error(
          `AniList HTTP ${response.status}`
        );

      }


      const json =
        await response.json();


      if (json.errors) {

        throw new Error(
          JSON.stringify(
            json.errors
          )
        );

      }


      if (
        !json.data ||
        !json.data.Page
      ) {

        throw new Error(
          "AniList returned no Page data."
        );

      }


      return json.data.Page;


    }
    catch (error) {

      lastError =
        error;


      console.error(
        `AniList page ${page} failed:`,
        error.message
      );


      if (
        attempt <
        MAX_RETRIES
      ) {

        await sleep(
          attempt * 2000
        );

      }

    }

  }


  throw lastError;

}


// ============================================================
// GET ANIME
// ============================================================

async function getAnime() {

  const allAnime =
    [];


  let page =
    1;


  while (
    allAnime.length <
    MAX_ANIME
  ) {

    const pageData =
      await fetchAniListPage(
        page
      );


    const media =
      Array.isArray(
        pageData.media
      )

        ? pageData.media

        : [];


    console.log(
      `Page ${page}: ${media.length} anime`
    );


    allAnime.push(
      ...media
    );


    // --------------------------------------------------------
    // HẾT DỮ LIỆU
    // --------------------------------------------------------

    if (
      media.length === 0
    ) {

      break;

    }


    // --------------------------------------------------------
    // KHÔNG CÒN TRANG
    // --------------------------------------------------------

    if (
      !pageData.pageInfo ||
      !pageData.pageInfo.hasNextPage
    ) {

      break;

    }


    page++;


    await sleep(
      REQUEST_DELAY
    );

  }


  // ==========================================================
  // REMOVE DUPLICATES
  // ==========================================================

  const uniqueMap =
    new Map();


  for (
    const anime
    of allAnime
  ) {

    if (
      anime &&
      Number.isFinite(
        Number(anime.id)
      )
    ) {

      uniqueMap.set(
        Number(anime.id),
        anime
      );

    }

  }


  const uniqueAnime =
    Array.from(
      uniqueMap.values()
    );


  // ==========================================================
  // GIỚI HẠN 1.500
  // ==========================================================

  const result =
    uniqueAnime.slice(
      0,
      MAX_ANIME
    );


  console.log(
    `Total unique anime: ${uniqueAnime.length}`
  );


  console.log(
    `Anime selected: ${result.length}`
  );


  // ----------------------------------------------------------
  // THỐNG KÊ
  // ----------------------------------------------------------

  let releasing =
    0;

  let upcoming =
    0;

  let finished =
    0;


  for (
    const anime
    of result
  ) {

    if (
      anime.status ===
      "RELEASING"
    ) {

      releasing++;

    }
    else if (
      anime.status ===
      "NOT_YET_RELEASED"
    ) {

      upcoming++;

    }
    else if (
      anime.status ===
      "FINISHED"
    ) {

      finished++;

    }

  }


  console.log(
    `RELEASING: ${releasing}`
  );

  console.log(
    `NOT_YET_RELEASED: ${upcoming}`
  );

  console.log(
    `FINISHED: ${finished}`
  );


  return result;

  }


// ============================================================
// SAVE ANIME TO R2
// ============================================================

async function saveToR2(
  anime
) {

  const id =
    Number(anime.id);


  if (
    !Number.isFinite(id)
  ) {

    throw new Error(
      "Invalid anime ID"
    );

  }


  const body =
    JSON.stringify(
      anime,
      null,
      2
    );


  await client.send(

    new PutObjectCommand({

      Bucket:
        bucket,

      Key:
        `anime/${id}.json`,

      Body:
        body,

      ContentType:
        "application/json; charset=utf-8",

      CacheControl:
        CACHE_CONTROL

    })

  );

}


// ============================================================
// GET OLD R2 FILES
// ============================================================

async function getOldAnimeFiles() {

  const result =
    [];


  let continuationToken =
    undefined;


  do {

    const response =
      await client.send(

        new ListObjectsV2Command({

          Bucket:
            bucket,

          Prefix:
            "anime/",

          ContinuationToken:
            continuationToken

        })

      );


    if (
      Array.isArray(
        response.Contents
      )
    ) {

      for (
        const object
        of response.Contents
      ) {

        if (
          object.Key &&
          object.Key.endsWith(
            ".json"
          )
        ) {

          result.push(
            object.Key
          );

        }

      }

    }


    continuationToken =
      response.NextContinuationToken;


  }
  while (
    continuationToken
  );


  return result;

}


// ============================================================
// DELETE OLD FILES
// ============================================================

async function deleteOldFiles(
  animeList
) {

  const currentIds =
    new Set();


  for (
    const anime
    of animeList
  ) {

    if (
      anime &&
      anime.id !== undefined
    ) {

      currentIds.add(
        String(anime.id)
      );

    }

  }


  const oldFiles =
    await getOldAnimeFiles();


  const filesToDelete =
    oldFiles.filter(

      key => {

        const id =
          key
            .replace(
              "anime/",
              ""
            )
            .replace(
              ".json",
              ""
            );


        return !currentIds.has(
          id
        );

      }

    );


  if (
    filesToDelete.length === 0
  ) {

    console.log(
      "No old anime files to delete."
    );

    return;

  }


  console.log(
    `Old anime files to delete: ${filesToDelete.length}`
  );


  // R2 DeleteObjects tối đa 1000 object/request.
  for (
    let i = 0;
    i < filesToDelete.length;
    i += 1000
  ) {

    const batch =
      filesToDelete.slice(
        i,
        i + 1000
      );


    await client.send(

      new DeleteObjectsCommand({

        Bucket:
          bucket,

        Delete: {

          Objects:
            batch.map(

              key => ({

                Key:
                  key

              })

            ),

          Quiet:
            true

        }

      })

    );


    console.log(
      `Deleted ${batch.length} old files.`
    );

  }

}


// ============================================================
// UPDATE ALL R2 FILES
// ============================================================

async function updateR2(
  animeList
) {

  let success =
    0;

  let failed =
    0;


  for (
    const anime
    of animeList
  ) {

    try {

      console.log(
        `Updating anime ${anime.id}...`
      );


      await saveToR2(
        anime
      );


      success++;


      console.log(
        `Anime ${anime.id} OK`
      );


    }
    catch (error) {

      failed++;


      console.error(
        `Anime ${anime.id} FAILED:`,
        error.message
      );

    }


    // Không spam R2 quá nhanh.
    await sleep(
      100
    );

  }


  console.log(
    `R2 update complete: ${success} success, ${failed} failed`
  );


  return {
    success,
    failed
  };

}


// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log(
    ""
  );

  console.log(
    "=================================================="
  );

  console.log(
    "WHY2YUE — ANIME CACHE UPDATE START"
  );

  console.log(
    "=================================================="
  );


  console.log(
    `Target anime: ${MAX_ANIME}`
  );


  // ----------------------------------------------------------
  // 1. ANIList
  // ----------------------------------------------------------

  const animeList =
    await getAnime();


  if (
    animeList.length === 0
  ) {

    throw new Error(
      "AniList returned zero anime. R2 will NOT be deleted."
    );

  }


  // ----------------------------------------------------------
  // 2. R2
  // ----------------------------------------------------------

  const result =
    await updateR2(
      animeList
    );


  // ----------------------------------------------------------
  // 3. AN TOÀN
  // ----------------------------------------------------------
  //
  // Nếu toàn bộ update thất bại thì KHÔNG xóa cache cũ.
  //
  // Đây là phần rất quan trọng để hệ thống hoạt động lâu dài.
  //

  if (
    result.success === 0
  ) {

    throw new Error(
      "All R2 uploads failed. Old cache will NOT be deleted."
    );

  }


  // ----------------------------------------------------------
  // 4. DELETE OLD
  // ----------------------------------------------------------

  await deleteOldFiles(
    animeList
  );


  console.log(
    ""
  );

  console.log(
    "=================================================="
  );

  console.log(
    "WHY2YUE — ANIME CACHE UPDATE FINISHED"
  );

  console.log(
    "=================================================="
  );

}


// ============================================================
// ERROR HANDLER
// ============================================================

main()

  .catch(

    error => {

      console.error(
        ""
      );

      console.error(
        "=================================================="
      );

      console.error(
        "CACHE UPDATE FAILED"
      );

      console.error(
        "=================================================="
      );

      console.error(
        error
      );


      process.exit(
        1
      );

    }

  );
