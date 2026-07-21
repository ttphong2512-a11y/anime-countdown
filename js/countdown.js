(function(){

const box = document.getElementById("anime-countdown");

if(!box) return;

const id = box.dataset.anilistId;

box.innerHTML = `
<div style="
background:#171717;
padding:20px;
border-radius:16px;
color:white;
font-family:Arial;
text-align:center;
">
<h2>📺 Loading anime...</h2>
</div>
`;

const query = `
query {
  Media(id:${id}, type:ANIME) {
    title {
      romaji
      english
      native
    }
    status
    episodes
    nextAiringEpisode {
      episode
      airingAt
    }
  }
}
`;

fetch("https://graphql.anilist.co",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
query:query
})
})
.then(res=>res.json())
.then(data=>{

const anime=data.data.Media;

let html="";

if(anime.nextAiringEpisode){

let time=anime.nextAiringEpisode.airingAt*1000;

function update(){

let now=new Date().getTime();

let diff=time-now;

if(diff<=0){
location.reload();
return;
}

let d=Math.floor(diff/(1000*60*60*24));
let h=Math.floor((diff/(1000*60*60))%24);
let m=Math.floor((diff/(1000*60))%60);
let s=Math.floor((diff/1000)%60);

document.getElementById("countdown-time").innerHTML=
`${d} Days ${h} Hours ${m} Minutes ${s} Seconds;

}

setInterval(update,1000);

html=`
<div style="
background:#171717;
padding:20px;
border-radius:16px;
color:white;
font-family:Arial;
text-align:center;
">

<h2>🐱 ${anime.title.english || anime.title.romaji}</h2>

<p>Tập tiếp theo: ${anime.nextAiringEpisode.episode}</p>

<h3 id="countdown-time">
Đang tính...
</h3>

</div>
`;

}else{

html=`
<div style="
background:#171717;
padding:20px;
border-radius:16px;
color:white;
text-align:center;
">

<h2>🐱 ${anime.title.english || anime.title.romaji}</h2>

<p>✅ The anime has finished airing or has no upcoming episode schedule..</p>

</div>
`;

}

box.innerHTML=html;

});

})();
