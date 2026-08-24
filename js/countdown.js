// ============================================================
// WHY2YUE — COUNTDOWN ENGINE
// countdown.js
// PART 1/3
//
// Blogger
//    ↓
// AniList ID
//    ↓
// anime/{ID}.json
//    ↓
// Cloudflare R2
//
// NHIỆM VỤ P1:
// - Khởi tạo engine
// - Đọc AniList ID từ HTML
// - Tự tạo R2 URL
// - Fetch JSON R2
// - Timeout + retry
// - Giữ dữ liệu cũ nếu R2 tạm lỗi
// - Chuẩn hóa dữ liệu AniList
//
// P2:
// - trạng thái
// - tập hiện tại / tập tiếp theo
// - ngày giờ Việt Nam
// - countdown realtime
//
// P3:
// - render
// - refresh R2
// - phát hiện dữ liệu mới
// - xử lý countdown kết thúc
// - khởi động engine
// ============================================================

(function(){

"use strict";


// ============================================================
// GLOBAL ENGINE
// ============================================================

window.W2YCountdown =
window.W2YCountdown || {};

const W2Y =
window.W2YCountdown;


// ============================================================
// CONFIG
// ============================================================

W2Y.config = {

    /*
     * R2 public domain.
     *
     * Không thay đổi nếu bucket public
     * đang sử dụng domain này.
     */

    r2Base:

        "https://pub-fb649c225b4545dd8132b2744f70af24.r2.dev/anime",


    /*
     * Kiểm tra R2 mỗi 5 phút.
     *
     * Không cần Blogger lưu dữ liệu.
     */

    refreshInterval:

        5 * 60 * 1000,


    /*
     * Timeout mỗi request.
     */

    requestTimeout:

        15000,


    /*
     * Nếu R2 lỗi thì thử lại tối đa 2 lần.
     */

    maxRetries:

        2,


    /*
     * Thời gian giữa các lần retry.
     */

    retryDelay:

        1500,


    /*
     * Mặc định tiếng Việt.
     */

    defaultLanguage:

        "vi"

};


// ============================================================
// FIND COUNTDOWN ELEMENT
// ============================================================
//
// HTML cần có:
//
// <section
//   id="anime-countdown"
//   data-anilist-id="21"
// >
//
// Anime khác:
//
// data-anilist-id="196017"
//
// ============================================================

W2Y.box =
document.getElementById(
    "anime-countdown"
);


// ============================================================
// KHÔNG CÓ COUNTDOWN
// ============================================================

if(
    !W2Y.box
){

    console.warn(
        "WHY2YUE: #anime-countdown not found."
    );

    return;

}


// ============================================================
// READ ANILIST ID
// ============================================================

W2Y.anilistId =
String(
    W2Y.box.dataset.anilistId || ""
).trim();


// ============================================================
// VALIDATE ANILIST ID
// ============================================================

if(
    !/^\d+$/.test(
        W2Y.anilistId
    )
){

    console.error(
        "WHY2YUE: Invalid AniList ID:",
        W2Y.anilistId
    );

    W2Y.error =
        "INVALID_ANILIST_ID";

    return;

}


// ============================================================
// NUMERIC ID
// ============================================================

W2Y.anilistIdNumber =
Number(
    W2Y.anilistId
);


// ============================================================
// LANGUAGE
// ============================================================

W2Y.language =
W2Y.box.dataset.lang ||
document.documentElement
.getAttribute("lang") ||
localStorage.getItem("lang") ||
W2Y.config.defaultLanguage;


// ============================================================
// NORMALIZE LANGUAGE
// ============================================================

if(
    W2Y.language
){

    W2Y.language =
    String(
        W2Y.language
    )
    .toLowerCase()
    .trim();

}


// ============================================================
// VIETNAMESE DEFAULT
// ============================================================

if(
    !W2Y.language
){

    W2Y.language =
    "vi";

}


// ============================================================
// R2 URL
// ============================================================
//
// Tự tạo:
//
// https://...r2.dev/anime/21.json
//
// hoặc:
//
// https://...r2.dev/anime/196017.json
//
// Không nhập URL JSON riêng cho từng anime.
//
// ============================================================

W2Y.getR2URL =
function(){

    /*
     * Cho phép HTML ghi đè nếu cần.
     *
     * Ví dụ:
     *
     * data-r2-url="https://..."
     *
     * Nhưng bình thường KHÔNG cần.
     */

    const customURL =
    W2Y.box.dataset.r2Url;


    if(
        customURL &&
        customURL.trim()
    ){

        return customURL.trim();

    }


    return (

        W2Y.config.r2Base
        .replace(
            /\/+$/,
            ""
        )
        +
        "/"
        +
        W2Y.anilistId
        +
        ".json"

    );

};


// ============================================================
// CURRENT R2 URL
// ============================================================

W2Y.dataURL =
W2Y.getR2URL();


console.log(
    "WHY2YUE: Anime ID =",
    W2Y.anilistId
);


console.log(
    "WHY2YUE: R2 URL =",
    W2Y.dataURL
);


// ============================================================
// STATE
// ============================================================

W2Y.state = {

    /*
     * Dữ liệu anime hiện tại.
     */

    anime:
        null,


    /*
     * Dữ liệu JSON cuối cùng nhận được
     * từ R2.
     */

    lastData:
        null,


    /*
     * Chuỗi JSON dùng để phát hiện
     * dữ liệu có thay đổi hay không.
     */

    lastDataSignature:
        null,


    /*
     * Thời điểm fetch thành công
     * gần nhất.
     */

    lastSuccessfulFetch:
        0,


    /*
     * Thời điểm dữ liệu R2 được kiểm tra
     * gần nhất.
     */

    lastCheck:
        0,


    /*
     * Nguồn dữ liệu.
     */

    source:
        null,


    /*
     * Trạng thái R2.
     */

    r2Status:
        "idle",


    /*
     * Đang request hay không.
     */

    loading:
        false,


    /*
     * Refresh timer.
     */

    refreshTimer:
        null,


    /*
     * Countdown timer.
     */

    countdownTimer:
        null,


    /*
     * Target airing timestamp.
     */

    targetAiringAt:
        null,


    /*
     * Episode tiếp theo.

     */

    nextEpisode:
        null,


    /*
     * Engine đã khởi động chưa.
     */

    started:
        false

};


// ============================================================
// SLEEP
// ============================================================

W2Y.sleep =
function(
    milliseconds
){

    return new Promise(
        function(resolve){

            setTimeout(
                resolve,
                milliseconds
            );

        }
    );

};


// ============================================================
// CREATE CACHE BUST URL
// ============================================================
//
// R2:
//
// anime/21.json
//
// Request thực tế:
//
// anime/21.json?w2y=123456
//
// Giúp tránh browser giữ response cũ.
//
// ============================================================

W2Y.createRequestURL =
function(){

    const separator =
        W2Y.dataURL.includes("?")
            ? "&"
            : "?";


    return (

        W2Y.dataURL
        +
        separator
        +
        "w2y="
        +
        Date.now()

    );

};


// ============================================================
// FETCH R2 ONCE
// ============================================================

W2Y.fetchR2Once =
async function(){

    const url =
        W2Y.createRequestURL();


    const controller =
        new AbortController();


    const timeout =
    setTimeout(
        function(){

            controller.abort();

        },
        W2Y.config.requestTimeout
    );


    try{

        const response =
        await fetch(
            url,
            {

                method:
                    "GET",

                cache:
                    "no-store",

                signal:
                    controller.signal,

                headers: {

                    "Accept":
                        "application/json",

                    "Cache-Control":
                        "no-cache",

                    "Pragma":
                        "no-cache"

                }

            }
        );


        /*
         * HTTP lỗi.
         */

        if(
            !response.ok
        ){

            throw new Error(
                "R2 HTTP " +
                response.status
            );

        }


        /*
         * Đọc JSON.
         */

        const data =
        await response.json();


        /*
         * JSON phải là object.
         */

        if(
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ){

            throw new Error(
                "R2 returned invalid JSON."
            );

        }


        return data;


    }finally{

        clearTimeout(
            timeout
        );

    }

};


// ============================================================
// FETCH R2 WITH RETRY
// ============================================================

W2Y.fetchR2 =
async function(){

    let lastError =
        null;


    for(
        let attempt = 1;
        attempt <=
        W2Y.config.maxRetries + 1;
        attempt++
    ){

        try{

            console.log(
                `WHY2YUE: R2 request ${attempt}/${W2Y.config.maxRetries + 1}`
            );


            const data =
            await W2Y.fetchR2Once();


            return data;


        }catch(error){

            lastError =
            error;


            console.warn(
                "WHY2YUE: R2 request failed:",
                error.message
            );


            /*
             * Không retry thêm nếu
             * đã hết số lần thử.
             */

            if(
                attempt >
                W2Y.config.maxRetries
            ){

                break;

            }


            await W2Y.sleep(
                W2Y.config.retryDelay *
                attempt
            );

        }

    }


    throw lastError;

};


// ============================================================
// CHECK ANILIST ID
// ============================================================
//
// Rất quan trọng:
//
// Trang One Piece:
// ID = 21
//
// Nhưng nếu R2 trả về:
//
// id = 196017
//
// thì KHÔNG được render.
//
// Điều này tránh lấy nhầm JSON.
//
// ============================================================

W2Y.validateAnimeID =
function(
    data
){

    if(
        data.id === undefined ||
        data.id === null
    ){

        /*
         * Một số dữ liệu cũ có thể không có id.
         *
         * Không chặn ngay ở đây.
         */

        return true;

    }


    return (
        String(
            data.id
        ) ===
        W2Y.anilistId
    );

};


// ============================================================
// NORMALIZE DATE OBJECT
// ============================================================

W2Y.normalizeDate =
function(
    value
){

    if(
        !value ||
        typeof value !== "object"
    ){

        return null;

    }


    const year =
    Number(
        value.year
    );


    const month =
    Number(
        value.month
    );


    const day =
    Number(
        value.day
    );


    if(
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day)
    ){

        return null;

    }


    if(
        year < 1900 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ){

        return null;

    }


    return {

        year,
        month,
        day

    };

};


// ============================================================
// NORMALIZE NEXT AIRING
// ============================================================

W2Y.normalizeNextAiring =
function(
    value
){

    if(
        !value ||
        typeof value !== "object"
    ){

        return null;

    }


    const episode =
    Number(
        value.episode
    );


    const airingAt =
    Number(
        value.airingAt
    );


    if(
        !Number.isInteger(
            episode
        ) ||
        episode <= 0
    ){

        return null;

    }


    if(
        !Number.isFinite(
            airingAt
        ) ||
        airingAt <= 0
    ){

        return null;

    }


    /*
     * AniList airingAt là Unix timestamp
     * tính bằng giây.
     */

    return {

        episode,

        airingAt,

        timestamp:
            airingAt * 1000

    };

};


// ============================================================
// NORMALIZE ANIME
// ============================================================

W2Y.normalizeAnime =
function(
    data
){

    if(
        !data ||
        typeof data !== "object"
    ){

        return null;

    }


    if(
        !W2Y.validateAnimeID(
            data
        )
    ){

        throw new Error(
            "R2 JSON belongs to another AniList ID."
        );

    }


    const id =
    Number(
        data.id
    );


    const normalized = {

        id:
            Number.isInteger(id)
                ? id
                : W2Y.anilistIdNumber,


        title: {

            romaji:
                data.title?.romaji ||
                "",

            english:
                data.title?.english ||
                "",

            native:
                data.title?.native ||
                ""

        },


        status:
            String(
                data.status ||
                "UNKNOWN"
            )
            .toUpperCase(),


        episodes:
            null,


        duration:
            null,


        startDate:
            W2Y.normalizeDate(
                data.startDate
            ),


        endDate:
            W2Y.normalizeDate(
                data.endDate
            ),


        season:
            data.season ||
            null,


        seasonYear:
            Number.isFinite(
                Number(
                    data.seasonYear
                )
            )
                ? Number(
                    data.seasonYear
                )
                : null,


        nextAiringEpisode:
            W2Y.normalizeNextAiring(
                data.nextAiringEpisode
            ),


        updatedAt:
            Number.isFinite(
                Number(
                    data.updatedAt
                )
            )
                ? Number(
                    data.updatedAt
                )
                : null

    };


    /*
     * Episodes.
     */

    if(
        data.episodes !== null &&
        data.episodes !== undefined
    ){

        const episodes =
        Number(
            data.episodes
        );


        if(
            Number.isFinite(
                episodes
            ) &&
            episodes >= 0
        ){

            normalized.episodes =
                episodes;

        }

    }


    /*
     * Duration.
     */

    if(
        data.duration !== null &&
        data.duration !== undefined
    ){

        const duration =
        Number(
            data.duration
        );


        if(
            Number.isFinite(
                duration
            ) &&
            duration > 0
        ){

            normalized.duration =
                duration;

        }

    }


    return normalized;

};


// ============================================================
// GET ANIME TITLE
// ============================================================

W2Y.getAnimeTitle =
function(
    anime
){

    if(
        !anime
    ){

        return "Anime";

    }


    return (

        anime.title?.english ||

        anime.title?.romaji ||

        anime.title?.native ||

        "Anime"

    );

};


// ============================================================
// CREATE DATA SIGNATURE
// ============================================================
//
// Dùng để phát hiện:
//
// JSON cũ === JSON mới
//
// thì không reset countdown.
//
// ============================================================

W2Y.createSignature =
function(
    anime
){

    try{

        return JSON.stringify(
            anime
        );

    }catch(error){

        return "";

    }

};


// ============================================================
// APPLY R2 DATA
// ============================================================
//
// Nếu JSON hợp lệ:
//
// state.anime = dữ liệu mới
//
// Nếu JSON không đổi:
//
// không làm gì thêm ở P1.
//
// P2/P3 sẽ quyết định render.
//
// ============================================================

W2Y.applyR2Data =
function(
    rawData
){

    const anime =
    W2Y.normalizeAnime(
        rawData
    );


    if(
        !anime
    ){

        throw new Error(
            "Unable to normalize R2 anime data."
        );

    }


    const signature =
    W2Y.createSignature(
        anime
    );


    const changed =
    signature !==
    W2Y.state.lastDataSignature;


    W2Y.state.anime =
    anime;


    W2Y.state.lastData =
    rawData;


    W2Y.state.lastDataSignature =
    signature;


    W2Y.state.lastSuccessfulFetch =
    Date.now();


    W2Y.state.r2Status =
    "online";


    W2Y.state.source =
    "cloudflare-r2";


    return {

        anime,

        changed

    };

};


// ============================================================
// LOAD DATA SAFELY
// ============================================================
//
// Đây là cơ chế fallback quan trọng:
//
// Lần đầu:
// R2 lỗi → chưa có dữ liệu.
//
// Những lần sau:
// R2 lỗi → GIỮ state.anime cũ.
//
// Không làm trắng countdown.
//
// ============================================================

W2Y.loadData =
async function(){

    if(
        W2Y.state.loading
    ){

        return {

            success:
                false,

            changed:
                false,

            error:
                "Already loading"

        };

    }


    W2Y.state.loading =
    true;


    W2Y.state.lastCheck =
    Date.now();


    try{

        const rawData =
        await W2Y.fetchR2();


        const result =
        W2Y.applyR2Data(
            rawData
        );


        console.log(
            "WHY2YUE: R2 data loaded.",
            result.changed
                ? "DATA CHANGED"
                : "DATA UNCHANGED"
        );


        return {

            success:
                true,

            changed:
                result.changed,

            anime:
                result.anime,

            error:
                null

        };


    }catch(error){

        W2Y.state.r2Status =
        "error";


        console.warn(
            "WHY2YUE: R2 unavailable. Keeping previous data.",
            error.message
        );


        /*
         * KHÔNG reset W2Y.state.anime.
         */

        if(
            W2Y.state.anime
        ){

            return {

                success:
                    false,

                changed:
                    false,

                anime:
                    W2Y.state.anime,

                error

            };

        }


        return {

            success:
                false,

            changed:
                false,

            anime:
                null,

            error

        };

    }finally{

        W2Y.state.loading =
        false;

    }

};


// ============================================================
// PART 1 READY
// ============================================================

W2Y.part1Ready =
true;


console.log(
    "WHY2YUE: Countdown P1 ready.",
    "AniList ID:",
    W2Y.anilistId,
    "R2:",
    W2Y.dataURL
);

})();


/* ============================================================
   WHY2YUE — COUNTDOWN.JS
   P2/3 — DATA NORMALIZE + TIME + STATUS
   ============================================================ */

(function () {

    "use strict";

    const W2Y = window.W2YCountdown;

    if (!W2Y) {
        console.error(
            "WHY2YUE: Countdown engine P1 chưa được tải."
        );
        return;
    }


    /* ========================================================
       1. TEXT MẶC ĐỊNH
       ======================================================== */

    W2Y.text = {

        loading:
            "Đang tải dữ liệu...",

        nextEpisode:
            "Tập tiếp theo",

        currentEpisode:
            "Tập hiện tại",

        countdown:
            "Thời gian còn lại",

        releasing:
            "Đang phát sóng",

        notYet:
            "Chưa phát sóng",

        finished:
            "Đã hoàn thành",

        noSchedule:
            "Chưa có lịch phát",

        updating:
            "Đang cập nhật dữ liệu...",

        updated:
            "Đã cập nhật từ Cloudflare R2",

        oldData:
            "R2 tạm thời không phản hồi — đang dùng dữ liệu trước đó.",

        error:
            "Không thể tải dữ liệu anime.",

        waiting:
            "Đang chờ dữ liệu mới.",

        days:
            "ngày",

        hours:
            "giờ",

        minutes:
            "phút",

        seconds:
            "giây"

    };


    /* ========================================================
       2. ESCAPE HTML
       ======================================================== */

    W2Y.escapeHTML = function (value) {

        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    };


    /* ========================================================
       3. NUMBER AN TOÀN
       ======================================================== */

    W2Y.toNumber = function (value) {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return null;
        }

        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : null;

    };


    /* ========================================================
       4. ANIList ID
       ======================================================== */

    W2Y.getAnimeId = function (data) {

        const id =
            W2Y.toNumber(
                data?.id
            );

        if (
            id === null ||
            id <= 0
        ) {
            return null;
        }

        return id;

    };


    /* ========================================================
       5. LẤY TÊN ANIME
       ======================================================== */

    W2Y.getAnimeName = function (data) {

        const title =
            data?.title || {};

        return (

            title.english ||

            title.romaji ||

            title.native ||

            "Anime"

        );

    };


    /* ========================================================
       6. LẤY TRẠNG THÁI
       ======================================================== */

    W2Y.getAnimeStatus = function (data) {

        return String(
            data?.status || "UNKNOWN"
        ).toUpperCase();

    };


    /* ========================================================
       7. KIỂM TRA ANIME ĐÃ KẾT THÚC
       ======================================================== */

    W2Y.isFinished = function (data) {

        return (
            W2Y.getAnimeStatus(data) ===
            "FINISHED"
        );

    };


    /* ========================================================
       8. KIỂM TRA ĐANG PHÁT
       ======================================================== */

    W2Y.isReleasing = function (data) {

        return (
            W2Y.getAnimeStatus(data) ===
            "RELEASING"
        );

    };


    /* ========================================================
       9. KIỂM TRA CHƯA PHÁT
       ======================================================== */

    W2Y.isNotYetReleased = function (data) {

        return (
            W2Y.getAnimeStatus(data) ===
            "NOT_YET_RELEASED"
        );

    };


    /* ========================================================
       10. LẤY TỔNG SỐ TẬP
       ======================================================== */

    W2Y.getTotalEpisodes = function (data) {

        const episodes =
            W2Y.toNumber(
                data?.episodes
            );

        if (
            episodes === null ||
            episodes <= 0
        ) {
            return null;
        }

        return episodes;

    };


    /* ========================================================
       11. LẤY NEXT AIRING
       ======================================================== */

    W2Y.getNextAiring = function (data) {

        if (
            !data ||
            typeof data !== "object"
        ) {
            return null;
        }

        const next =
            data.nextAiringEpisode;

        if (
            !next ||
            typeof next !== "object"
        ) {
            return null;
        }

        const episode =
            W2Y.toNumber(
                next.episode
            );

        const airingAt =
            W2Y.toNumber(
                next.airingAt
            );

        if (
            episode === null ||
            airingAt === null
        ) {
            return null;
        }

        if (
            episode <= 0 ||
            airingAt <= 0
        ) {
            return null;
        }

        return {

            episode:
                Math.floor(
                    episode
                ),

            airingAt:
                Math.floor(
                    airingAt
                ),

            timestamp:
                Math.floor(
                    airingAt * 1000
                )

        };

    };


    /* ========================================================
       12. TẬP HIỆN TẠI
       ========================================================

       Ví dụ:

       JSON:

       nextAiringEpisode:
       {
           episode: 1175,
           airingAt: ...
       }

       => tập hiện tại = 1174

       Không tự tăng tập khi countdown về 0.
       Chỉ khi R2 trả về dữ liệu mới:
       next episode = 1176
       thì hệ thống mới hiểu:
       current = 1175.
       ======================================================== */

    W2Y.getCurrentEpisode = function (data) {

        const next =
            W2Y.getNextAiring(data);

        if (next) {

            const current =
                next.episode - 1;

            if (current >= 0) {
                return current;
            }

        }


        /* ----------------------------------------------------
           Anime FINISHED
           ---------------------------------------------------- */

        if (
            W2Y.isFinished(data)
        ) {

            const total =
                W2Y.getTotalEpisodes(data);

            if (
                total !== null
            ) {
                return total;
            }

        }


        /*
         * Một số anime có thể đang RELEASING
         * nhưng AniList chưa có nextAiringEpisode.
         *
         * Khi đó KHÔNG đoán tập hiện tại.
         */

        return null;

    };


    /* ========================================================
       13. LẤY TẬP TIẾP THEO
       ======================================================== */

    W2Y.getNextEpisode = function (data) {

        const next =
            W2Y.getNextAiring(data);

        if (!next) {
            return null;
        }

        return next.episode;

    };


    /* ========================================================
       14. TÍNH COUNTDOWN
       ======================================================== */

    W2Y.getRemaining = function (airingAt) {

        const timestamp =
            W2Y.toNumber(
                airingAt
            );

        if (
            timestamp === null
        ) {
            return null;
        }

        const target =
            timestamp * 1000;

        const now =
            Date.now();

        return (
            target - now
        );

    };


    /* ========================================================
       15. FORMAT 1 SỐ
       ======================================================== */

    W2Y.pad = function (number) {

        return String(
            Math.max(
                0,
                Math.floor(
                    Number(number) || 0
                )
            )
        ).padStart(
            2,
            "0"
        );

    };


    /* ========================================================
       16. FORMAT COUNTDOWN
       ======================================================== */

    W2Y.formatCountdown = function (
        milliseconds
    ) {

        let totalSeconds =
            Math.max(
                0,
                Math.floor(
                    milliseconds / 1000
                )
            );


        const days =
            Math.floor(
                totalSeconds / 86400
            );


        totalSeconds %=
            86400;


        const hours =
            Math.floor(
                totalSeconds / 3600
            );


        totalSeconds %=
            3600;


        const minutes =
            Math.floor(
                totalSeconds / 60
            );


        const seconds =
            totalSeconds % 60;


        return {

            days:
                days,

            hours:
                hours,

            minutes:
                minutes,

            seconds:
                seconds,

            text:

                W2Y.pad(days) +
                " ngày " +

                W2Y.pad(hours) +
                " giờ " +

                W2Y.pad(minutes) +
                " phút " +

                W2Y.pad(seconds) +
                " giây"

        };

    };


    /* ========================================================
       17. FORMAT NGÀY GIỜ VIỆT NAM
       ======================================================== */

    W2Y.formatVietnamDateTime = function (
        timestamp
    ) {

        const number =
            W2Y.toNumber(
                timestamp
            );

        if (
            number === null
        ) {
            return "";
        }


        const date =
            new Date(
                number * 1000
            );


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return "";
        }


        try {

            return date.toLocaleString(
                "vi-VN",
                {

                    weekday:
                        "long",

                    day:
                        "2-digit",

                    month:
                        "2-digit",

                    year:
                        "numeric",

                    hour:
                        "2-digit",

                    minute:
                        "2-digit",

                    second:
                        "2-digit",

                    timeZone:
                        "Asia/Ho_Chi_Minh"

                }
            );

        }
        catch (error) {

            return date.toLocaleString(
                "vi-VN"
            );

        }

    };


    /* ========================================================
       18. FORMAT NGÀY GIỜ NGẮN
       ======================================================== */

    W2Y.formatVietnamShort = function (
        timestamp
    ) {

        const number =
            W2Y.toNumber(
                timestamp
            );

        if (
            number === null
        ) {
            return "";
        }


        const date =
            new Date(
                number * 1000
            );


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return "";
        }


        try {

            return date.toLocaleString(
                "vi-VN",
                {

                    day:
                        "2-digit",

                    month:
                        "2-digit",

                    year:
                        "numeric",

                    hour:
                        "2-digit",

                    minute:
                        "2-digit",

                    timeZone:
                        "Asia/Ho_Chi_Minh"

                }
            );

        }
        catch (error) {

            return date.toLocaleString(
                "vi-VN"
            );

        }

    };


    /* ========================================================
       19. TRẠNG THÁI HIỂN THỊ
       ======================================================== */

    W2Y.getState = function (data) {

        if (!data) {
            return "UNKNOWN";
        }


        const status =
            W2Y.getAnimeStatus(data);


        if (
            status ===
            "FINISHED"
        ) {

            return "FINISHED";

        }


        if (
            status ===
            "NOT_YET_RELEASED"
        ) {

            return "NOT_YET";

        }


        if (
            status ===
            "RELEASING"
        ) {

            return "RELEASING";

        }


        return "UNKNOWN";

    };


    /* ========================================================
       20. TEXT TRẠNG THÁI
       ======================================================== */

    W2Y.getStateText = function (state) {

        switch (state) {

            case "FINISHED":

                return W2Y.text.finished;


            case "RELEASING":

                return W2Y.text.releasing;


            case "NOT_YET":

                return W2Y.text.notYet;


            default:

                return W2Y.text.unknown;

        }

    };


    /* ========================================================
       21. KIỂM TRA DỮ LIỆU CÓ THAY ĐỔI KHÔNG
       ======================================================== */

    W2Y.getDataSignature = function (data) {

        if (!data) {
            return "";
        }


        const next =
            W2Y.getNextAiring(data);


        return JSON.stringify({

            id:
                W2Y.getAnimeId(data),

            status:
                W2Y.getAnimeStatus(data),

            episodes:
                W2Y.getTotalEpisodes(data),

            nextEpisode:
                next
                    ? next.episode
                    : null,

            airingAt:
                next
                    ? next.airingAt
                    : null,

            updatedAt:
                data.updatedAt || null

        });

    };


    /* ========================================================
       22. SO SÁNH DỮ LIỆU
       ======================================================== */

    W2Y.hasDataChanged = function (data) {

        const signature =
            W2Y.getDataSignature(
                data
            );


        if (
            !W2Y.state.dataSignature
        ) {

            W2Y.state.dataSignature =
                signature;

            return true;

        }


        if (
            W2Y.state.dataSignature !==
            signature
        ) {

            W2Y.state.dataSignature =
                signature;

            return true;

        }


        return false;

    };


    /* ========================================================
       23. KIỂM TRA ID ĐÚNG KHÔNG
       ======================================================== */

    W2Y.isCorrectAnime = function (data) {

        const expectedId =
            W2Y.toNumber(
                W2Y.animeId
            );

        const receivedId =
            W2Y.getAnimeId(
                data
            );


        if (
            expectedId === null ||
            receivedId === null
        ) {
            return false;
        }


        return (
            expectedId ===
            receivedId
        );

    };


    /* ========================================================
       24. NORMALIZE HOÀN CHỈNH
       ======================================================== */

    W2Y.normalizeAnime = function (data) {

        if (
            !data ||
            typeof data !== "object"
        ) {
            return null;
        }


        if (
            !W2Y.isCorrectAnime(data)
        ) {

            console.warn(
                "WHY2YUE: AniList ID không khớp.",
                {
                    expected:
                        W2Y.animeId,

                    received:
                        data.id
                }
            );

            return null;

        }


        const next =
            W2Y.getNextAiring(
                data
            );


        const normalized = {

            id:
                W2Y.getAnimeId(
                    data
                ),

            name:
                W2Y.getAnimeName(
                    data
                ),

            title:
                data.title || {},

            status:
                W2Y.getAnimeStatus(
                    data
                ),

            episodes:
                W2Y.getTotalEpisodes(
                    data
                ),

            currentEpisode:
                W2Y.getCurrentEpisode(
                    data
                ),

            nextEpisode:
                next
                    ? next.episode
                    : null,

            airingAt:
                next
                    ? next.airingAt
                    : null,

            airingTimestamp:
                next
                    ? next.timestamp
                    : null,

            nextAiring:
                next,

            startDate:
                data.startDate || null,

            endDate:
                data.endDate || null,

            updatedAt:
                data.updatedAt || null

        };


        normalized.state =
            W2Y.getState(
                normalized
            );


        return normalized;

    };


    /* ========================================================
       25. PART 2 READY
       ======================================================== */

    W2Y.part2Ready = true;


    console.log(
        "WHY2YUE: Countdown P2 ready."
    );

})();

/* ============================================================
   WHY2YUE — COUNTDOWN.JS
   P3/3 — ENGINE + RENDER + REALTIME + R2 REFRESH
   ============================================================ */

(function () {

    "use strict";

    const W2Y =
        window.W2YCountdown;


    if (!W2Y) {

        console.error(
            "WHY2YUE: Countdown engine chưa được khởi tạo."
        );

        return;

    }


    /* ========================================================
       1. ELEMENT HELPER
       ======================================================== */

    W2Y.$ =
    function (selector) {

        if (!W2Y.box) {
            return null;
        }

        return W2Y.box.querySelector(
            selector
        );

    };


    /* ========================================================
       2. TẠO / LẤY ELEMENT
       ======================================================== */

    W2Y.elements = {

        title: null,

        current: null,

        next: null,

        timer: null,

        release: null,

        status: null,

        progress: null,

        state: null

    };


    W2Y.prepareElements =
    function () {

        /*
         * Ưu tiên ID nếu card của bạn có sẵn.
         */

        W2Y.elements.title =
            W2Y.box.querySelector(
                "#w2y-title"
            );

        W2Y.elements.current =
            W2Y.box.querySelector(
                "#w2y-current"
            );

        W2Y.elements.next =
            W2Y.box.querySelector(
                "#w2y-next"
            );

        W2Y.elements.timer =
            W2Y.box.querySelector(
                "#w2y-timer"
            );

        W2Y.elements.release =
            W2Y.box.querySelector(
                "#w2y-release"
            );

        W2Y.elements.status =
            W2Y.box.querySelector(
                "#w2y-count-status"
            );

        W2Y.elements.progress =
            W2Y.box.querySelector(
                "#w2y-progress-bar"
            );

        W2Y.elements.state =
            W2Y.box.querySelector(
                "#w2y-state"
            );

    };


    W2Y.prepareElements();


    /* ========================================================
       3. SET TEXT AN TOÀN
       ======================================================== */

    W2Y.setText =
    function (element, value) {

        if (!element) {
            return;
        }

        element.textContent =
            value === null ||
            value === undefined
                ? ""
                : String(value);

    };


    /* ========================================================
       4. HIỂN THỊ LOADING
       ======================================================== */

    W2Y.renderLoading =
    function () {

        const e =
            W2Y.elements;


        W2Y.setText(
            e.timer,
            W2Y.text.loading
        );


        W2Y.setText(
            e.release,
            ""
        );


        W2Y.setText(
            e.status,
            W2Y.text.loading
        );

    };


    /* ========================================================
       5. HIỂN THỊ LỖI
       ======================================================== */

    W2Y.renderError =
    function () {

        const e =
            W2Y.elements;


        /*
         * Nếu đã có dữ liệu cũ thì KHÔNG
         * xóa countdown hiện tại.
         */

        if (
            W2Y.state.anime
        ) {

            W2Y.setText(
                e.status,
                W2Y.text.oldData
            );

            return;

        }


        W2Y.setText(
            e.timer,
            W2Y.text.error
        );


        W2Y.setText(
            e.release,
            ""
        );


        W2Y.setText(
            e.status,
            W2Y.text.error
        );

    };


    /* ========================================================
       6. HIỂN THỊ THÔNG TIN CHUNG
       ======================================================== */

    W2Y.renderBasic =
    function (anime) {

        const e =
            W2Y.elements;


        if (!anime) {
            return;
        }


        /*
         * Tên anime nếu card có element này.
         */

        W2Y.setText(
            e.title,
            anime.name
        );


        /*
         * Tập hiện tại.
         */

        if (
            anime.currentEpisode !== null
        ) {

            W2Y.setText(
                e.current,
                anime.currentEpisode
            );

        }


        /*
         * Tập tiếp theo.
         */

        if (
            anime.nextEpisode !== null
        ) {

            W2Y.setText(
                e.next,
                anime.nextEpisode
            );

        }
        else {

            W2Y.setText(
                e.next,
                "—"
            );

        }


        /*
         * Trạng thái.
         */

        W2Y.setText(
            e.state,
            W2Y.getStateText(
                anime.state
            )
        );

    };


    /* ========================================================
       7. HIỂN THỊ ANIME ĐÃ HOÀN THÀNH
       ======================================================== */

    W2Y.renderFinished =
    function (anime) {

        const e =
            W2Y.elements;


        W2Y.stopCountdown();


        /*
         * Nếu có tổng số tập thì đây chính
         * là tập cuối.
         */

        if (
            anime.episodes !== null
        ) {

            W2Y.setText(
                e.current,
                anime.episodes
            );

        }


        W2Y.setText(
            e.next,
            "✓"
        );


        W2Y.setText(
            e.timer,
            W2Y.text.finished
        );


        W2Y.setText(
            e.release,
            anime.endDate
                ? W2Y.formatEndDate(
                    anime.endDate
                )
                : ""
        );


        W2Y.setText(
            e.status,
            W2Y.text.updated
        );


        if (e.progress) {

            e.progress.style.width =
                "100%";

        }


        W2Y.box.dataset.state =
            "finished";

    };


    /* ========================================================
       8. FORMAT NGÀY KẾT THÚC
       ======================================================== */

    W2Y.formatEndDate =
    function (dateObject) {

        if (
            !dateObject ||
            !dateObject.year ||
            !dateObject.month ||
            !dateObject.day
        ) {

            return "";

        }


        try {

            const date =
                new Date(
                    Date.UTC(
                        Number(
                            dateObject.year
                        ),

                        Number(
                            dateObject.month
                        ) - 1,

                        Number(
                            dateObject.day
                        ),

                        0,

                        0,

                        0
                    )
                );


            return (
                "Kết thúc: " +
                date.toLocaleDateString(
                    "vi-VN",
                    {
                        day:
                            "2-digit",

                        month:
                            "2-digit",

                        year:
                            "numeric",

                        timeZone:
                            "Asia/Ho_Chi_Minh"
                    }
                )
            );

        }
        catch (error) {

            return "";

        }

    };


    /* ========================================================
       9. HIỂN THỊ CHƯA CÓ LỊCH
       ======================================================== */

    W2Y.renderNoSchedule =
    function (anime) {

        const e =
            W2Y.elements;


        W2Y.stopCountdown();


        W2Y.setText(
            e.next,
            "—"
        );


        W2Y.setText(
            e.timer,
            W2Y.text.noSchedule
        );


        W2Y.setText(
            e.release,
            W2Y.text.waiting
        );


        W2Y.setText(
            e.status,
            W2Y.text.updated
        );


        if (e.progress) {

            e.progress.style.width =
                "0%";

        }


        W2Y.box.dataset.state =
            anime.state;

    };


    /* ========================================================
       10. HIỂN THỊ LỊCH TẬP
       ======================================================== */

    W2Y.renderSchedule =
    function (anime) {

        const e =
            W2Y.elements;


        if (
            anime.nextEpisode === null ||
            anime.airingAt === null
        ) {

            W2Y.renderNoSchedule(
                anime
            );

            return;

        }


        W2Y.setText(
            e.next,
            anime.nextEpisode
        );


        /*
         * Luôn hiển thị giờ Việt Nam.
         */

        W2Y.setText(
            e.release,
            "Dự kiến phát: " +
            W2Y.formatVietnamDateTime(
                anime.airingAt
            )
        );


        W2Y.setText(
            e.status,
            W2Y.text.updated
        );


        W2Y.box.dataset.state =
            anime.state;


        W2Y.startCountdown(
            anime.airingAt
        );

    };


    /* ========================================================
       11. RENDER TOÀN BỘ ANIME
       ======================================================== */

    W2Y.render =
    function (data) {

        const anime =
            W2Y.normalizeAnime(
                data
            );


        if (!anime) {

            W2Y.renderError();

            return false;

        }


        W2Y.state.anime =
            anime;


        W2Y.state.currentState =
            anime.state;


        W2Y.renderBasic(
            anime
        );


        /*
         * FINISHED
         */

        if (
            anime.state ===
            "FINISHED"
        ) {

            W2Y.renderFinished(
                anime
            );

            return true;

        }


        /*
         * RELEASING / NOT_YET_RELEASED
         */

        W2Y.renderSchedule(
            anime
        );


        return true;

    };


    /* ========================================================
       12. DỪNG COUNTDOWN
       ======================================================== */

    W2Y.stopCountdown =
    function () {

        if (
            W2Y.state.timer
        ) {

            clearInterval(
                W2Y.state.timer
            );

            W2Y.state.timer =
                null;

        }

    };


    /* ========================================================
       13. START COUNTDOWN
       ======================================================== */

    W2Y.startCountdown =
    function (airingAt) {

        W2Y.stopCountdown();


        const target =
            Number(
                airingAt
            ) * 1000;


        if (
            !Number.isFinite(
                target
            ) ||
            target <= 0
        ) {

            return;

        }


        /*
         * Lưu thời gian đang theo dõi.
         */

        W2Y.state.airingAt =
            Number(
                airingAt
            );


        let checkingAfterFinish =
            false;


        function update() {

            const remaining =
                target -
                Date.now();


            /*
             * ================================================
             * COUNTDOWN ĐÃ VỀ 0
             * ================================================
             */

            if (
                remaining <= 0
            ) {

                W2Y.setText(
                    W2Y.elements.timer,
                    "Đã đến giờ phát"
                );


                if (
                    W2Y.elements.progress
                ) {

                    W2Y.elements.progress.style.width =
                        "100%";

                }


                /*
                 * Tuyệt đối KHÔNG tự tăng tập.
                 *
                 * Chờ R2 xác nhận dữ liệu mới.
                 */

                if (
                    !checkingAfterFinish
                ) {

                    checkingAfterFinish =
                        true;


                    W2Y.stopCountdown();


                    /*
                     * Kiểm tra ngay một lần.
                     */

                    W2Y.refreshData(
                        true
                    );


                    /*
                     * Nếu R2 chưa cập nhật,
                     * kiểm tra lại sau 30 giây.
                     */

                    W2Y.state.postAirCheck =
                        setTimeout(
                            function () {

                                checkingAfterFinish =
                                    false;

                                W2Y.refreshData(
                                    true
                                );

                            },
                            30000
                        );

                }

                return;

            }


            /*
             * ================================================
             * ĐANG ĐẾM
             * ================================================
             */

            const formatted =
                W2Y.formatCountdown(
                    remaining
                );


            W2Y.setText(
                W2Y.elements.timer,
                formatted.text
            );


            /*
             * Không dùng progress giả.
             *
             * Nếu không biết thời lượng giữa
             * 2 tập thì không thể tính % chính xác.
             */

            if (
                W2Y.elements.progress
            ) {

                W2Y.elements.progress.style.width =
                    "100%";

            }

        }


        update();


        W2Y.state.timer =
            setInterval(
                update,
                1000
            );

    };


    /* ========================================================
       14. KIỂM TRA DỮ LIỆU MỚI
       ======================================================== */

    W2Y.refreshData =
    async function (force) {

        if (
            W2Y.state.refreshing
        ) {

            return;

        }


        W2Y.state.refreshing =
            true;


        try {

            const data =
                await W2Y.loadAnime();


            /*
             * R2 lỗi.
             *
             * Nếu có dữ liệu cũ thì giữ nguyên.
             */

            if (!data) {

                W2Y.renderError();

                return;

            }


            /*
             * Kiểm tra ID.
             */

            if (
                !W2Y.isCorrectAnime(
                    data
                )
            ) {

                console.error(
                    "WHY2YUE: R2 trả về sai AniList ID."
                );

                W2Y.renderError();

                return;

            }


            /*
             * Xác định JSON có thay đổi
             * thực sự hay không.
             */

            const changed =
                W2Y.hasDataChanged(
                    data
                );


            /*
             * Nếu dữ liệu giống hệt nhau
             * thì giữ countdown hiện tại.
             */

            if (
                !changed &&
                !force
            ) {

                return;

            }


            /*
             * Nếu có dữ liệu mới,
             * render lại.
             */

            W2Y.render(
                data
            );


        }
        catch (error) {

            console.error(
                "WHY2YUE: refreshData error:",
                error
            );


            /*
             * Không làm trắng card nếu
             * trước đó đã có dữ liệu.
             */

            W2Y.renderError();

        }
        finally {

            W2Y.state.refreshing =
                false;

        }

    };


    /* ========================================================
       15. TỰ ĐỘNG REFRESH R2
       ======================================================== */

    W2Y.startRefresh =
    function () {

        if (
            W2Y.state.refreshTimer
        ) {

            clearInterval(
                W2Y.state.refreshTimer
            );

        }


        W2Y.state.refreshTimer =
            setInterval(
                function () {

                    W2Y.refreshData(
                        false
                    );

                },
                W2Y.config.refreshInterval
            );

    };


    /* ========================================================
       16. STOP ENGINE
       ======================================================== */

    W2Y.destroy =
    function () {

        W2Y.stopCountdown();


        if (
            W2Y.state.refreshTimer
        ) {

            clearInterval(
                W2Y.state.refreshTimer
            );

            W2Y.state.refreshTimer =
                null;

        }


        if (
            W2Y.state.postAirCheck
        ) {

            clearTimeout(
                W2Y.state.postAirCheck
            );

            W2Y.state.postAirCheck =
                null;

        }


        W2Y.state.destroyed =
            true;

    };


    /* ========================================================
       17. KHỞI ĐỘNG
       ======================================================== */

    W2Y.init =
    async function () {

        if (
            W2Y.state.destroyed
        ) {

            return;

        }


        W2Y.renderLoading();


        /*
         * Lấy dữ liệu lần đầu.
         */

        await W2Y.refreshData(
            true
        );


        /*
         * Sau đó cứ 5 phút kiểm tra R2.
         */

        W2Y.startRefresh();

    };


    /* ========================================================
       18. CHỜ DOM
       ======================================================== */

    function boot() {

        if (
            !W2Y.box
        ) {

            return;

        }


        W2Y.init();

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once: true
            }
        );

    }
    else {

        boot();

    }


    /* ========================================================
       19. READY
       ======================================================== */

    W2Y.part3Ready =
        true;


    console.log(
        "WHY2YUE: Countdown P3 ready."
    );

})();
