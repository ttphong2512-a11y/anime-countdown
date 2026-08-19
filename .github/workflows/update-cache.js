const {
  S3Client,
  PutObjectCommand
} = require("@aws-sdk/client-s3");

const endpoint =
  process.env.R2_ENDPOINT;

const bucket =
  process.env.R2_BUCKET;

const accessKeyId =
  process.env.R2_ACCESS_KEY_ID;

const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY;

const client =
  new S3Client({
    region: "auto",

    endpoint,

    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });


/*
|--------------------------------------------------------------------------
| ANILIST QUERY
|--------------------------------------------------------------------------
*/

const query = `
query ($id: Int) {

  Media(id: $id, type: ANIME) {

    id

    title {
      romaji
      english
      native
    }

    status

    episodes

    duration

    nextAiringEpisode {
      airingAt
      episode
    }

  }

}
`;


/*
|--------------------------------------------------------------------------
| GET ANILIST DATA
|--------------------------------------------------------------------------
*/

async function getAnime(id) {

  const response =
    await fetch(
      "https://graphql.anilist.co",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          query,

          variables: {
            id: Number(id)
          }

        })

      }
    );


  if (!response.ok) {

    throw new Error(
      `AniList HTTP ${response.status}`
    );

  }


  const json =
    await response.json();


  if (
    json.errors ||
    !json.data ||
    !json.data.Media
  ) {

    throw new Error(
      `Anime ${id} not found`
    );

  }


  return json.data.Media;

}


/*
|--------------------------------------------------------------------------
| SAVE TO R2
|--------------------------------------------------------------------------
*/

async function saveToR2(
  id,
  data
) {

  const body =
    JSON.stringify(
      data,
      null,
      2
    );


  await client.send(

    new PutObjectCommand({

      Bucket: bucket,

      Key:
        `anime/${id}.json`,

      Body: body,

      ContentType:
        "application/json; charset=utf-8",

      CacheControl:
        "public, max-age=3600"

    })

  );

}


/*
|--------------------------------------------------------------------------
| ANIME IDS
|--------------------------------------------------------------------------
|
| Tạm thời dùng các ID đang cần.
| Sau khi hệ thống ổn định,
| ta sẽ tự động lấy danh sách.
|
|--------------------------------------------------------------------------
*/

const animeIds = [

  21

];


/*
|--------------------------------------------------------------------------
| MAIN
|--------------------------------------------------------------------------
*/

async function main() {

  console.log(
    `Updating ${animeIds.length} anime...`
  );


  for (
    const id of animeIds
  ) {

    try {

      console.log(
        `Updating anime ${id}...`
      );


      const anime =
        await getAnime(id);


      await saveToR2(
        id,
        anime
      );


      console.log(
        `Anime ${id} updated`
      );


    } catch (error) {

      console.error(
        `Anime ${id} failed:`,
        error.message
      );

    }

  }


  console.log(
    "Anime cache update finished."
  );

}


main().catch(
  error => {

    console.error(
      error
    );

    process.exit(1);

  }
);
