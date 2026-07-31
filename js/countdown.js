(function(){

"use strict";


const box = document.getElementById("anime-countdown");

if(!box) return;


const animeId = box.dataset.anilistId;


// =====================
// LANGUAGE
// =====================

let lang =
box.dataset.lang ||
document.documentElement.getAttribute("lang") ||
localStorage.getItem("lang") ||
"en";


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


if(!languages.includes(lang)){
    lang = "en";
}



// =====================
// LOAD LANGUAGE FILE
// =====================

async function loadLanguage(){

try{

const res = await fetch(
`https://ttphong2512-a11y.github.io/anime-countdown/lang/${lang}.json`
);


if(!res.ok) throw Error();


return await res.json();


}catch(e){


return {

loading:"📺 Loading anime...",
next:"Next Episode:",
calculating:"Calculating...",
days:"Days",
hours:"Hours",
minutes:"Minutes",
seconds:"Seconds"

};


}

}




// =====================
// CACHE
// =====================

const CACHE_TIME = 6 * 60 * 60 * 1000;


function cacheKey(){

return "anime_countdown_" + animeId;

}



function getCache(){

try{

const item =
localStorage.getItem(cacheKey());


if(!item) return null;


return JSON.parse(item);


}catch(e){

return null;

}

}



function saveCache(data){

try{

localStorage.setItem(

cacheKey(),

JSON.stringify({

time:Date.now(),

data:data

})

);


}catch(e){}

}




// =====================
// COUNTDOWN DISPLAY
// =====================


function showAnime(anime,text){


if(!anime){

return;

}


box.innerHTML = `

<div class="anime-countdown-box">

<h2>
${anime.title?.romaji || ""}
</h2>


<div class="anime-next">

${text.next}

${anime.nextAiringEpisode
?
" "+anime.nextAiringEpisode.episode
:
""}

</div>


<div id="countdown-time">

${text.calculating}

</div>


</div>

`;



const timer =
document.getElementById("countdown-time");



if(!anime.nextAiringEpisode){

timer.innerHTML =
text.no_schedule || text.calculating;

return;

 }



const target =
anime.nextAiringEpisode.airingAt * 1000;



function update(){


const distance =
target - Date.now();



if(distance <= 0){

timer.innerHTML =
text.no_schedule || text.calculating;

return;

    }



const days =
Math.floor(distance / 86400000);


const hours =
Math.floor(
(distance % 86400000) / 3600000
);


const minutes =
Math.floor(
(distance % 3600000) / 60000
);


const seconds =
Math.floor(
(distance % 60000) / 1000
);



timer.innerHTML = `

${days} ${text.days}

<br>

${hours} ${text.hours}

${minutes} ${text.minutes}

${seconds} ${text.seconds}

`;

}



update();

setInterval(update,1000);


}




// =====================
// ANILIST API
// =====================


async function fetchAniList(){


const query = `

query {

Media(id:${animeId}, type:ANIME){

title{

romaji

}

nextAiringEpisode{

episode

airingAt

}

}

}

`;



const response =
await fetch(

"https://graphql.anilist.co",

{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

query:query

})

}

);



if(!response.ok){

throw Error("AniList error");

}



const result =
await response.json();



return result.data.Media;


}




// =====================
// START
// =====================


loadLanguage()

.then(async text=>{


box.innerHTML = `

<div class="anime-loading">

${text.loading}

</div>

`;



const old =
getCache();


// hiện cache trước

if(old && old.data){

showAnime(old.data,text);

}



// gọi API cập nhật


try{


const fresh =
await fetchAniList();


saveCache(fresh);


showAnime(fresh,text);



}catch(error){



if(!old){


box.innerHTML = `

<div class="anime-error">

${text.no_schedule || text.calculating}

</div>

`;

}



}



});



})();
