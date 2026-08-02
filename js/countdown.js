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
no_schedule:"📅 No airing schedule",
finished:"✅ Completed",
episodes:"Episodes",
duration:"min/episode",
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

const CACHE_TIME =
6 * 60 * 60 * 1000;



function cacheKey(){

return "anime_countdown_" + animeId;

}



function getCache(){

try{


const item =
localStorage.getItem(cacheKey());


if(!item) return null;



const cache =
JSON.parse(item);



if(
Date.now() - cache.time
>
CACHE_TIME
){

localStorage.removeItem(cacheKey());

return null;

}



return cache.data;



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
// LOADING
// =====================

function showLoading(text){

box.innerHTML = `

<div class="anime-loading">

${text.loading}

</div>

`;

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

english

native

}


status


episodes


duration



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



if(
!result.data ||
!result.data.Media
){

throw Error("No anime data");

}



return result.data.Media;


 }
    // =====================
// DISPLAY ANIME
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



<div class="anime-status">

${
anime.status === "FINISHED"
?
text.finished
:
"📺 Releasing"
}

</div>



<div class="anime-info">


${
anime.episodes
?
"📺 "
+
anime.episodes
+
" "
+
text.episodes
:
""

}


<br>


${
anime.duration
?
"⏱ "
+
anime.duration
+
" "
+
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



</div>

`;



const timer =
document.getElementById("countdown-time");



// =====================
// FINISHED ANIME
// =====================


if(
anime.status === "FINISHED"
){
    timer.innerHTML = "";
    return;
}



// =====================
// NO AIRING
// =====================


if(
!anime.nextAiringEpisode
){


timer.innerHTML =
text.no_schedule;


return;

}




// =====================
// COUNTDOWN
// =====================


const target =
anime.nextAiringEpisode.airingAt * 1000;



function update(){



const distance =
target - Date.now();



if(distance <= 0){


timer.innerHTML =
text.no_schedule;


return;


}




const days =
Math.floor(
distance / 86400000
);



const hours =
Math.floor(
(distance % 86400000)
/3600000
);



const minutes =
Math.floor(
(distance % 3600000)
/60000
);



const seconds =
Math.floor(
(distance % 60000)
/1000
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
// START
// =====================

loadLanguage()

.then(async text=>{


showLoading(text);



const old =
getCache();



// Hiện cache trước nếu có

if(old){

showAnime(old,text);

}



// Lấy dữ liệu mới

try{


const fresh =
await fetchAniList();



// lưu cache

saveCache(fresh);



// cập nhật giao diện

showAnime(fresh,text);



}catch(error){



// AniList lỗi nhưng có cache

if(old){

showAnime(old,text);



}else{


box.innerHTML = `

<div class="anime-error">

${text.no_schedule}

</div>

`;

}


}



});


})();
