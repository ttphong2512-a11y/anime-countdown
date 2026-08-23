(function () {

"use strict";

/*
|--------------------------------------------------------------------------
| WHY2YUE / OGEVIEW ANIME COUNTDOWN
|--------------------------------------------------------------------------
|
| Luồng:
|
| AniList
|    ↓
| GitHub Action
|    ↓
| Cloudflare R2
|    ↓
| countdown.js
|
| countdown.js sẽ:
|
| 1. Ưu tiên lấy JSON mới từ R2
| 2. Cache-busting để tránh JSON cũ
| 3. Fallback về data-anilist-data nếu R2 không truy cập được
| 4. Tự kiểm tra dữ liệu mới mỗi 5 phút
| 5. Khi tập phát xong → tự lấy dữ liệu mới
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

/*
 * QUAN TRỌNG:
 *
 * Nếu HTML của bạn có:
 *
 * data-r2-url="https://domain-cua-ban/anime/21.json"
 *
 * thì code sẽ tự dùng URL đó.
 *
 * Nếu không có data-r2-url,
 * hãy điền URL JSON R2 của bạn vào biến bên dưới.
 *
 * Ví dụ:
 *
 * const DEFAULT_R2_URL =
 *     "https://anime.example.com/anime/21.json";
 */

const DEFAULT_R2_URL = "";


/*
 * Bao lâu kiểm tra dữ liệu R2 một lần.
 *
 * 5 phút = 300000 ms
 */

const REFRESH_INTERVAL =
    5 * 60 * 1000;


/*
|--------------------------------------------------------------------------
| ELEMENT
|--------------------------------------------------------------------------
*/

const box =
    document.getElementById(
        "anime-countdown"
    );


if (!box) return;


/*
|--------------------------------------------------------------------------
| BASIC DATA
|--------------------------------------------------------------------------
*/

const animeId =
    box.dataset.anilistId || "";


let lang =
    box.dataset.lang ||
    document.documentElement.getAttribute("lang") ||
    localStorage.getItem("lang") ||
    "en";


/*
|--------------------------------------------------------------------------
| LANGUAGES
|--------------------------------------------------------------------------
*/

const languages = [

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


if (!languages.includes(lang)) {

    lang = "en";

}


/*
|--------------------------------------------------------------------------
| LANGUAGE
|--------------------------------------------------------------------------
*/

async function loadLanguage() {

    try {

        const response =
            await fetch(
                `https://ttphong2512-a11y.github.io/anime-countdown/lang/${lang}.json?${Date.now()}`,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Language error"
            );

        }


        return await response.json();


    } catch (error) {

        return {

            loading:
                "Loading anime...",

            next:
                "Next Episode:",

            calculating:
                "Calculating...",

            no_schedule:
                "No airing schedule",

            finished:
                "Completed",

            releasing:
                "Releasing",

            episodes:
                "Episodes",

            duration:
                "min/episode",

            days:
                "Days",

            hours:
                "Hours",

            minutes:
                "Minutes",

            seconds:
                "Seconds"

        };

    }

}


/*
|--------------------------------------------------------------------------
| GET R2 URL
|--------------------------------------------------------------------------
*/

function getR2Url() {

    /*
     * Ưu tiên data-r2-url
     */

    if (
        box.dataset.r2Url &&
        box.dataset.r2Url.trim()
    ) {

        return box.dataset.r2Url.trim();

    }


    /*
     * Nếu không có thì dùng URL mặc định
     */

    if (
        DEFAULT_R2_URL &&
        DEFAULT_R2_URL.trim()
    ) {

        return DEFAULT_R2_URL.trim();

    }


    /*
     * Không có R2 URL
     */

    return "";

}


/*
|--------------------------------------------------------------------------
| READ OLD EMBEDDED DATA
|--------------------------------------------------------------------------
|
| Fallback cho code cũ.
|
*/

function getEmbeddedAnimeData() {

    const raw =
        box.dataset.anilistData;


    if (!raw) {

        return null;

    }


    try {

        return JSON.parse(raw);

    } catch (error) {

        console.warn(
            "Invalid data-anilist-data"
        );

        return null;

    }

}


/*
|--------------------------------------------------------------------------
| FETCH R2 DATA
|--------------------------------------------------------------------------
*/

async function getR2AnimeData() {

    const baseUrl =
        getR2Url();


    if (!baseUrl) {

        return null;

    }


    /*
     * Cache busting.
     *
     * Mỗi lần request:
     *
     * anime/21.json?t=timestamp
     *
     * giúp tránh trình duyệt/CDN giữ
     * bản JSON cũ.
     */

    const separator =
        baseUrl.includes("?")
            ? "&"
            : "?";


    const url =
        `${baseUrl}${separator}t=${Date.now()}`;


    try {

        const response =
            await fetch(
                url,
                {
                    method: "GET",

                    cache: "no-store",

                    headers: {
                        "Cache-Control":
                            "no-cache"
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                `R2 HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        if (!data) {

            throw new Error(
                "Empty R2 data"
            );

        }


        return data;


    } catch (error) {

        console.warn(
            "R2 data unavailable:",
            error
        );

        return null;

    }

}


/*
|--------------------------------------------------------------------------
| GET BEST DATA
|--------------------------------------------------------------------------
|
| Ưu tiên:
|
| R2 mới
| ↓
| embedded data
|
*/

async function getAnimeData() {

    const r2Data =
        await getR2AnimeData();


    if (r2Data) {

        return r2Data;

    }


    /*
     * Fallback
     */

    return getEmbeddedAnimeData();

}


/*
|--------------------------------------------------------------------------
| LOADING
|--------------------------------------------------------------------------
*/

function showLoading(text) {

    box.innerHTML = `

        <div class="anime-loading">

            ${text.loading}

        </div>

    `;

}


/*
|--------------------------------------------------------------------------
| TIME FORMAT
|--------------------------------------------------------------------------
*/

function formatCountdown(
    distance,
    text
) {

    const days =
        Math.floor(
            distance /
            86400000
        );


    const hours =
        Math.floor(

            (
                distance %
                86400000
            ) /
            3600000

        );


    const minutes =
        Math.floor(

            (
                distance %
                3600000
            ) /
            60000

        );


    const seconds =
        Math.floor(

            (
                distance %
                60000
            ) /
            1000

        );


    return `

        ${days}
        ${text.days}

        <br>

        ${hours}
        ${text.hours}

        ${minutes}
        ${text.minutes}

        ${seconds}
        ${text.seconds}

    `;

}


/*
|--------------------------------------------------------------------------
| MAIN STATE
|--------------------------------------------------------------------------
*/

let currentAnime =
    null;

let currentText =
    null;

let timerInterval =
    null;

let refreshTimer =
    null;


/*
|--------------------------------------------------------------------------
| RENDER
|--------------------------------------------------------------------------
*/

function renderAnime(
    anime,
    text
) {

    currentAnime =
        anime;

    currentText =
        text;


    if (!anime) {

        box.innerHTML = `

            <div class="anime-error">

                ${text.no_schedule}

            </div>

        `;

        return;

    }


    const title =
        anime.title?.romaji ||
        anime.title?.english ||
        anime.title?.native ||
        "";


    const status =
        anime.status === "FINISHED"

            ?

            text.finished

            :

            text.releasing;


    const episodes =
        anime.episodes
            ? `${anime.episodes} ${text.episodes}`
            : "";


    const duration =
        anime.duration
            ? `${anime.duration} ${text.duration}`
            : "";


    const nextEpisode =
        anime.nextAiringEpisode
            ? anime.nextAiringEpisode.episode
            : "";


    box.innerHTML = `

        <div class="anime-countdown-box">

            <h2>

                ${title}

            </h2>


            <div class="anime-status">

                ${status}

            </div>


            <div class="anime-info">

                ${
                    episodes
                        ? episodes
                        : ""
                }

                ${
                    episodes && duration
                        ? "<br>"
                        : ""
                }

                ${
                    duration
                        ? duration
                        : ""
                }

            </div>


            ${
                anime.status !== "FINISHED"

                ?

                `

                <div class="anime-next">

                    ${text.next}

                    <span id="next-episode">

                        ${nextEpisode}

                    </span>

                </div>

                `

                :

                ""

            }

        </div>


        <div id="countdown-time">

            ${text.calculating}

        </div>

    `;


    startCountdown();

}


/*
|--------------------------------------------------------------------------
| START COUNTDOWN
|--------------------------------------------------------------------------
*/

function startCountdown() {

    /*
     * Xóa timer cũ
     */

    if (timerInterval) {

        clearInterval(
            timerInterval
        );

        timerInterval =
            null;

    }


    const timer =
        document.getElementById(
            "countdown-time"
        );


    if (!timer) return;


    /*
     * FINISHED
     */

    if (
        !currentAnime ||
        currentAnime.status === "FINISHED"
    ) {

        timer.innerHTML =
            "";

        return;

    }


    /*
     * NO NEXT EPISODE
     */

    if (
        !currentAnime.nextAiringEpisode
    ) {

        timer.innerHTML =
            currentText.no_schedule;

        return;

    }


    /*
     * AIRING TIMESTAMP
     */

    const airingAt =
        Number(
            currentAnime
                .nextAiringEpisode
                .airingAt
        );


    /*
     * Invalid timestamp
     */

    if (
        !Number.isFinite(
            airingAt
        ) ||
        airingAt <= 0
    ) {

        timer.innerHTML =
            currentText.no_schedule;

        return;

    }


    const target =
        airingAt * 1000;


    /*
     * UPDATE
     */

    function update() {

        const distance =
            target -
            Date.now();


        /*
         * TẬP ĐÃ TỚI GIỜ
         */

        if (
            distance <= 0
        ) {

            timer.innerHTML =
                currentText.calculating;


            /*
             * Không giữ timestamp cũ.
             *
             * Lấy dữ liệu R2 mới ngay.
             */

            refreshAnime(
                true
            );

            return;

        }


        timer.innerHTML =
            formatCountdown(
                distance,
                currentText
            );

    }


    update();


    timerInterval =
        setInterval(
            update,
            1000
        );

}


/*
|--------------------------------------------------------------------------
| REFRESH DATA
|--------------------------------------------------------------------------
*/

let refreshing =
    false;


async function refreshAnime(
    force
) {

    /*
     * Không cho nhiều request
     * chạy cùng lúc.
     */

    if (refreshing) {

        return;

    }


    refreshing =
        true;


    try {

        /*
         * Chỉ lấy R2.
         */

        const freshData =
            await getR2AnimeData();


        /*
         * Nếu R2 không lấy được
         * thì giữ dữ liệu hiện tại.
         */

        if (!freshData) {

            return;

        }


        /*
         * Cập nhật dữ liệu.
         */

        currentAnime =
            freshData;


        /*
         * Render lại.
         */

        renderAnime(
            freshData,
            currentText
        );


    } catch (error) {

        console.warn(
            "Anime refresh failed:",
            error
        );

    } finally {

        refreshing =
            false;

    }

}


/*
|--------------------------------------------------------------------------
| PERIODIC REFRESH
|--------------------------------------------------------------------------
*/

function startPeriodicRefresh() {

    if (refreshTimer) {

        clearInterval(
            refreshTimer
        );

    }


    refreshTimer =
        setInterval(
            function () {

                refreshAnime(
                    false
                );

            },
            REFRESH_INTERVAL
        );

}


/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

loadLanguage()

.then(
    async function (text) {

        currentText =
            text;


        showLoading(
            text
        );


        /*
         * Lấy dữ liệu:
         *
         * R2 trước
         * embedded sau
         */

        const anime =
            await getAnimeData();


        if (anime) {

            renderAnime(
                anime,
                text
            );

        } else {

            box.innerHTML = `

                <div class="anime-error">

                    ${text.no_schedule}

                </div>

            `;

        }


        /*
         * Bắt đầu tự refresh.
         */

        startPeriodicRefresh();

    }
)

.catch(
    function () {

        box.innerHTML = `

            <div class="anime-error">

                No schedule

            </div>

        `;

    }
);


})();
