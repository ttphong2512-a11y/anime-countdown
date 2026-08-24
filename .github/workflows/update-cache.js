// ============================================================
// WHY2YUE — UPDATE CACHE
// update-cache.js
// PART 1/2
//
// Mục đích:
//   anime-ids.json
//        ↓
//   AniList GraphQL
//        ↓
//   chỉ lấy đúng các AniList ID cần thiết
//        ↓
//   chuẩn hóa dữ liệu
//        ↓
//   chuẩn bị ghi Cloudflare R2
//
// KHÔNG quét 1.500 anime.
// KHÔNG phân trang AniList.
// KHÔNG xóa cache anime khác.
// ============================================================

"use strict";


// ============================================================
// IMPORT
// ============================================================

const fs = require("fs");
const path = require("path");

const {
  S3Client,
  PutObjectCommand
} = require("@aws-sdk/client-s3");


// ============================================================
// PATH
// ============================================================

const ROOT_DIR =
  __dirname;

const ID_FILE =
  path.join(
    ROOT_DIR,
    "anime-ids.json"
  );


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
// KIỂM TRA R2 ENVIRONMENT
// ============================================================

function requireEnvironment(
  name,
  value
){

  if(
    !value ||
    !String(value).trim()
  ){

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

    region:
      "auto",

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

  /*
   * Số lần thử lại khi AniList hoặc R2
   * gặp lỗi tạm thời.
   */

  maxRetries:
    3,


  /*
   * Thời gian chờ giữa các lần thử.
   */

  retryDelay:
    2000,


  /*
   * Nghỉ giữa các ID.
   *
   * Không cần nghỉ quá lâu vì chúng ta
   * chỉ lấy đúng những anime cần thiết.
   */

  animeDelay:
    500,


  /*
   * AniList GraphQL endpoint.
   */

  aniListURL:
    "https://graphql.anilist.co",


  /*
   * Cache-Control của file JSON trên R2.
   *
   * Countdown.js vẫn dùng cache-busting
   * nên khi R2 có dữ liệu mới nó sẽ lấy
   * được bản mới.
   */

  cacheControl:
    "public, max-age=300"


};


// ============================================================
// ANILIST QUERY
// ============================================================
//
// QUAN TRỌNG:
//
// Không lấy danh sách anime.
//
// Chỉ:
//
// id → Media(id: ID)
//
// Vì vậy:
//
// 21
// ↓
// AniList Media(id: 21)
//
// 196017
// ↓
// AniList Media(id: 196017)
//
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

function sleep(
  milliseconds
){

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );

}


// ============================================================
// RETRY HELPER
// ============================================================

async function withRetry(
  label,
  callback
){

  let lastError =
    null;


  for(
    let attempt = 1;
    attempt <= CONFIG.maxRetries;
    attempt++
  ){

    try{

      console.log(
        `${label} — attempt ${attempt}/${CONFIG.maxRetries}`
      );


      return await callback();


    }catch(error){

      lastError =
        error;


      console.error(
        `${label} failed:`,
        error.message
      );


      if(
        attempt <
        CONFIG.maxRetries
      ){

        await sleep(
          CONFIG.retryDelay *
          attempt
        );

      }

    }

  }


  throw lastError;

}


// ============================================================
// READ anime-ids.json
// ============================================================

function readAnimeList(){

  if(
    !fs.existsSync(
      ID_FILE
    )
  ){

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


  try{

    parsed =
      JSON.parse(
        raw
      );

  }catch(error){

    throw new Error(
      "anime-ids.json contains invalid JSON."
    );

  }


  if(
    !Array.isArray(
      parsed
    )
  ){

    throw new Error(
      "anime-ids.json must contain an array."
    );

  }


  return parsed;

}


// ============================================================
// NORMALIZE ID ENTRY
// ============================================================
//
// Chấp nhận:
//
// {
//   "id": 21,
//   "name": "ONE PIECE"
// }
//
// ============================================================

function normalizeIdEntry(
  entry
){

  if(
    !entry ||
    typeof entry !== "object"
  ){

    return null;

  }


  const id =
    Number(
      entry.id
    );


  if(
    !Number.isInteger(id) ||
    id <= 0
  ){

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
// REMOVE DUPLICATE IDS
// ============================================================

function normalizeAnimeList(
  list
){

  const map =
    new Map();


  for(
    const entry of list
  ){

    const normalized =
      normalizeIdEntry(
        entry
      );


    if(
      !normalized
    ){

      console.warn(
        "Skipping invalid anime entry:",
        entry
      );

      continue;

    }


    /*
     * Nếu ID bị lặp:
     * chỉ giữ một ID.
     */

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
// FETCH ONE ANIME FROM ANILIST
// ============================================================

async function fetchAnime(
  id
){

  return await withRetry(
    `AniList ID ${id}`,
    async function(){

      const response =
        await fetch(
          CONFIG.aniListURL,
          {

            method:
              "POST",

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

              })

          }
        );


      /*
       * AniList HTTP error.
       */

      if(
        !response.ok
      ){

        throw new Error(
          `AniList HTTP ${response.status}`
        );

      }


      const json =
        await response.json();


      /*
       * GraphQL error.
       */

      if(
        Array.isArray(
          json.errors
        ) &&
        json.errors.length > 0
      ){

        throw new Error(
          json.errors
            .map(
              error =>
                error.message
            )
            .join("; ")
        );

      }


      /*
       * Không có data.
       */

      if(
        !json.data
      ){

        throw new Error(
          "AniList returned no data."
        );

      }


      /*
       * ID không tồn tại hoặc
       * không phải anime.
       */

      if(
        !json.data.Media
      ){

        return null;

      }


      return json.data.Media;

    }
  );

}


// ============================================================
// GET BEST DISPLAY NAME
// ============================================================

function getBestName(
  anime
){

  if(
    !anime ||
    !anime.title
  ){

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
// NORMALIZE ANILIST DATA
// ============================================================
//
// Chỉ lưu những trường countdown cần.
//
// Không lưu toàn bộ Media object.
//
// Điều này giúp JSON R2 nhẹ hơn và ổn định hơn.
//
// ============================================================

function normalizeAnime(
  anime
){

  if(
    !anime ||
    !Number.isInteger(
      Number(anime.id)
    )
  ){

    return null;

  }


  const id =
    Number(
      anime.id
    );


  let episodes =
    null;


  if(
    anime.episodes !== null &&
    anime.episodes !== undefined
  ){

    const value =
      Number(
        anime.episodes
      );


    if(
      Number.isFinite(value) &&
      value >= 0
    ){

      episodes =
        value;

    }

  }


  let duration =
    null;


  if(
    anime.duration !== null &&
    anime.duration !== undefined
  ){

    const value =
      Number(
        anime.duration
      );


    if(
      Number.isFinite(value) &&
      value > 0
    ){

      duration =
        value;

    }

  }


  let nextAiringEpisode =
    null;


  if(
    anime.nextAiringEpisode
  ){

    const episode =
      Number(
        anime.nextAiringEpisode.episode
      );


    const airingAt =
      Number(
        anime.nextAiringEpisode.airingAt
      );


    /*
     * Chỉ nhận nextAiringEpisode
     * nếu cả episode và airingAt
     * đều hợp lệ.
     */

    if(
      Number.isInteger(
        episode
      ) &&
      episode > 0 &&
      Number.isFinite(
        airingAt
      ) &&
      airingAt > 0
    ){

      nextAiringEpisode = {

        episode,

        airingAt

      };

    }

  }


  return {

    id,

    title: {

      romaji:
        anime.title?.romaji ||
        null,

      english:
        anime.title?.english ||
        null,

      native:
        anime.title?.native ||
        null

    },

    status:
      anime.status ||
      "UNKNOWN",

    episodes,

    duration,

    startDate:
      anime.startDate || null,

    endDate:
      anime.endDate || null,

    season:
      anime.season ||
      null,

    seasonYear:
      anime.seasonYear ||
      null,

    nextAiringEpisode,

    updatedAt:
      Number.isFinite(
        Number(
          anime.updatedAt
        )
      )
        ? Number(
            anime.updatedAt
          )
        : null

  };

}


// ============================================================
// CREATE R2 BODY
// ============================================================

function createR2Body(
  anime
){

  /*
   * JSON.stringify với indentation
   * để file R2 dễ kiểm tra bằng mắt.
   */

  return JSON.stringify(
    anime,
    null,
    2
  );

}


// ============================================================
// SAVE ONE ANIME TO R2
// ============================================================

async function saveAnimeToR2(
  anime
){

  const key =
    `anime/${anime.id}.json`;


  const body =
    createR2Body(
      anime
    );


  await withRetry(
    `R2 ${key}`,
    async function(){

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

    }
  );


  console.log(
    `R2 saved: ${key}`
  );

}


// ============================================================
// PART 1 COMPLETE
// ============================================================
//
// Phần 2 sẽ:
//   - xử lý từng ID
//   - tự cập nhật name trong anime-ids.json
//   - không làm mất ID cũ nếu AniList tạm lỗi
//   - thống kê thành công/thất bại
//
// ============================================================

// ============================================================
// WHY2YUE — UPDATE CACHE
// update-cache.js
// PART 2/2
//
// Phần này:
//   - xử lý từng AniList ID
//   - lấy dữ liệu mới nhất
//   - cập nhật tên anime
//   - ghi JSON vào R2
//   - KHÔNG xóa anime cũ
//   - nếu 1 anime lỗi, các anime khác vẫn tiếp tục
//   - chỉ kết thúc workflow khi hoàn tất toàn bộ danh sách
// ============================================================


// ============================================================
// UPDATE NAME IN anime-ids.json
// ============================================================
//
// Ví dụ file ban đầu:
//
// [
//   {
//     "id": 21,
//     "name": "ONE PIECE"
//   },
//   {
//     "id": 196017,
//     "name": "Anime 196017"
//   }
// ]
//
// Nếu AniList trả về tên mới:
//
// name sẽ được tự động cập nhật.
//
// ============================================================

function updateLocalAnimeNames(
  originalList,
  animeResults
){

  const resultMap =
    new Map();


  /*
   * Tạo map:
   *
   * ID → tên AniList
   */

  for(
    const result of animeResults
  ){

    if(
      !result ||
      !result.anime
    ){

      continue;

    }


    const anime =
      result.anime;


    const name =
      getBestName(
        anime
      );


    if(
      name
    ){

      resultMap.set(
        anime.id,
        name
      );

    }

  }


  /*
   * Giữ nguyên thứ tự trong
   * anime-ids.json.
   */

  const updatedList =
    originalList.map(
      entry => {

        const normalized =
          normalizeIdEntry(
            entry
          );


        /*
         * Entry không hợp lệ:
         * giữ nguyên để dễ phát hiện
         * và không tự ý xóa dữ liệu.
         */

        if(
          !normalized
        ){

          return entry;

        }


        const newName =
          resultMap.get(
            normalized.id
          );


        /*
         * Có tên mới từ AniList:
         * cập nhật.
         */

        if(
          newName
        ){

          return {

            id:
              normalized.id,

            name:
              newName

          };

        }


        /*
         * AniList tạm lỗi:
         * giữ tên cũ.
         */

        return {

          id:
            normalized.id,

          name:
            normalized.name

        };

      }
    );


  /*
   * Ghi lại file nếu có thay đổi.
   */

  const newContent =
    JSON.stringify(
      updatedList,
      null,
      2
    ) +
    "\n";


  const oldContent =
    fs.readFileSync(
      ID_FILE,
      "utf8"
    );


  if(
    oldContent !==
    newContent
  ){

    fs.writeFileSync(
      ID_FILE,
      newContent,
      "utf8"
    );


    console.log(
      "anime-ids.json updated."
    );

  }else{

    console.log(
      "anime-ids.json unchanged."
    );

  }

}


// ============================================================
// PROCESS ONE ENTRY
// ============================================================
//
// Một ID lỗi không được làm chết toàn bộ workflow.
//
// Ví dụ:
//
// 21       → OK
// 196017   → OK
// 99999999 → lỗi
//
// Kết quả:
// 21 và 196017 vẫn được cập nhật.
// ============================================================

async function processAnime(
  entry
){

  const id =
    entry.id;


  console.log(
    ""
  );


  console.log(
    "--------------------------------------------------"
  );


  console.log(
    `Processing AniList ID: ${id}`
  );


  console.log(
    "--------------------------------------------------"
  );


  try{

    /*
     * 1. Lấy dữ liệu mới nhất
     * trực tiếp từ AniList.
     */

    const rawAnime =
      await fetchAnime(
        id
      );


    /*
     * AniList không tìm thấy ID.
     */

    if(
      !rawAnime
    ){

      console.error(
        `AniList ID ${id} was not found.`
      );


      return {

        id,

        success:
          false,

        anime:
          null,

        error:
          "Anime not found"

      };

    }


    /*
     * Kiểm tra ID trả về.
     *
     * Không bao giờ ghi dữ liệu
     * của anime khác vào anime/{id}.json.
     */

    if(
      Number(
        rawAnime.id
      ) !== id
    ){

      throw new Error(
        `AniList returned unexpected ID ${rawAnime.id}`
      );

    }


    /*
     * 2. Chuẩn hóa dữ liệu.
     */

    const anime =
      normalizeAnime(
        rawAnime
      );


    if(
      !anime
    ){

      throw new Error(
        "Failed to normalize AniList data."
      );

    }


    /*
     * 3. Ghi đúng file:
     *
     * anime/21.json
     *
     * hoặc:
     *
     * anime/196017.json
     */

    await saveAnimeToR2(
      anime
    );


    /*
     * 4. In thông tin để GitHub Actions
     * dễ kiểm tra.
     */

    const title =
      getBestName(
        anime
      ) ||
      entry.name ||
      `Anime ${id}`;


    console.log(
      `Anime: ${title}`
    );


    console.log(
      `Status: ${anime.status}`
    );


    if(
      anime.nextAiringEpisode
    ){

      console.log(
        `Next episode: ${anime.nextAiringEpisode.episode}`
      );


      console.log(
        `AiringAt: ${anime.nextAiringEpisode.airingAt}`
      );

    }else{

      console.log(
        "Next episode: none"
      );

    }


    return {

      id,

      success:
        true,

      anime,

      error:
        null

    };


  }catch(error){

    console.error(
      `Anime ${id} FAILED:`,
      error.message
    );


    /*
     * QUAN TRỌNG:
     *
     * Không xóa file R2 cũ.
     *
     * Nếu anime/21.json đã tồn tại
     * từ lần chạy trước thì nó vẫn còn.
     */

    return {

      id,

      success:
        false,

      anime:
        null,

      error:
        error.message

    };

  }

}


// ============================================================
// MAIN
// ============================================================

async function main(){

  console.log(
    ""
  );


  console.log(
    "============================================================"
  );


  console.log(
    "WHY2YUE — ANIME CACHE UPDATE START"
  );


  console.log(
    "============================================================"
  );


  console.log(
    `Started: ${new Date().toISOString()}`
  );


  console.log(
    ""
  );


  // ==========================================================
  // 1. ĐỌC DANH SÁCH ID
  // ==========================================================

  const originalList =
    readAnimeList();


  console.log(
    `Entries in anime-ids.json: ${originalList.length}`
  );


  // ==========================================================
  // 2. CHUẨN HÓA ID
  // ==========================================================

  const animeList =
    normalizeAnimeList(
      originalList
    );


  if(
    animeList.length === 0
  ){

    throw new Error(
      "anime-ids.json contains no valid AniList IDs."
    );

  }


  console.log(
    `Valid unique AniList IDs: ${animeList.length}`
  );


  console.log(
    ""
  );


  // ==========================================================
  // 3. XỬ LÝ TỪNG ANIME
  // ==========================================================

  const results =
    [];


  for(
    let i = 0;
    i < animeList.length;
    i++
  ){

    const entry =
      animeList[i];


    console.log(
      `Progress: ${i + 1}/${animeList.length}`
    );


    const result =
      await processAnime(
        entry
      );


    results.push(
      result
    );


    /*
     * Nghỉ nhẹ giữa các ID.
     *
     * Không cần tải hàng nghìn anime.
     * Chỉ tải những ID bạn đã thêm.
     */

    if(
      i <
      animeList.length - 1
    ){

      await sleep(
        CONFIG.animeDelay
      );

    }

  }


  // ==========================================================
  // 4. CẬP NHẬT TÊN
  // ==========================================================
  //
  // Chỉ cập nhật tên dựa trên những anime
  // AniList lấy thành công.
  //
  // Anime lỗi vẫn giữ tên cũ.
  //
  // ==========================================================

  updateLocalAnimeNames(
    originalList,
    results
  );


  // ==========================================================
  // 5. THỐNG KÊ
  // ==========================================================

  const successful =
    results.filter(
      result =>
        result.success
    );


  const failed =
    results.filter(
      result =>
        !result.success
    );


  console.log(
    ""
  );


  console.log(
    "============================================================"
  );


  console.log(
    "UPDATE SUMMARY"
  );


  console.log(
    "============================================================"
  );


  console.log(
    `Total IDs: ${results.length}`
  );


  console.log(
    `Successful: ${successful.length}`
  );


  console.log(
    `Failed: ${failed.length}`
  );


  // ==========================================================
  // 6. IN DANH SÁCH LỖI
  // ==========================================================

  if(
    failed.length > 0
  ){

    console.log(
      ""
    );


    console.log(
      "Failed IDs:"
    );


    for(
      const result
      of failed
    ){

      console.log(
        `- ${result.id}: ${result.error}`
      );

    }

  }


  // ==========================================================
  // 7. KHÔNG CÓ ANIME NÀO THÀNH CÔNG
  // ==========================================================
  //
  // Đây là tình huống nguy hiểm.
  //
  // Nếu tất cả request đều lỗi:
  //
  // KHÔNG được coi workflow là thành công.
  //
  // Nhưng cũng KHÔNG xóa dữ liệu R2.
  //
  // ==========================================================

  if(
    successful.length === 0
  ){

    throw new Error(
      "All anime updates failed. Existing R2 cache was preserved."
    );

  }


  // ==========================================================
  // 8. HOÀN TẤT
  // ==========================================================

  console.log(
    ""
  );


  console.log(
    "============================================================"
  );


  console.log(
    "WHY2YUE — ANIME CACHE UPDATE FINISHED"
  );


  console.log(
    "============================================================"
  );


  console.log(
    `Finished: ${new Date().toISOString()}`
  );


  console.log(
    ""
  );


  console.log(
    "R2 cache is ready."
  );


  /*
   * Nếu có một vài ID lỗi:
   *
   * Workflow vẫn hoàn thành phần còn lại.
   *
   * Các file R2 cũ của ID lỗi vẫn được giữ.
   */

}


// ============================================================
// START
// ============================================================

main()

  .catch(
    error => {

      console.error(
        ""
      );


      console.error(
        "============================================================"
      );


      console.error(
        "WHY2YUE — CACHE UPDATE FAILED"
      );


      console.error(
        "============================================================"
      );


      console.error(
        error
      );


      /*
       * Exit code 1 để GitHub Actions
       * đánh dấu workflow có lỗi.
       */

      process.exit(
        1
      );

    }
  );
