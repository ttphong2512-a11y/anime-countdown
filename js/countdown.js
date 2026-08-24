<script>
(function () {

"use strict";

/* =========================================================
   WHY2YUE — COUNTDOWN ENGINE
   COUNTDOWN.JS
   PART 1/3

   NHIỆM VỤ:

   Blogger
      ↓
   AniList ID
      ↓
   Cloudflare R2
      ↓
   /anime/{ID}.json
      ↓
   dữ liệu anime
      ↓
   state nội bộ

   KHÔNG nhập URL JSON cho từng anime.

   Chỉ cần:

   <div
      id="anime-countdown"
      data-anilist-id="21"
   ></div>

   ========================================================= */


/* =========================================================
   1. GLOBAL ENGINE
   ========================================================= */

window.W2YCountdown =
window.W2YCountdown || {};

const W2Y =
window.W2YCountdown;


/* =========================================================
   2. CONFIG
   ========================================================= */

W2Y.config = {

    /*
     * R2 public URL.
     *
     * Không ghi /21.json ở đây.
     *
     * Engine tự tạo:
     *
     * /anime/21.json
     * /anime/196017.json
     * ...
     */

    r2Base:
        "https://pub-fb649c225b4545dd8132b2744f70af24.r2.dev/anime",


    /*
     * Kiểm tra R2 mỗi 5 phút.
     */

    refreshInterval:
        5 * 60 * 1000,


    /*
     * Timeout mỗi request.
     */

    requestTimeout:
        15000,


    /*
     * Nếu R2 lỗi,
     * dữ liệu localStorage cũ vẫn được dùng.
     */

    localStoragePrefix:
        "w2y_anime_cache_",


    /*
     * Ngôn ngữ mặc định.
     */

    defaultLanguage:
        "vi",


    /*
     * Múi giờ Việt Nam.
     */

    vietnamTimezone:
        "Asia/Ho_Chi_Minh"

};


/* =========================================================
   3. FIND CARD
   ========================================================= */

W2Y.box =
document.getElementById(
    "anime-countdown"
);


/*
 * Nếu trang chưa có countdown
 * thì không làm gì.
 */

if (!W2Y.box) {

    console.warn(
        "WHY2YUE: #anime-countdown không tồn tại."
    );

    return;

}


/* =========================================================
   4. GET ANILIST ID
   ========================================================= */

W2Y.animeId =
String(
    W2Y.box.dataset.anilistId || ""
).trim();


/*
 * AniList ID bắt buộc.
 */

if (!W2Y.animeId) {

    console.error(
        "WHY2YUE: Thiếu data-anilist-id."
    );

    W2Y.box.setAttribute(
        "data-w2y-error",
        "missing-anilist-id"
    );

    return;

}


/* =========================================================
   5. VALIDATE ID
   ========================================================= */

if (
    !/^\d+$/.test(
        W2Y.animeId
    )
) {

    console.error(
        "WHY2YUE: AniList ID không hợp lệ:",
        W2Y.animeId
    );

    return;

}


/* =========================================================
   6. ELEMENT HELPER
   ========================================================= */

W2Y.$ =
function (selector) {

    return W2Y.box.querySelector(
        selector
    );

};


/* =========================================================
   7. CARD ELEMENTS
   ========================================================= */

W2Y.elements = {

    current:
        W2Y.$(
            "[data-w2y-current]"
        ),

    next:
        W2Y.$(
            "[data-w2y-next]"
        ),

    timer:
        W2Y.$(
            "[data-w2y-timer]"
        ),

    release:
        W2Y.$(
            "[data-w2y-release]"
        ),

    status:
        W2Y.$(
            "[data-w2y-status]"
        ),

    progress:
        W2Y.$(
            "[data-w2y-progress]"
        )

};


/* =========================================================
   8. FALLBACK ELEMENT ID
   =========================================================
   
   Cho phép card cũ dùng ID:

   #w2y-current
   #w2y-next
   #w2y-timer
   #w2y-release
   #w2y-count-status
   #w2y-progress-bar

   ========================================================= */

if (!W2Y.elements.current) {

    W2Y.elements.current =
    document.getElementById(
        "w2y-current"
    );

}

if (!W2Y.elements.next) {

    W2Y.elements.next =
    document.getElementById(
        "w2y-next"
    );

}

if (!W2Y.elements.timer) {

    W2Y.elements.timer =
    document.getElementById(
        "w2y-timer"
    );

}

if (!W2Y.elements.release) {

    W2Y.elements.release =
    document.getElementById(
        "w2y-release"
    );

}

if (!W2Y.elements.status) {

    W2Y.elements.status =
    document.getElementById(
        "w2y-count-status"
    );

}

if (!W2Y.elements.progress) {

    W2Y.elements.progress =
    document.getElementById(
        "w2y-progress-bar"
    );

}


/* =========================================================
   9. LANGUAGE
   ========================================================= */

W2Y.lang =
W2Y.box.dataset.lang ||
document.documentElement
    .getAttribute("lang") ||
localStorage.getItem("lang") ||
W2Y.config.defaultLanguage;


/* =========================================================
   10. SUPPORTED LANGUAGES
   ========================================================= */

W2Y.languages = [

    "vi",
    "en",
    "ja",
    "th",
    "id",
    "es",
    "pt",
    "fr",
    "ko",
    "zh-CN"

];


if (
    !W2Y.languages.includes(
        W2Y.lang
    )
) {

    W2Y.lang =
    W2Y.config.defaultLanguage;

}


/* =========================================================
   11. CREATE R2 URL
   ========================================================= */

W2Y.getR2Url =
function () {

    /*
     * Cho phép card override:
     *
     * data-r2-url="..."
     *
     * Nhưng bình thường KHÔNG cần.
     */

    const custom =
    W2Y.box.dataset.r2Url;


    if (
        custom &&
        custom.trim()
    ) {

        return custom.trim();

    }


    /*
     * URL mặc định:
     *
     * https://...r2.dev/anime/21.json
     */

    return (
        W2Y.config.r2Base
            .replace(/\/+$/, "") +
        "/" +
        encodeURIComponent(
            W2Y.animeId
        ) +
        ".json"
    );

};


/* =========================================================
   12. LOCAL CACHE KEY
   ========================================================= */

W2Y.getStorageKey =
function () {

    return (
        W2Y.config.localStoragePrefix +
        W2Y.animeId
    );

};


/* =========================================================
   13. SAVE LOCAL CACHE
   ========================================================= */

W2Y.saveLocal =
function (data) {

    try {

        localStorage.setItem(

            W2Y.getStorageKey(),

            JSON.stringify({

                savedAt:
                    Date.now(),

                data:
                    data

            })

        );

    }
    catch (error) {

        console.warn(
            "WHY2YUE: Không thể lưu local cache.",
            error
        );

    }

};


/* =========================================================
   14. LOAD LOCAL CACHE
   ========================================================= */

W2Y.loadLocal =
function () {

    try {

        const raw =
        localStorage.getItem(
            W2Y.getStorageKey()
        );


        if (!raw) {

            return null;

        }


        const parsed =
        JSON.parse(raw);


        if (
            !parsed ||
            !parsed.data
        ) {

            return null;

        }


        return parsed.data;

    }
    catch (error) {

        console.warn(
            "WHY2YUE: Local cache không hợp lệ.",
            error
        );

        return null;

    }

};


/* =========================================================
   15. FETCH WITH TIMEOUT
   ========================================================= */

W2Y.fetchJSON =
async function (url) {

    const controller =
    new AbortController();


    const timeout =
    setTimeout(

        function () {

            controller.abort();

        },

        W2Y.config.requestTimeout

    );


    try {

        /*
         * Query timestamp để tránh browser/CDN
         * giữ bản JSON cũ.
         */

        const separator =
        url.includes("?")
            ? "&"
            : "?";


        const requestURL =
        url +
        separator +
        "_w2y=" +
        Date.now();


        const response =
        await fetch(

            requestURL,

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


        if (
            !response.ok
        ) {

            throw new Error(
                "R2 HTTP " +
                response.status
            );

        }


        const data =
        await response.json();


        if (
            !data ||
            typeof data !== "object"
        ) {

            throw new Error(
                "JSON R2 không hợp lệ."
            );

        }


        /*
         * Kiểm tra ID.
         *
         * Nếu trang là ID 21 mà R2 trả
         * JSON của ID khác → từ chối.
         */

        if (
            data.id !== undefined &&
            String(data.id) !==
            W2Y.animeId
        ) {

            throw new Error(
                "R2 trả sai AniList ID."
            );

        }


        return data;

    }
    finally {

        clearTimeout(
            timeout
        );

    }

};


/* =========================================================
   16. LOAD R2
   ========================================================= */

W2Y.loadR2 =
async function () {

    const url =
    W2Y.getR2Url();


    if (!url) {

        throw new Error(
            "Không tạo được R2 URL."
        );

    }


    return await W2Y.fetchJSON(
        url
    );

};


/* =========================================================
   17. NORMALIZE
   ========================================================= */

W2Y.normalize =
function (data) {

    if (
        !data ||
        typeof data !== "object"
    ) {

        return null;

    }


    const episodes =
    Number(data.episodes);


    const duration =
    Number(data.duration);


    const result = {

        id:
            Number(data.id) || 0,

        title:
            data.title || {},

        status:
            String(
                data.status || "UNKNOWN"
            ).toUpperCase(),

        episodes:
            Number.isFinite(
                episodes
            )
                ? episodes
                : null,

        duration:
            Number.isFinite(
                duration
            )
                ? duration
                : null,

        startDate:
            data.startDate || null,

        endDate:
            data.endDate || null,

        season:
            data.season || null,

        seasonYear:
            data.seasonYear || null,

        updatedAt:
            Number(data.updatedAt) || null,

        nextAiringEpisode:
            data.nextAiringEpisode || null

    };


    return result;

};


/* =========================================================
   18. VALIDATE NEXT AIRING
   ========================================================= */

W2Y.getNextAiring =
function (anime) {

    if (!anime) {

        return null;

    }


    const next =
    anime.nextAiringEpisode;


    if (!next) {

        return null;

    }


    const episode =
    Number(next.episode);


    const airingAt =
    Number(next.airingAt);


    if (
        !Number.isFinite(episode) ||
        episode <= 0 ||
        !Number.isFinite(airingAt) ||
        airingAt <= 0
    ) {

        return null;

    }


    return {

        episode:
            episode,

        airingAt:
            airingAt,

        timestamp:
            airingAt * 1000

    };

};


/* =========================================================
   19. STATE
   ========================================================= */

W2Y.state = {

    anime:
        null,

    source:
        null,

    lastDataSignature:
        null,

    nextAiringSignature:
        null,

    countdownTarget:
        null,

    countdownTimer:
        null,

    refreshTimer:
        null,

    refreshing:
        false,

    waitingForR2AfterAir:
        false,

    destroyed:
        false

};


/* =========================================================
   20. PART 1 READY
   ========================================================= */

W2Y.part1Ready =
true;


})();
</script>


<script>
(function () {

"use strict";

const W2Y =
window.W2YCountdown;


/* =========================================================
   WHY2YUE — COUNTDOWN ENGINE
   PART 2/3

   FORMAT + STATE + RENDER
   ========================================================= */


/* =========================================================
   1. TEXT
   ========================================================= */

W2Y.text = {

    loading:
        "Đang tải dữ liệu anime...",

    connecting:
        "Đang kết nối Cloudflare R2...",

    next:
        "Tập tiếp theo",

    current:
        "Tập hiện tại",

    completed:
        "Đã hoàn thành",

    notYet:
        "Chưa phát sóng",

    releasing:
        "Đang phát sóng",

    unknown:
        "Chưa xác định",

    noSchedule:
        "Chưa có lịch phát",

    waiting:
        "Đang chờ dữ liệu mới từ R2",

    expired:
        "Đã đến giờ phát",

    updated:
        "Đã cập nhật từ Cloudflare R2",

    oldData:
        "R2 tạm thời lỗi — đang dùng dữ liệu trước đó.",

    noData:
        "Chưa lấy được dữ liệu anime.",

    days:
        "ngày",

    hours:
        "giờ",

    minutes:
        "phút",

    seconds:
        "giây"

};


/* =========================================================
   2. ESCAPE
   ========================================================= */

W2Y.escapeHTML =
function (value) {

    return String(
        value ?? ""
    )
    .replace(
        /&/g,
        "&amp;"
    )
    .replace(
        /</g,
        "&lt;"
    )
    .replace(
        />/g,
        "&gt;"
    )
    .replace(
        /"/g,
        "&quot;"
    )
    .replace(
        /'/g,
        "&#039;"
    );

};


/* =========================================================
   3. PAD
   ========================================================= */

W2Y.pad =
function (value) {

    return String(
        Math.max(
            0,
            Math.floor(
                Number(value) || 0
            )
        )
    ).padStart(
        2,
        "0"
    );

};


/* =========================================================
   4. COUNTDOWN TEXT
   ========================================================= */

W2Y.formatCountdown =
function (distance) {

    let seconds =
    Math.max(
        0,
        Math.floor(
            distance / 1000
        )
    );


    const days =
    Math.floor(
        seconds / 86400
    );


    seconds %=
    86400;


    const hours =
    Math.floor(
        seconds / 3600
    );


    seconds %=
    3600;


    const minutes =
    Math.floor(
        seconds / 60
    );


    seconds %=
    60;


    return (
        W2Y.pad(days) +
        " ngày " +

        W2Y.pad(hours) +
        " giờ " +

        W2Y.pad(minutes) +
        " phút " +

        W2Y.pad(seconds) +
        " giây"
    );

};


/* =========================================================
   5. VIETNAM DATE
   ========================================================= */

W2Y.formatVietnamDate =
function (timestamp) {

    const date =
    new Date(
        Number(timestamp)
    );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    return date.toLocaleString(

        "vi-VN",

        {

            timeZone:
                W2Y.config.vietnamTimezone,

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

            hour12:
                false

        }

    );

};


/* =========================================================
   6. GET CURRENT EPISODE
   =========================================================

   Ví dụ:

   nextAiringEpisode:
       episode = 1175

   → current = 1174

   Khi AniList báo tập 1176:

   → current = 1175

   KHÔNG tự tăng khi countdown về 0.

   ========================================================= */

W2Y.getCurrentEpisode =
function (anime) {

    if (!anime) {

        return null;

    }


    /*
     * Anime đang có tập tiếp theo.
     */

    const next =
    W2Y.getNextAiring(
        anime
    );


    if (next) {

        return Math.max(
            0,
            next.episode - 1
        );

    }


    /*
     * Anime FINISHED.
     */

    if (
        anime.status ===
        "FINISHED"
    ) {

        const total =
        Number(
            anime.episodes
        );


        if (
            Number.isFinite(total) &&
            total >= 0
        ) {

            return total;

        }

    }


    return null;

};


/* =========================================================
   7. GET STATUS
   ========================================================= */

W2Y.getStatusText =
function (anime) {

    if (!anime) {

        return W2Y.text.unknown;

    }


    switch (
        anime.status
    ) {

        case "FINISHED":

            return W2Y.text.completed;


        case "NOT_YET_RELEASED":

            return W2Y.text.notYet;


        case "RELEASING":

            return W2Y.text.releasing;


        default:

            return W2Y.text.unknown;

    }

};


/* =========================================================
   8. DATA SIGNATURE
   =========================================================

   Dùng để phát hiện JSON có thay đổi.

   Nếu:

   episode = 1175
   airingAt = X
   updatedAt = Y

   không đổi → không restart countdown.

   ========================================================= */

W2Y.getDataSignature =
function (anime) {

    if (!anime) {

        return "";

    }


    const next =
    W2Y.getNextAiring(
        anime
    );


    return JSON.stringify({

        id:
            anime.id,

        status:
            anime.status,

        episodes:
            anime.episodes,

        updatedAt:
            anime.updatedAt,

        nextEpisode:
            next
                ? next.episode
                : null,

        airingAt:
            next
                ? next.airingAt
                : null

    });

};


/* =========================================================
   9. SET TEXT
   ========================================================= */

W2Y.setText =
function (element, value) {

    if (element) {

        element.textContent =
        value;

    }

};


/* =========================================================
   10. SET STATUS
   ========================================================= */

W2Y.setStatus =
function (value) {

    W2Y.setText(
        W2Y.elements.status,
        value
    );

};


/* =========================================================
   11. SET PROGRESS
   ========================================================= */

W2Y.setProgress =
function (value) {

    if (
        !W2Y.elements.progress
    ) {

        return;

    }


    const percent =
    Math.max(
        0,
        Math.min(
            100,
            Number(value) || 0
        )
    );


    /*
     * Hỗ trợ cả:

     * width element
     *
     * hoặc progress element.
     */

    W2Y.elements.progress.style.width =
    percent + "%";

};


/* =========================================================
   12. STOP TIMER
   ========================================================= */

W2Y.stopTimer =
function () {

    if (
        W2Y.state.countdownTimer
    ) {

        clearInterval(
            W2Y.state.countdownTimer
        );

        W2Y.state.countdownTimer =
        null;

    }

};


/* =========================================================
   13. RENDER FINISHED
   ========================================================= */

W2Y.renderFinished =
function (anime) {

    W2Y.stopTimer();


    const current =
    W2Y.getCurrentEpisode(
        anime
    );


    W2Y.setText(

        W2Y.elements.current,

        current !== null
            ? current
            : "—"

    );


    W2Y.setText(

        W2Y.elements.next,

        "✓"

    );


    W2Y.setText(

        W2Y.elements.timer,

        W2Y.text.completed

    );


    W2Y.setText(

        W2Y.elements.release,

        anime.endDate
            ? (
                "Đã kết thúc — " +
                W2Y.formatDateFromParts(
                    anime.endDate
                )
            )
            : W2Y.text.completed

    );


    W2Y.setProgress(
        100
    );


    W2Y.setStatus(
        W2Y.text.updated
    );

};


/* =========================================================
   14. FORMAT DATE FROM ANILIST PARTS
   ========================================================= */

W2Y.formatDateFromParts =
function (parts) {

    if (
        !parts ||
        !parts.year ||
        !parts.month ||
        !parts.day
    ) {

        return "";

    }


    /*
     * Ngày AniList không chứa giờ.
     * Chỉ dùng để hiển thị ngày.
     */

    const date =
    new Date(
        Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day)
        )
    );


    return date.toLocaleDateString(
        "vi-VN",
        {

            timeZone:
                W2Y.config.vietnamTimezone,

            day:
                "2-digit",

            month:
                "2-digit",

            year:
                "numeric"

        }
    );

};


/* =========================================================
   15. RENDER NO SCHEDULE
   ========================================================= */

W2Y.renderNoSchedule =
function (anime) {

    W2Y.stopTimer();


    const current =
    W2Y.getCurrentEpisode(
        anime
    );


    W2Y.setText(

        W2Y.elements.current,

        current !== null
            ? current
            : "—"

    );


    W2Y.setText(

        W2Y.elements.next,

        "—"

    );


    W2Y.setText(

        W2Y.elements.timer,

        W2Y.text.noSchedule

    );


    W2Y.setText(

        W2Y.elements.release,

        W2Y.text.waiting

    );


    W2Y.setProgress(
        0
    );


    W2Y.setStatus(
        W2Y.text.updated
    );

};


/* =========================================================
   16. START COUNTDOWN
   ========================================================= */

W2Y.startCountdown =
function (next) {

    W2Y.stopTimer();


    const target =
    next.timestamp;


    W2Y.state.countdownTarget =
    target;


    function tick() {

        /*
         * Lấy giờ hiện tại mỗi giây.
         */

        const now =
        Date.now();


        const remaining =
        target - now;


        /*
         * CHƯA TỚI GIỜ
         */

        if (
            remaining > 0
        ) {

            W2Y.setText(

                W2Y.elements.timer,

                W2Y.formatCountdown(
                    remaining
                )

            );


            W2Y.setText(

                W2Y.elements.release,

                "Dự kiến phát: " +
                W2Y.formatVietnamDate(
                    target
                )

            );


            W2Y.setProgress(
                100
            );


            return;

        }


        /*
         * COUNTDOWN KẾT THÚC.
         *
         * CỰC KỲ QUAN TRỌNG:
         *
         * KHÔNG đổi tập.
         * KHÔNG cộng tập.
         * KHÔNG giả định AniList đã cập nhật.
         */

        W2Y.stopTimer();


        W2Y.state.waitingForR2AfterAir =
        true;


        W2Y.setText(

            W2Y.elements.timer,

            W2Y.text.expired

        );


        W2Y.setText(

            W2Y.elements.release,

            W2Y.text.waiting

        );


        W2Y.setProgress(
            100
        );


        W2Y.setStatus(
            "Đã đến giờ — chờ R2 xác nhận tập mới."
        );


        /*
         * Kiểm tra R2 ngay sau khi countdown kết thúc.
         *
         * Nhưng nếu R2 vẫn trả dữ liệu cũ,
         * card vẫn giữ nguyên.
         */

        setTimeout(
            function () {

                if (
                    !W2Y.state.destroyed
                ) {

                    W2Y.refresh(
                        true
                    );

                }

            },
            5000
        );

    }


    tick();


    W2Y.state.countdownTimer =
    setInterval(
        tick,
        1000
    );

};


/* =========================================================
   17. RENDER RELEASING
   ========================================================= */

W2Y.renderReleasing =
function (anime) {

    const next =
    W2Y.getNextAiring(
        anime
    );


    /*
     * Có lịch tập tiếp.
     */

    if (next) {

        const current =
        Math.max(
            0,
            next.episode - 1
        );


        W2Y.setText(

            W2Y.elements.current,

            current

        );


        W2Y.setText(

            W2Y.elements.next,

            next.episode

        );


        W2Y.setText(

            W2Y.elements.release,

            "Dự kiến phát: " +
            W2Y.formatVietnamDate(
                next.timestamp
            )

        );


        W2Y.setStatus(
            W2Y.text.updated
        );


        /*
         * Nếu đây chính là lịch cũ
         * thì không tạo timer mới.
         */

        const signature =
        String(
            next.episode
        ) +
        "|" +
        String(
            next.airingAt
        );


        if (
            W2Y.state.nextAiringSignature ===
            signature &&
            W2Y.state.countdownTimer
        ) {

            return;

        }


        W2Y.state.nextAiringSignature =
        signature;


        W2Y.state.waitingForR2AfterAir =
        false;


        W2Y.startCountdown(
            next
        );


        return;

    }


    /*
     * RELEASING nhưng AniList chưa có lịch.
     */

    W2Y.renderNoSchedule(
        anime
    );

};


/* =========================================================
   18. RENDER ANIME
   ========================================================= */

W2Y.render =
function (anime, source) {

    if (!anime) {

        return;

    }


    W2Y.state.anime =
    anime;

    W2Y.state.source =
    source || "R2";


    const dataSignature =
    W2Y.getDataSignature(
        anime
    );


    /*
     * Nếu JSON hoàn toàn giống bản trước
     * và countdown đang chạy,
     * không render lại.
     */

    if (
        W2Y.state.lastDataSignature ===
        dataSignature &&
        W2Y.state.countdownTimer
    ) {

        return;

    }


    W2Y.state.lastDataSignature =
    dataSignature;


    /*
     * FINISHED
     */

    if (
        anime.status ===
        "FINISHED"
    ) {

        W2Y.renderFinished(
            anime
        );

        return;

    }


    /*
     * NOT YET
     */

    if (
        anime.status ===
        "NOT_YET_RELEASED"
    ) {

        W2Y.stopTimer();


        W2Y.setText(
            W2Y.elements.current,
            "—"
        );


        W2Y.setText(
            W2Y.elements.next,
            "1"
        );


        W2Y.setText(
            W2Y.elements.timer,
            W2Y.text.notYet
        );


        W2Y.setText(

            W2Y.elements.release,

            anime.startDate
                ? (
                    "Dự kiến bắt đầu: " +
                    W2Y.formatDateFromParts(
                        anime.startDate
                    )
                )
                : W2Y.text.notYet

        );


        W2Y.setProgress(
            0
        );


        W2Y.setStatus(
            W2Y.text.updated
        );


        return;

    }


    /*
     * RELEASING
     */

    if (
        anime.status ===
        "RELEASING"
    ) {

        W2Y.renderReleasing(
            anime
        );

        return;

    }


    /*
     * UNKNOWN
     */

    W2Y.renderNoSchedule(
        anime
    );

};


/* =========================================================
   19. PART 2 READY
   ========================================================= */

W2Y.part2Ready =
true;


})();
</script>


<script>
(function () {

"use strict";

const W2Y =
window.W2YCountdown;


/* =========================================================
   WHY2YUE — COUNTDOWN ENGINE
   PART 3/3

   LOAD + REFRESH + ERROR HANDLING
   ========================================================= */


/* =========================================================
   1. INITIAL RENDER
   ========================================================= */

W2Y.renderLoading =
function () {

    W2Y.setText(

        W2Y.elements.timer,

        W2Y.text.loading

    );


    W2Y.setText(

        W2Y.elements.release,

        W2Y.text.connecting

    );


    W2Y.setStatus(
        W2Y.text.loading
    );

};


/* =========================================================
   2. LOAD LOCAL FALLBACK
   ========================================================= */

W2Y.useLocalFallback =
function () {

    const local =
    W2Y.loadLocal();


    if (!local) {

        return false;

    }


    const anime =
    W2Y.normalize(
        local
    );


    if (!anime) {

        return false;

    }


    W2Y.render(
        anime,
        "local"
    );


    W2Y.setStatus(
        "Đang dùng dữ liệu đã lưu trước đó."
    );


    return true;

};


/* =========================================================
   3. REFRESH R2
   ========================================================= */

W2Y.refresh =
async function (force) {

    /*
     * Không cho hai request chạy cùng lúc.
     */

    if (
        W2Y.state.refreshing
    ) {

        return;

    }


    W2Y.state.refreshing =
    true;


    try {

        const raw =
        await W2Y.loadR2();


        const anime =
        W2Y.normalize(
            raw
        );


        if (!anime) {

            throw new Error(
                "Không thể normalize JSON."
            );

        }


        /*
         * Lưu bản mới vào localStorage.
         */

        W2Y.saveLocal(
            raw
        );


        /*
         * Render.
         *
         * Nếu dữ liệu không đổi,
         * render() sẽ không restart
         * countdown.
         */

        W2Y.render(
            anime,
            "R2"
        );


        /*
         * Nếu countdown trước đó đã hết,
         * nhưng R2 vẫn trả cùng episode,
         * vẫn phải tiếp tục chờ.
         */

        const next =
        W2Y.getNextAiring(
            anime
        );


        if (
            W2Y.state.waitingForR2AfterAir &&
            next
        ) {

            /*
             * Nếu airingAt vẫn là thời điểm cũ
             * thì chưa có dữ liệu mới.
             */

            if (
                next.timestamp <=
                Date.now()
            ) {

                W2Y.setText(

                    W2Y.elements.timer,

                    W2Y.text.expired

                );


                W2Y.setText(

                    W2Y.elements.release,

                    W2Y.text.waiting

                );


                W2Y.setStatus(
                    "R2 chưa có tập mới — tiếp tục chờ."
                );

            }
            else {

                W2Y.state.waitingForR2AfterAir =
                false;

            }

        }


    }
    catch (error) {

        console.warn(
            "WHY2YUE: R2 refresh failed.",
            error
        );


        /*
         * CÓ DỮ LIỆU CŨ:
         *
         * Không phá countdown.
         */

        if (
            W2Y.state.anime
        ) {

            W2Y.setStatus(
                W2Y.text.oldData
            );


            /*
             * Nếu timer đang chạy:
             * không làm gì thêm.
             */

        }
        else {

            /*
             * Chưa từng có R2.
             *
             * Thử localStorage.
             */

            const usedLocal =
            W2Y.useLocalFallback();


            if (!usedLocal) {

                W2Y.setText(

                    W2Y.elements.timer,

                    W2Y.text.noData

                );


                W2Y.setText(

                    W2Y.elements.release,

                    "Không thể kết nối Cloudflare R2."

                );


                W2Y.setStatus(
                    "Kiểm tra R2 URL, CORS hoặc AniList ID."
                );

            }

        }

    }
    finally {

        W2Y.state.refreshing =
        false;

    }

};


/* =========================================================
   4. START REFRESH LOOP
   ========================================================= */

W2Y.startRefreshLoop =
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

            if (
                !W2Y.state.destroyed
            ) {

                W2Y.refresh(
                    false
                );

            }

        },

        W2Y.config.refreshInterval

    );

};


/* =========================================================
   5. DESTROY
   ========================================================= */

W2Y.destroy =
function () {

    W2Y.state.destroyed =
    true;


    W2Y.stopTimer();


    if (
        W2Y.state.refreshTimer
    ) {

        clearInterval(
            W2Y.state.refreshTimer
        );

        W2Y.state.refreshTimer =
        null;

    }

};


/* =========================================================
   6. VISIBILITY
   =========================================================
   
   Nếu người dùng rời tab lâu:
   khi quay lại kiểm tra R2 ngay.
   
   ========================================================= */

document.addEventListener(

    "visibilitychange",

    function () {

        if (
            document.visibilityState ===
            "visible"
        ) {

            W2Y.refresh(
                true
            );

        }

    }

);


/* =========================================================
   7. PAGE UNLOAD
   ========================================================= */

window.addEventListener(

    "pagehide",

    function () {

        W2Y.destroy();

    }

);


/* =========================================================
   8. INITIALIZE
   ========================================================= */

W2Y.renderLoading();


/*
 * Nếu R2 lỗi ngay lần đầu,
 * local cache sẽ được thử.
 */

W2Y.refresh(
    true
);


/*
 * Sau đó cứ 5 phút kiểm tra R2.
 */

W2Y.startRefreshLoop();


/* =========================================================
   9. READY
   ========================================================= */

W2Y.ready =
true;


console.log(
    "WHY2YUE Countdown ready:",
    {
        anilistId:
            W2Y.animeId,

        r2:
            W2Y.getR2Url()
    }
);


})();
</script>
