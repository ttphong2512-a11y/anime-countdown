(function(){

const lang = localStorage.getItem("lang") || "vi";

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
<h2>${lang==="vi" ? "📺 Đang tải anime..." : "📺 Loading anime..."}</h2>
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

html=`
<div style="
background:#171717;
padding:20px;
border-radius:16px;
color:white;
font-family:Arial;
text-align:center;
">

<h2>${anime.title.english || anime.title.romaji}</h2>

<p>
${lang==="vi" ? "Tập tiếp theo: " : "Next Episode: "}
${anime.nextAiringEpisode.episode}
</p>

<h3 id="countdown-time">
${lang==="vi" ? "Đang tính..." : "Calculating..."}
</h3>

</div>
`;

box.innerHTML=html;


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
lang==="vi"
? `${d} ngày ${h} giờ ${m} phút ${s} giây`
: `${d} Days ${h} Hours ${m} Minutes ${s} Seconds`;

}

update();
setInterval(update,1000);


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

<p>
${lang==="vi"
? "✅ Anime đã kết thúc hoặc chưa có lịch tập tiếp theo."
: "✅ The anime has finished airing or has no upcoming episode schedule."}
</p>

</div>
`;

box.innerHTML=html;

}

});

})();
