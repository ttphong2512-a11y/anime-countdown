(function () {

"use strict";


/*
|--------------------------------------------------------------------------
| OGEVIEW ANIME COUNTDOWN
|--------------------------------------------------------------------------
|
| Dữ liệu Anime được WordPress cung cấp qua:
|
| data-anilist-data
|
| Countdown KHÔNG gọi AniList trực tiếp.
|
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
| LOAD LANGUAGE
|--------------------------------------------------------------------------
*/

async function loadLanguage() {

    try {

        const response =
            await fetch(
                `https://ttphong2512-a11y.github.io/anime-countdown/lang/${lang}.json`
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
                "📺 Loading anime...",

            next:
                "Next Episode:",

            calculating:
                "Calculating...",

            no_schedule:
                "📅 No airing schedule",

            finished:
                "✅ Completed",

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
| READ WORDPRESS DATA
|--------------------------------------------------------------------------
*/

function getAnimeData() {

    const raw =
        box.dataset.anilistData;


    if (!raw) {

        return null;

    }


    try {

        return JSON.parse(raw);

    } catch (error) {

        return null;

    }

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
| DISPLAY
|--------------------------------------------------------------------------
*/

function showAnime(
    anime,
    text
) {


    if (!anime) {

        box.innerHTML = `

            <div class="anime-error">

                ${text.no_schedule}

            </div>

        `;

        return;

    }


    box.innerHTML = `

        <div class="anime-countdown-box">

            <h2>

                ${
                    anime.title?.romaji ||
                    anime.title?.english ||
                    anime.title?.native ||
                    ""
                }

            </h2>


            <div class="anime-status">

                ${
                    anime.status === "FINISHED"

                    ?

                    text.finished

                    :

                    "📺 " +
                    text.releasing

                }

            </div>


            <div class="anime-info">

                ${
                    anime.episodes

                    ?

                    "📺 " +
                    anime.episodes +
                    " " +
                    text.episodes

                    :

                    ""
                }


                <br>


                ${
                    anime.duration

                    ?

                    "⏱ " +
                    anime.duration +
                    " " +
                    text.duration

                    :

                    ""
                }

            </div>


            ${
                anime.status !== "FINISHED"

                ?

                `

                <div class="anime-next">

                    ${text.next}

                    <span id="next-episode">

                        ${
                            anime.nextAiringEpisode
                            ?
                            anime.nextAiringEpisode.episode
                            :
                            ""
                        }

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


    const timer =
        document.getElementById(
            "countdown-time"
        );


    /*
    |--------------------------------------------------------------------------
    | FINISHED
    |--------------------------------------------------------------------------
    */

    if (
        anime.status === "FINISHED"
    ) {

        timer.innerHTML = "";

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | NO AIRING
    |--------------------------------------------------------------------------
    */

    if (
        !anime.nextAiringEpisode
    ) {

        timer.innerHTML =
            text.no_schedule;

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | TARGET
    |--------------------------------------------------------------------------
    */

    const target =
        Number(
            anime.nextAiringEpisode.airingAt
        ) * 1000;


    if (
        !Number.isFinite(target)
    ) {

        timer.innerHTML =
            text.no_schedule;

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | COUNTDOWN
    |--------------------------------------------------------------------------
    */

    function update() {


        const distance =
            target - Date.now();


        /*
        |--------------------------------------------------------------------------
        | TIME REACHED
        |--------------------------------------------------------------------------
        */

        if (distance <= 0) {

            timer.innerHTML =
                text.no_schedule;

            return;

        }


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


        timer.innerHTML = `

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


    update();


    setInterval(
        update,
        1000
    );

}


/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

loadLanguage()

.then(function (text) {


    showLoading(text);


    /*
    |--------------------------------------------------------------------------
    | GET WORDPRESS CACHE
    |--------------------------------------------------------------------------
    */

    const anime =
        getAnimeData();


    /*
    |--------------------------------------------------------------------------
    | SHOW DATA
    |--------------------------------------------------------------------------
    */

    if (anime) {

        showAnime(
            anime,
            text
        );

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | NO DATA
    |--------------------------------------------------------------------------
    */

    box.innerHTML = `

        <div class="anime-error">

            ${text.no_schedule}

        </div>

    `;

})

.catch(function () {

    box.innerHTML = `

        <div class="anime-error">

            No schedule

        </div>

    `;

});


})();
