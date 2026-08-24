// ============================================================
// WHY2YUE — UPDATE ANIME CACHE
// update-cache.js
// PART 1/2
//
// AniList
//    ↓
// lấy anime theo nhiều nhóm
//    ↓
// loại trùng
//    ↓
// ưu tiên anime đang phát
//    ↓
// ưu tiên anime sắp phát
//    ↓
// ưu tiên anime phổ biến
//    ↓
// đảm bảo các ID quan trọng
//    ↓
// Cloudflare R2
//
// ============================================================

"use strict";


const {

    S3Client,

    PutObjectCommand

} = require(
    "@aws-sdk/client-s3"
);


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

    region:
        "auto",

    endpoint,

    credentials: {

        accessKeyId,

        secretAccessKey

    }

});


// ============================================================
// SETTINGS
// ============================================================

const PER_PAGE =
50;


/*
 * Số anime mục tiêu.
 */

const MAX_ANIME =
1500;


/*
 * Retry.
 */

const MAX_RETRIES =
3;


/*
 * Delay.
 */

const REQUEST_DELAY =
700;


/*
 * Cache.
 */

const CACHE_CONTROL =
"public, max-age=300";


/*
 * ===========================================================
 * ID BẮT BUỘC
 * ===========================================================
 *
 * One Piece:
 *
 * AniList ID = 21
 *
 * Có thể thêm các anime quan trọng khác tại đây.
 *
 * Những ID này KHÔNG bị giới hạn bởi 1.500.
 *
 * ===========================================================
 */

const REQUIRED_IDS = [

    21

];


// ============================================================
// ANILIST QUERY
// ============================================================
//
// Lấy đủ dữ liệu cần cho countdown.
//
// ============================================================

const query = `

query (
    $page: Int,
    $perPage: Int,
    $sort: [MediaSort]
) {

    Page(
        page: $page,
        perPage: $perPage
    ) {

        pageInfo {

            currentPage

            lastPage

            hasNextPage

        }


        media(

            type: ANIME

            isAdult: false

            sort: $sort

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
// QUERY BY ID
// ============================================================

const queryById = `

query (
    $id: Int
) {

    Media(
        id: $id,
        type: ANIME
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
// FETCH GRAPHQL
// ============================================================

async function fetchGraphQL(
    queryText,
    variables
) {

    let lastError =
    null;


    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            const response =
            await fetch(
                "https://graphql.anilist.co",
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
                            queryText,

                        variables:
                            variables

                    })

                }
            );


            if (
                !response.ok
            ) {

                throw new Error(
                    "AniList HTTP " +
                    response.status
                );

            }


            const json =
            await response.json();


            if (
                json.errors &&
                json.errors.length
            ) {

                throw new Error(
                    JSON.stringify(
                        json.errors
                    )
                );

            }


            return json.data;


        }
        catch (error) {

            lastError =
            error;


            console.error(
                "AniList request failed:",
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
// FETCH PAGE
// ============================================================

async function fetchPage(
    page,
    sort
) {

    console.log(
        `AniList page=${page}, sort=${sort}`
    );


    const data =
    await fetchGraphQL(

        query,

        {

            page,

            perPage:
                PER_PAGE,

            sort: [
                sort
            ]

        }

    );


    if (
        !data ||
        !data.Page
    ) {

        throw new Error(
            "AniList Page data missing."
        );

    }


    return data.Page;

}


// ============================================================
// COLLECT SORT
// ============================================================

async function collectSort(
    sort,
    maxPages
) {

    const result =
    [];


    for (
        let page = 1;
        page <= maxPages;
        page++
    ) {

        const pageData =
        await fetchPage(
            page,
            sort
        );


        const media =
        Array.isArray(
            pageData.media
        )
            ? pageData.media
            : [];


        result.push(
            ...media
        );


        console.log(
            `${sort} page ${page}: ${media.length}`
        );


        if (
            !pageData.pageInfo ||
            !pageData.pageInfo.hasNextPage
        ) {

            break;

        }


        await sleep(
            REQUEST_DELAY
        );

    }


    return result;

}


// ============================================================
// COLLECT ANIME
// ============================================================

async function collectAnime() {

    /*
     * Nhóm 1:
     *
     * anime được cập nhật gần đây.
     *
     * Đây là nhóm quan trọng nhất cho
     * countdown.
     */

    const updated =
    await collectSort(
        "UPDATED_AT_DESC",
        20
    );


    /*
     * Nhóm 2:
     *
     * phổ biến.
     *
     * Giúp One Piece và các anime lớn
     * được ưu tiên.
     */

    const popular =
    await collectSort(
        "POPULARITY_DESC",
        20
    );


    /*
     * Nhóm 3:
     *
     * ngày bắt đầu mới nhất.
     *
     * Bổ sung anime mùa mới.
     */

    const recent =
    await collectSort(
        "START_DATE_DESC",
        10
    );


    /*
     * Gộp.
     */

    const map =
    new Map();


    for (
        const anime
        of [
            ...updated,
            ...popular,
            ...recent
        ]
    ) {

        if (
            !anime ||
            !Number.isFinite(
                Number(anime.id)
            )
        ) {

            continue;

        }


        const id =
        Number(anime.id);


        /*
         * Nếu trùng ID,
         * bản đầu tiên được giữ.
         */

        if (
            !map.has(id)
        ) {

            map.set(
                id,
                anime
            );

        }

    }


    console.log(
        "Collected unique anime:",
        map.size
    );


    /*
     * =======================================================
     * ĐẢM BẢO REQUIRED IDS
     * =======================================================
     *
     * Ví dụ One Piece ID 21.
     *
     * Nếu ID 21 chưa nằm trong map,
     * query trực tiếp AniList.
     */

    for (
        const id
        of REQUIRED_IDS
    ) {

        if (
            map.has(id)
        ) {

            console.log(
                `Required anime ${id} already collected.`
            );

            continue;

        }


        console.log(
            `Fetching required anime ${id} directly...`
        );


        const data =
        await fetchGraphQL(

            queryById,

            {
                id
            }

        );


        if (
            data &&
            data.Media
        ) {

            map.set(
                id,
                data.Media
            );

            console.log(
                `Required anime ${id} added.`
            );

        }


        await sleep(
            REQUEST_DELAY
        );

    }


    /*
     * =======================================================
     * XẾP HẠNG
     * =======================================================
     *
     * Không lấy 1.500 theo thứ tự API nữa.
     *
     * Tự chấm điểm:
     *
     * RELEASING
     * > NOT_YET_RELEASED
     * > FINISHED
     *
     * Anime có lịch phát được ưu tiên.
     *
     * Anime phổ biến cũng đã được đưa vào
     * từ POPULARITY_DESC.
     */

    const animeList =
    Array.from(
        map.values()
    );


    function score(anime) {

        let value =
        0;


        /*
         * Đang phát.
         */

        if (
            anime.status ===
            "RELEASING"
        ) {

            value +=
            100000000;

        }


        /*
         * Có lịch tập tiếp theo.
         */

        if (
            anime.nextAiringEpisode
        ) {

            value +=
            50000000;

        }


        /*
         * Sắp phát.
         */

        if (
            anime.status ===
            "NOT_YET_RELEASED"
        ) {

            value +=
            30000000;

        }


        /*
         * UpdatedAt.
         */

        value +=
        Number(
            anime.updatedAt || 0
        );


        /*
         * Required ID.
         */

        if (
            REQUIRED_IDS.includes(
                Number(anime.id)
            )
        ) {

            value +=
            1000000000;

        }


        return value;

    }


    animeList.sort(

        (a, b) =>
        score(b) -
        score(a)

    );


    /*
     * Lấy tối đa 1.500.
     */

    const selected =
    animeList.slice(
        0,
        MAX_ANIME
    );


    /*
     * Required ID phải chắc chắn tồn tại.
     *
     * Nếu vì lý do xếp hạng mà bị loại,
     * ép nó vào lại.
     */

    for (
        const requiredId
        of REQUIRED_IDS
    ) {

        const required =
        map.get(
            requiredId
        );


        if (!required) {

            continue;

        }


        const exists =
        selected.some(

            anime =>
            Number(anime.id) ===
            requiredId

        );


        if (exists) {

            continue;

        }


        /*
         * Thay phần tử cuối.
         */

        selected.pop();


        selected.push(
            required
        );

    }


    console.log(
        "Selected anime:",
        selected.length
    );


    /*
     * Thống kê.
     */

    let releasing =
    0;

    let upcoming =
    0;

    let finished =
    0;


    for (
        const anime
        of selected
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
        "RELEASING:",
        releasing
    );


    console.log(
        "NOT_YET_RELEASED:",
        upcoming
    );


    console.log(
        "FINISHED:",
        finished
    );


    /*
     * Kiểm tra One Piece.
     */

    const onePiece =
    selected.find(

        anime =>
        Number(anime.id) === 21

    );


    console.log(
        "One Piece ID 21:",
        onePiece
            ? "FOUND"
            : "NOT FOUND"
    );


    return selected;

}


// ============================================================
// SAVE ONE ANIME
// ============================================================

async function saveAnime(
    anime
) {

    const id =
    Number(anime.id);


    if (
        !Number.isFinite(id)
    ) {

        throw new Error(
            "Invalid anime ID."
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


/* =========================================================
   PART 1 END
   ========================================================= */


// ============================================================
// WHY2YUE — UPDATE ANIME CACHE
// update-cache.js
// PART 2/2
// ============================================================


// ============================================================
// SAVE ALL
// ============================================================

async function saveAll(
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
                `Uploading anime/${anime.id}.json`
            );


            await saveAnime(
                anime
            );


            success++;


            console.log(
                `Anime ${anime.id}: OK`
            );


        }
        catch (error) {

            failed++;


            console.error(
                `Anime ${anime.id}: FAILED`,
                error.message
            );

        }


        /*
         * Nghỉ nhẹ giữa các upload.
         */

        await sleep(
            100
        );

    }


    return {

        success,

        failed

    };

}


// ============================================================
// VERIFY REQUIRED FILES
// ============================================================
//
// Không cần ListObjects.
//
// Chỉ kiểm tra các anime bắt buộc.
// ============================================================

async function verifyRequiredAnime(
    animeList
) {

    const ids =
    new Set(

        animeList.map(

            anime =>
            Number(anime.id)

        )

    );


    for (
        const requiredId
        of REQUIRED_IDS
    ) {

        if (
            !ids.has(
                requiredId
            )
        ) {

            throw new Error(

                `Required anime ${requiredId} missing from update.`

            );

        }

    }


    console.log(
        "Required anime verification: OK"
    );

}


// ============================================================
// MAIN
// ============================================================

async function main() {

    console.log("");


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
        "Target:",
        MAX_ANIME
    );


    console.log(
        "Required IDs:",
        REQUIRED_IDS.join(", ")
    );


    console.log("");


    /*
     * ========================================================
     * 1. LẤY DỮ LIỆU ANILIST
     * ========================================================
     */

    const animeList =
    await collectAnime();


    /*
     * ========================================================
     * 2. KIỂM TRA
     * ========================================================
     */

    if (
        !animeList ||
        animeList.length === 0
    ) {

        throw new Error(

            "AniList returned zero anime. R2 will NOT be modified."

        );

    }


    /*
     * Không cho phép một lần API lỗi
     * làm danh sách tụt quá thấp.
     *
     * Nếu 1.500 mục tiêu mà chỉ lấy được
     * vài chục → dừng.
     */

    if (
        animeList.length < 100
    ) {

        throw new Error(

            `Anime list suspiciously small: ${animeList.length}. R2 update aborted.`

        );

    }


    /*
     * ========================================================
     * 3. VERIFY REQUIRED
     * ========================================================
     */

    await verifyRequiredAnime(
        animeList
    );


    /*
     * ========================================================
     * 4. UPLOAD
     * ========================================================
     */

    const result =
    await saveAll(
        animeList
    );


    console.log("");


    console.log(
        "Upload success:",
        result.success
    );


    console.log(
        "Upload failed:",
        result.failed
    );


    /*
     * ========================================================
     * 5. AN TOÀN
     * ========================================================
     *
     * Nếu upload thất bại quá nhiều,
     * workflow báo lỗi.
     *
     * NHƯNG:
     *
     * Không xóa cache cũ.
     *
     * Đây là chủ ý.
     *
     * Ví dụ:
     *
     * AniList lỗi
     * R2 lỗi
     * GitHub lỗi
     *
     * → file cũ vẫn còn.
     *
     * Blogger tiếp tục đọc file cũ.
     *
     * ========================================================
     */

    if (
        result.success === 0
    ) {

        throw new Error(

            "All R2 uploads failed. Existing R2 cache remains untouched."

        );

    }


    /*
     * Nếu tỷ lệ thất bại quá lớn,
     * vẫn cho workflow FAILED để bạn biết.
     *
     * Nhưng KHÔNG rollback/xóa dữ liệu.
     */

    const failureRate =
    result.failed /
    animeList.length;


    if (
        failureRate > 0.20
    ) {

        throw new Error(

            `Too many upload failures: ${result.failed}/${animeList.length}. Existing R2 cache was NOT deleted.`

        );

    }


    /*
     * ========================================================
     * 6. KIỂM TRA ONE PIECE
     * ========================================================
     */

    if (
        REQUIRED_IDS.includes(21)
    ) {

        const onePiece =
        animeList.find(

            anime =>
            Number(anime.id) === 21

        );


        if (!onePiece) {

            throw new Error(
                "One Piece ID 21 is missing."
            );

        }


        console.log("");


        console.log(
            "============================================================"
        );


        console.log(
            "ONE PIECE CHECK"
        );


        console.log(
            "ID:",
            onePiece.id
        );


        console.log(
            "Title:",
            onePiece.title?.romaji ||
            onePiece.title?.english ||
            onePiece.title?.native ||
            "Unknown"
        );


        console.log(
            "Status:",
            onePiece.status
        );


        if (
            onePiece.nextAiringEpisode
        ) {

            console.log(
                "Next episode:",
                onePiece.nextAiringEpisode.episode
            );


            console.log(
                "AiringAt:",
                onePiece.nextAiringEpisode.airingAt
            );

        }
        else {

            console.log(
                "Next episode: none"
            );

        }


        console.log(
            "============================================================"
        );

    }


    /*
     * ========================================================
     * 7. KHÔNG XÓA FILE CŨ
     * ========================================================
     *
     * Đây là thay đổi rất quan trọng.
     *
     * Code cũ:
     *
     * lấy danh sách mới
     * ↓
     * xóa file không nằm trong danh sách
     *
     * Điều đó nguy hiểm.
     *
     * Nếu một lần AniList trả thiếu dữ liệu:
     *
     * → file anime cũ bị xóa.
     *
     * Bản mới:
     *
     * CHỈ PUT FILE MỚI.
     *
     * File cũ không ảnh hưởng.
     *
     * ========================================================
     */


    console.log("");


    console.log(
        "Old R2 cache files were NOT deleted."
    );


    /*
     * ========================================================
     * 8. FINISH
     * ========================================================
     */

    console.log("");


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
        `Updated: ${result.success}`
    );


    console.log(
        `Failed: ${result.failed}`
    );


    console.log(
        `Total selected: ${animeList.length}`
    );


    console.log(
        "R2 bucket:",
        bucket
    );


    console.log(
        "============================================================"
    );

}


// ============================================================
// ERROR HANDLER
// ============================================================

main()

.catch(

    error => {

        console.error("");


        console.error(
            "============================================================"
        );


        console.error(
            "WHY2YUE CACHE UPDATE FAILED"
        );


        console.error(
            "============================================================"
        );


        console.error(
            error &&
            error.stack
                ? error.stack
                : error
        );


        console.error(
            "Existing R2 cache was NOT deleted."
        );


        console.error(
            "============================================================"
        );


        process.exit(
            1
        );

    }

);
