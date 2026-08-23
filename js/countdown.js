<script>
(function(){

"use strict";

/* =========================================================
   WHY2YUE COUNTDOWN ENGINE
   PART 1/3
   DATA + R2 + STATE
   ========================================================= */

window.W2YCountdown =
window.W2YCountdown || {};

const W2Y = window.W2YCountdown;


/* =========================================================
   CONFIG
   ========================================================= */

W2Y.config = {

    refreshInterval:
        5 * 60 * 1000,

    requestTimeout:
        15000,

    defaultLanguage:
        "vi",

    languageURL:
        "https://ttphong2512-a11y.github.io/anime-countdown/lang/"

};


/* =========================================================
   ELEMENT
   ========================================================= */

W2Y.box =
    document.getElementById(
        "anime-countdown"
    );


if(!W2Y.box){

    console.warn(
        "WHY2YUE: #anime-countdown not found."
    );

    return;

}


/* =========================================================
   ANIME ID
   ========================================================= */

W2Y.animeId =
    String(
        W2Y.box.dataset.anilistId || ""
    ).trim();


/* =========================================================
   LANGUAGE
   ========================================================= */

W2Y.lang =
    W2Y.box.dataset.lang ||
    document.documentElement
        .getAttribute("lang") ||
    localStorage.getItem("lang") ||
    W2Y.config.defaultLanguage;


/* =========================================================
   SUPPORTED LANGUAGES
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


if(
    !W2Y.languages.includes(
        W2Y.lang
    )
){

    W2Y.lang =
        W2Y.config.defaultLanguage;

}


/* =========================================================
   R2 URL
   ========================================================= */

W2Y.getR2Url =
function(){

    const dataURL =
        W2Y.box.dataset.r2Url;


    if(
        dataURL &&
        dataURL.trim()
    ){

        return dataURL.trim();

    }


    /*
     * Nếu muốn dùng ID tự động:
     *
     * data-r2-base="https://xxx.r2.dev/anime/"
     *
     */

    const base =
        W2Y.box.dataset.r2Base;


    if(
        base &&
        base.trim() &&
        W2Y.animeId
    ){

        return (
            base.replace(/\/+$/,"") +
            "/" +
            W2Y.animeId +
            ".json"
        );

    }


    return "";

};


/* =========================================================
   FETCH WITH TIMEOUT
   ========================================================= */

W2Y.fetchJSON =
async function(url){

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

        const separator =
            url.includes("?")
                ? "&"
                : "?";


        const finalURL =
            url +
            separator +
            "w2y=" +
            Date.now();


        const response =
            await fetch(
                finalURL,
                {

                    method:
                        "GET",

                    cache:
                        "no-store",

                    signal:
                        controller.signal,

                    headers:{

                        "Cache-Control":
                            "no-cache",

                        "Pragma":
                            "no-cache"

                    }

                }
            );


        if(
            !response.ok
        ){

            throw new Error(
                "HTTP " +
                response.status
            );

        }


        const data =
            await response.json();


        if(
            !data ||
            typeof data !== "object"
        ){

            throw new Error(
                "Invalid JSON"
            );

        }


        return data;


    }finally{

        clearTimeout(
            timeout
        );

    }

};


/* =========================================================
   LOAD R2
   ========================================================= */

W2Y.loadR2 =
async function(){

    const url =
        W2Y.getR2Url();


    if(!url){

        throw new Error(
            "R2 URL is not configured."
        );

    }


    return await W2Y.fetchJSON(
        url
    );

};


/* =========================================================
   EMBEDDED FALLBACK
   ========================================================= */

W2Y.getEmbedded =
function(){

    const raw =
        W2Y.box.dataset.anilistData;


    if(!raw){

        return null;

    }


    try{

        return JSON.parse(
            raw
        );

    }catch(error){

        console.warn(
            "WHY2YUE: Invalid embedded data.",
            error
        );

        return null;

    }

};


/* =========================================================
   LOAD BEST DATA
   ========================================================= */

W2Y.loadAnime =
async function(){

    try{

        const r2 =
            await W2Y.loadR2();


        if(r2){

            W2Y.lastSource =
                "R2";

            return r2;

        }

    }catch(error){

        console.warn(
            "WHY2YUE: R2 unavailable.",
            error
        );

    }


    const embedded =
        W2Y.getEmbedded();


    if(embedded){

        W2Y.lastSource =
            "embedded";

        return embedded;

    }


    return null;

};


/* =========================================================
   NORMALIZE ANIME
   ========================================================= */

W2Y.normalize =
function(anime){

    if(
        !anime ||
        typeof anime !== "object"
    ){

        return null;

    }


    const result = {

        id:
            Number(anime.id) || 0,

        title:
            anime.title || {},

        status:
            anime.status || "UNKNOWN",

        episodes:
            Number.isFinite(
                Number(anime.episodes)
            )
                ? Number(anime.episodes)
                : null,

        duration:
            Number.isFinite(
                Number(anime.duration)
            )
                ? Number(anime.duration)
                : null,

        startDate:
            anime.startDate || null,

        endDate:
            anime.endDate || null,

        nextAiringEpisode:
            anime.nextAiringEpisode || null

    };


    return result;

};


/* =========================================================
   GET TITLE
   ========================================================= */

W2Y.getTitle =
function(anime){

    if(!anime){

        return "";

    }


    return (

        anime.title?.english ||

        anime.title?.romaji ||

        anime.title?.native ||

        "Anime"

    );

};


/* =========================================================
   GET START TIMESTAMP
   ========================================================= */

W2Y.getStartTimestamp =
function(anime){

    const start =
        anime?.startDate;


    if(
        !start ||
        !start.year ||
        !start.month ||
        !start.day
    ){

        return null;

    }


    /*
     * AniList startDate không có giờ.
     *
     * Dùng UTC để tránh việc thiết bị
     * ở múi giờ khác làm ngày bị lệch.
     */

    const timestamp =
        Date.UTC(
            Number(start.year),
            Number(start.month) - 1,
            Number(start.day)
        );


    return Number.isFinite(
        timestamp
    )
        ? timestamp
        : null;

};


/* =========================================================
   GET END TIMESTAMP
   ========================================================= */

W2Y.getEndTimestamp =
function(anime){

    const end =
        anime?.endDate;


    if(
        !end ||
        !end.year ||
        !end.month ||
        !end.day
    ){

        return null;

    }


    const timestamp =
        Date.UTC(
            Number(end.year),
            Number(end.month) - 1,
            Number(end.day)
        );


    return Number.isFinite(
        timestamp
    )
        ? timestamp
        : null;

};


/* =========================================================
   DETERMINE STATE
   ========================================================= */

W2Y.getState =
function(anime){

    if(!anime){

        return "UNKNOWN";

    }


    const status =
        String(
            anime.status || ""
        ).toUpperCase();


    /*
     * Đã hoàn thành
     */

    if(
        status === "FINISHED"
    ){

        return "FINISHED";

    }


    /*
     * Chưa phát sóng
     */

    if(
        status === "NOT_YET_RELEASED"
    ){

        return "NOT_YET";

    }


    /*
     * Đang phát sóng
     */

    if(
        status === "RELEASING"
    ){

        return "RELEASING";

    }


    /*
     * Các trạng thái khác
     */

    return "UNKNOWN";

};


/* =========================================================
   VALID NEXT AIRING
   ========================================================= */

W2Y.getNextAiring =
function(anime){

    const next =
        anime?.nextAiringEpisode;


    if(!next){

        return null;

    }


    const episode =
        Number(
            next.episode
        );


    const airingAt =
        Number(
            next.airingAt
        );


    if(
        !Number.isFinite(
            episode
        ) ||
        !Number.isFinite(
            airingAt
        ) ||
        airingAt <= 0
    ){

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
   PUBLIC STATE
   ========================================================= */

W2Y.state = {

    anime:
        null,

    language:
        null,

    currentState:
        "UNKNOWN",

    nextAiring:
        null,

    timer:
        null,

    refreshTimer:
        null,

    refreshing:
        false,

    destroyed:
        false

};


/* =========================================================
   PART 1 READY
   ========================================================= */

W2Y.part1Ready =
    true;


})();
</script>

<script>
(function(){

"use strict";

const W2Y =
    window.W2YCountdown;


/* =========================================================
   WHY2YUE COUNTDOWN ENGINE
   PART 2/3
   LANGUAGE + FORMAT + RENDER
   ========================================================= */


/* =========================================================
   LANGUAGE FALLBACK
   ========================================================= */

W2Y.defaultText = {

    loading:
        "Đang tải dữ liệu anime...",

    next:
        "Tập tiếp theo",

    calculating:
        "Đang tính thời gian...",

    noSchedule:
        "Chưa có lịch phát",

    completed:
        "Đã hoàn thành",

    releasing:
        "Đang phát sóng",

    notYet:
        "Chưa phát sóng",

    unknown:
        "Chưa xác định",

    episodes:
        "tập",

    duration:
        "phút/tập",

    days:
        "ngày",

    hours:
        "giờ",

    minutes:
        "phút",

    seconds:
        "giây",

    expected:
        "Dự kiến phát",

    completedEpisodes:
        "Số tập hoàn thành",

    start:
        "Ngày phát sóng",

    end:
        "Kết thúc",

    noNext:
        "Chưa có lịch tập tiếp theo"

};


/* =========================================================
   LOAD LANGUAGE
   ========================================================= */

W2Y.loadLanguage =
async function(){

    const fallback =
        W2Y.defaultText;


    try{

        const url =
            W2Y.config.languageURL +
            encodeURIComponent(
                W2Y.lang
            ) +
            ".json?t=" +
            Date.now();


        const response =
            await fetch(
                url,
                {

                    method:
                        "GET",

                    cache:
                        "no-store"

                }
            );


        if(
            !response.ok
        ){

            throw new Error(
                "Language HTTP " +
                response.status
            );

        }


        const data =
            await response.json();


        /*
         * Nếu file ngôn ngữ chỉ có một phần
         * text thì fallback phần còn thiếu.
         */

        return Object.assign(
            {},
            fallback,
            data || {}
        );


    }catch(error){

        console.warn(
            "WHY2YUE: Language unavailable.",
            error
        );


        return Object.assign(
            {},
            fallback
        );

    }

};


/* =========================================================
   ESCAPE HTML
   ========================================================= */

W2Y.escapeHTML =
function(value){

    if(
        value === null ||
        value === undefined
    ){

        return "";

    }


    return String(value)
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
   PAD NUMBER
   ========================================================= */

W2Y.pad =
function(number){

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


/* =========================================================
   FORMAT COUNTDOWN
   ========================================================= */

W2Y.formatCountdown =
function(distance){

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


    const secs =
        seconds;


    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    return {

        days:
            days,

        hours:
            hours,

        minutes:
            minutes,

        seconds:
            secs,

        html:

            `<span class="w2y-time-number">${W2Y.pad(days)}</span>` +
            `<span class="w2y-time-label">${W2Y.escapeHTML(text.days)}</span>` +

            `<span class="w2y-time-number">${W2Y.pad(hours)}</span>` +
            `<span class="w2y-time-label">${W2Y.escapeHTML(text.hours)}</span>` +

            `<span class="w2y-time-number">${W2Y.pad(minutes)}</span>` +
            `<span class="w2y-time-label">${W2Y.escapeHTML(text.minutes)}</span>` +

            `<span class="w2y-time-number">${W2Y.pad(secs)}</span>` +
            `<span class="w2y-time-label">${W2Y.escapeHTML(text.seconds)}</span>`

    };

};


/* =========================================================
   FORMAT DATE
   ========================================================= */

W2Y.formatDate =
function(timestamp){

    if(
        !Number.isFinite(
            Number(timestamp)
        )
    ){

        return "";

    }


    const date =
        new Date(
            Number(timestamp)
        );


    if(
        Number.isNaN(
            date.getTime()
        )
    ){

        return "";

    }


    /*
     * Hiển thị theo múi giờ của người xem.
     *
     * Người Việt → giờ Việt Nam.
     * Người Nhật → giờ Nhật.
     * Người Mỹ → giờ địa phương của họ.
     */

    try{

        return date.toLocaleString(
            W2Y.lang === "vi"
                ? "vi-VN"
                : W2Y.lang === "ja"
                    ? "ja-JP"
                    : W2Y.lang === "ko"
                        ? "ko-KR"
                        : W2Y.lang === "zh-CN"
                            ? "zh-CN"
                            : W2Y.lang,
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
                    "2-digit"

            }
        );

    }catch(error){

        return date.toLocaleString();

    }

};


/* =========================================================
   FORMAT DATE ONLY
   ========================================================= */

W2Y.formatDateOnly =
function(timestamp){

    if(
        !Number.isFinite(
            Number(timestamp)
        )
    ){

        return "";

    }


    const date =
        new Date(
            Number(timestamp)
        );


    if(
        Number.isNaN(
            date.getTime()
        )
    ){

        return "";

    }


    try{

        return date.toLocaleDateString(
            W2Y.lang === "vi"
                ? "vi-VN"
                : W2Y.lang === "ja"
                    ? "ja-JP"
                    : W2Y.lang === "ko"
                        ? "ko-KR"
                        : W2Y.lang === "zh-CN"
                            ? "zh-CN"
                            : W2Y.lang,
            {

                day:
                    "2-digit",

                month:
                    "2-digit",

                year:
                    "numeric"

            }
        );

    }catch(error){

        return date.toLocaleDateString();

    }

};


/* =========================================================
   GET STATUS LABEL
   ========================================================= */

W2Y.getStatusLabel =
function(state){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    switch(state){

        case "FINISHED":

            return text.completed;


        case "RELEASING":

            return text.releasing;


        case "NOT_YET":

            return text.notYet;


        default:

            return text.unknown;

    }

};


/* =========================================================
   GET STATUS CLASS
   ========================================================= */

W2Y.getStatusClass =
function(state){

    switch(state){

        case "FINISHED":

            return "finished";


        case "RELEASING":

            return "releasing";


        case "NOT_YET":

            return "not-yet";


        default:

            return "unknown";

    }

};


/* =========================================================
   GET EPISODE TEXT
   ========================================================= */

W2Y.getEpisodeText =
function(anime){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    if(
        anime.episodes === null ||
        anime.episodes === undefined
    ){

        return "";

    }


    const episodes =
        Number(
            anime.episodes
        );


    if(
        !Number.isFinite(
            episodes
        ) ||
        episodes <= 0
    ){

        return "";

    }


    return (
        episodes +
        " " +
        text.episodes
    );

};


/* =========================================================
   GET DURATION TEXT
   ========================================================= */

W2Y.getDurationText =
function(anime){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    if(
        !anime.duration
    ){

        return "";

    }


    const duration =
        Number(
            anime.duration
        );


    if(
        !Number.isFinite(
            duration
        ) ||
        duration <= 0
    ){

        return "";

    }


    return (
        duration +
        " " +
        text.duration
    );

};


/* =========================================================
   RENDER BASIC INFO
   ========================================================= */

W2Y.renderInfo =
function(anime,state){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    const title =
        W2Y.escapeHTML(
            W2Y.getTitle(
                anime
            )
        );


    const status =
        W2Y.escapeHTML(
            W2Y.getStatusLabel(
                state
            )
        );


    const statusClass =
        W2Y.getStatusClass(
            state
        );


    const episodeText =
        W2Y.escapeHTML(
            W2Y.getEpisodeText(
                anime
            )
        );


    const durationText =
        W2Y.escapeHTML(
            W2Y.getDurationText(
                anime
            )
        );


    return `

        <div class="w2y-anime-card">

            <div class="w2y-anime-title">
                ${title}
            </div>


            <div
                class="w2y-anime-status
                       w2y-status-${statusClass}"
            >

                ${status}

            </div>


            <div class="w2y-anime-meta">

                ${
                    episodeText
                        ? `<span>${episodeText}</span>`
                        : ""
                }

                ${
                    durationText
                        ? `<span>${durationText}</span>`
                        : ""
                }

            </div>

        </div>

    `;

};


/* =========================================================
   RENDER NOT YET RELEASED
   ========================================================= */

W2Y.renderNotYet =
function(anime){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    const start =
        W2Y.getStartTimestamp(
            anime
        );


    let dateHTML = "";


    if(start !== null){

        dateHTML = `

            <div class="w2y-release-date">

                <span class="w2y-small-label">
                    ${W2Y.escapeHTML(
                        text.expected
                    )}
                </span>

                <strong>
                    ${W2Y.escapeHTML(
                        W2Y.formatDate(
                            start
                        )
                    )}
                </strong>

            </div>

        `;

    }


    W2Y.box.innerHTML = `

        ${W2Y.renderInfo(
            anime,
            "NOT_YET"
        )}


        <div class="w2y-state-panel">

            <div class="w2y-state-main">

                ${W2Y.escapeHTML(
                    text.notYet
                )}

            </div>


            ${
                dateHTML
            }

        </div>

    `;

};


/* =========================================================
   RENDER FINISHED
   ========================================================= */

W2Y.renderFinished =
function(anime){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    const episodes =
        Number(
            anime.episodes
        );


    let episodeHTML =
        "";


    if(
        Number.isFinite(
            episodes
        ) &&
        episodes > 0
    ){

        episodeHTML = `

            <div class="w2y-finished-episodes">

                <span class="w2y-small-label">

                    ${W2Y.escapeHTML(
                        text.completedEpisodes
                    )}

                </span>


                <strong>

                    ${W2Y.escapeHTML(
                        String(episodes)
                    )}

                    <span>
                        ${W2Y.escapeHTML(
                            text.episodes
                        )}
                    </span>

                </strong>

            </div>

        `;

    }


    const end =
        W2Y.getEndTimestamp(
            anime
        );


    let endHTML =
        "";


    if(end !== null){

        endHTML = `

            <div class="w2y-finished-date">

                ${W2Y.escapeHTML(
                    text.end
                )}

                :

                ${W2Y.escapeHTML(
                    W2Y.formatDateOnly(
                        end
                    )
                )}

            </div>

        `;

    }


    W2Y.box.innerHTML = `

        ${W2Y.renderInfo(
            anime,
            "FINISHED"
        )}


        <div class="w2y-state-panel">

            <div class="w2y-state-main">

                ${W2Y.escapeHTML(
                    text.completed
                )}

            </div>


            ${
                episodeHTML
            }


            ${
                endHTML
            }

        </div>

    `;

};


/* =========================================================
   RENDER RELEASING
   ========================================================= */

W2Y.renderReleasing =
function(anime){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    const next =
        W2Y.getNextAiring(
            anime
        );


    /*
     * ĐANG PHÁT SÓNG
     * nhưng AniList chưa có lịch
     * tập tiếp theo.
     */

    if(!next){

        W2Y.box.innerHTML = `

            ${W2Y.renderInfo(
                anime,
                "RELEASING"
            )}


            <div class="w2y-state-panel">

                <div class="w2y-state-main">

                    ${W2Y.escapeHTML(
                        text.releasing
                    )}

                </div>


                <div class="w2y-no-schedule">

                    ${W2Y.escapeHTML(
                        text.noNext
                    )}

                </div>

            </div>

        `;

        return;

    }


    /*
     * Có tập tiếp theo.
     */

    W2Y.box.innerHTML = `

        ${W2Y.renderInfo(
            anime,
            "RELEASING"
        )}


        <div class="w2y-state-panel">

            <div class="w2y-next-label">

                ${W2Y.escapeHTML(
                    text.next
                )}

            </div>


            <div class="w2y-next-episode">

                ${W2Y.escapeHTML(
                    String(next.episode)
                )}

            </div>


            <div
                id="w2y-countdown-time"
                class="w2y-countdown-time"
            >

                ${W2Y.escapeHTML(
                    text.calculating
                )}

            </div>


            <div
                id="w2y-next-release"
                class="w2y-next-release"
            >

                ${W2Y.escapeHTML(
                    text.expected
                )}

                :

                ${W2Y.escapeHTML(
                    W2Y.formatDate(
                        next.timestamp
                    )
                )}

            </div>


            <div class="w2y-progress">

                <div
                    id="w2y-progress-bar"
                ></div>

            </div>

        </div>

    `;

};


/* =========================================================
   RENDER UNKNOWN
   ========================================================= */

W2Y.renderUnknown =
function(anime){

    const text =
        W2Y.state.language ||
        W2Y.defaultText;


    W2Y.box.innerHTML = `

        ${W2Y.renderInfo(
            anime,
            "UNKNOWN"
        )}


        <div class="w2y-state-panel">

            <div class="w2y-state-main">

                ${W2Y.escapeHTML(
                    text.unknown
                )}

            </div>

        </div>

    `;

};


/* =========================================================
   RENDER ANIME
   ========================================================= */

W2Y.render =
function(anime){

    if(!anime){

        W2Y.box.innerHTML = `

            <div class="w2y-state-panel">

                <div class="w2y-state-main">

                    Không tải được dữ liệu anime.

                </div>

            </div>

        `;

        return;

    }


    const normalized =
        W2Y.normalize(
            anime
        );


    if(!normalized){

        return;

    }


    W2Y.state.anime =
        normalized;


    W2Y.state.currentState =
        W2Y.getState(
            normalized
        );


    W2Y.state.nextAiring =
        W2Y.getNextAiring(
            normalized
        );


    /*
     * Render theo trạng thái.
     */

    switch(
        W2Y.state.currentState
    ){

        case "NOT_YET":

            W2Y.renderNotYet(
                normalized
            );

            break;


        case "RELEASING":

            W2Y.renderReleasing(
                normalized
            );

            break;


        case "FINISHED":

            W2Y.renderFinished(
                normalized
            );

            break;


        default:

            W2Y.renderUnknown(
                normalized
            );

            break;

    }

};


/* =========================================================
   PART 2 READY
   ========================================================= */

W2Y.part2Ready =
    true;


/* =========================================================
   WAIT FOR PART 3
   ========================================================= */

if(
    typeof W2Y.startPart3 ===
    "function"
){

    W2Y.startPart3();

}


})();
</script>

/* =========================================================
   WHY2YUE COUNTDOWN.JS
   P3 / 3
   ========================================================= */


/*
|--------------------------------------------------------------------------
| REFRESH DATA
|--------------------------------------------------------------------------
|
| Khi:
|
| - countdown về 0
| - hoặc đến chu kỳ refresh
|
| countdown sẽ lấy JSON mới từ R2.
|
| Không tự cộng episode bằng JavaScript.
|
| Episode mới phải lấy từ AniList → GitHub → R2.
|
|--------------------------------------------------------------------------
*/

let refreshing = false;


async function refreshAnimeData(){

    /*
    |--------------------------------------------------------------------------
    | CHỐNG REQUEST TRÙNG
    |--------------------------------------------------------------------------
    */

    if(refreshing){

        return null;

    }


    refreshing = true;


    try{

        const freshData =
            await getR2AnimeData();


        /*
        |--------------------------------------------------------------------------
        | R2 CHƯA CÓ DỮ LIỆU MỚI
        |--------------------------------------------------------------------------
        */

        if(!freshData){

            console.warn(
                "WHY2YUE: R2 refresh failed."
            );

            return null;

        }


        /*
        |--------------------------------------------------------------------------
        | LƯU DỮ LIỆU MỚI
        |--------------------------------------------------------------------------
        */

        currentAnime =
            freshData;


        /*
        |--------------------------------------------------------------------------
        | RENDER LẠI
        |--------------------------------------------------------------------------
        */

        renderAnime(
            freshData,
            currentText
        );


        return freshData;


    }catch(error){

        console.error(
            "WHY2YUE: refresh error",
            error
        );

        return null;


    }finally{

        refreshing = false;

    }

}


/*
|--------------------------------------------------------------------------
| PERIODIC REFRESH
|--------------------------------------------------------------------------
|
| Mặc định:
|
| 5 phút / lần
|
| Đây là lớp bảo hiểm.
|
| Nếu countdown đang chạy bình thường,
| dữ liệu vẫn được kiểm tra định kỳ.
|
|--------------------------------------------------------------------------
*/

function startPeriodicRefresh(){

    if(refreshTimer){

        clearInterval(
            refreshTimer
        );

        refreshTimer = null;

    }


    refreshTimer =
        setInterval(

            async function(){

                await refreshAnimeData();

            },

            REFRESH_INTERVAL

        );

}


/*
|--------------------------------------------------------------------------
| COUNTDOWN RECHECK
|--------------------------------------------------------------------------
|
| Khi countdown đạt 0:
|
| Không tự chuyển:
|
| 1175 → 1176
|
| mà request R2.
|
| Nếu GitHub đã cập nhật:
|
| R2:
| 1175 → 1176
|
| countdown:
| 1176 → thời gian mới
|
| Nếu GitHub chưa cập nhật:
|
| giữ dữ liệu cũ và thử lại.
|
|--------------------------------------------------------------------------
*/

async function handleEpisodeReached(){

    /*
    |--------------------------------------------------------------------------
    | HIỂN THỊ TRẠNG THÁI
    |--------------------------------------------------------------------------
    */

    const timer =
        document.getElementById(
            "countdown-time"
        );


    if(timer){

        timer.innerHTML =
            currentText.calculating;

    }


    /*
    |--------------------------------------------------------------------------
    | LẤY DATA MỚI
    |--------------------------------------------------------------------------
    */

    const freshData =
        await refreshAnimeData();


    /*
    |--------------------------------------------------------------------------
    | R2 CHƯA CÓ DATA MỚI
    |--------------------------------------------------------------------------
    */

    if(!freshData){

        /*
         * Thử lại sau 30 giây.
         *
         * Không cần reload trang.
         */

        setTimeout(

            function(){

                handleEpisodeReached();

            },

            30000

        );

    }

}


/*
|--------------------------------------------------------------------------
| PERIODIC SAFETY CHECK
|--------------------------------------------------------------------------
|
| Ngoài interval 5 phút,
| countdown còn có thể tự kiểm tra
| khi gần tới thời điểm phát.
|
|--------------------------------------------------------------------------
*/

function startSafetyCheck(){

    setInterval(

        async function(){

            if(!currentAnime){

                return;

            }


            const next =
                currentAnime.nextAiringEpisode;


            /*
             * Không có next episode:
             *
             * Có thể là:
             *
             * - FINISHED
             * - NOT_YET
             * - AniList chưa có lịch
             */

            if(!next){

                return;

            }


            const airingAt =
                Number(
                    next.airingAt
                );


            if(
                !Number.isFinite(
                    airingAt
                )
            ){

                return;

            }


            const remaining =
                airingAt * 1000 -
                Date.now();


            /*
             * Nếu đã tới giờ
             */

            if(remaining <= 0){

                await handleEpisodeReached();

            }

        },

        10000

    );

}


/*
|--------------------------------------------------------------------------
| VISIBILITY CHANGE
|--------------------------------------------------------------------------
|
| Người dùng có thể:
|
| - mở trang
| - tắt màn hình
| - quay lại sau 30 phút
|
| Khi quay lại:
|
| → kiểm tra R2 ngay.
|
|--------------------------------------------------------------------------
*/

document.addEventListener(

    "visibilitychange",

    function(){

        if(
            document.visibilityState ===
            "visible"
        ){

            refreshAnimeData();

        }

    }

);


/*
|--------------------------------------------------------------------------
| PAGE FOCUS
|--------------------------------------------------------------------------
|
| Một số trình duyệt mobile không phát hiện
| visibility theo cách ổn định.
|
|--------------------------------------------------------------------------
*/

window.addEventListener(

    "focus",

    function(){

        refreshAnimeData();

    }

);


/*
|--------------------------------------------------------------------------
| INITIAL LOAD
|--------------------------------------------------------------------------
*/

async function initCountdown(){

    /*
     |--------------------------------------------------------------------------
     | LOAD LANGUAGE
     |--------------------------------------------------------------------------
     */

    const text =
        await loadLanguage();


    currentText =
        text;


    /*
     |--------------------------------------------------------------------------
     | LOADING UI
     |--------------------------------------------------------------------------
     */

    showLoading(
        text
    );


    /*
     |--------------------------------------------------------------------------
     | LOAD ANIME
     |--------------------------------------------------------------------------
     |
     | Thứ tự:
     |
     | 1. R2
     | 2. embedded data
     |
     |--------------------------------------------------------------------------
     */

    const anime =
        await getAnimeData();


    /*
     |--------------------------------------------------------------------------
     | CÓ DATA
     |--------------------------------------------------------------------------
     */

    if(anime){

        currentAnime =
            anime;


        renderAnime(
            anime,
            text
        );

    }


    /*
     |--------------------------------------------------------------------------
     | KHÔNG CÓ DATA
     |--------------------------------------------------------------------------
     */

    else{

        box.innerHTML = `

            <div class="anime-error">

                ${text.no_schedule}

            </div>

        `;

    }


    /*
     |--------------------------------------------------------------------------
     | AUTO REFRESH
     |--------------------------------------------------------------------------
     */

    startPeriodicRefresh();


    /*
     |--------------------------------------------------------------------------
     | SAFETY CHECK
     |--------------------------------------------------------------------------
     */

    startSafetyCheck();

}


/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

initCountdown()
    .catch(

        function(error){

            console.error(
                "WHY2YUE COUNTDOWN INIT ERROR:",
                error
            );


            if(box){

                box.innerHTML = `

                    <div class="anime-error">

                        ${

                            currentText?.no_schedule
                            ||
                            "Không tải được lịch phát"

                        }

                    </div>

                `;

            }

        }

    );


/*
|--------------------------------------------------------------------------
| END
|--------------------------------------------------------------------------
*/

})();
