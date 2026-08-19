const {
  S3Client,
  PutObjectCommand
} = require("@aws-sdk/client-s3");

const endpoint = process.env.R2_ENDPOINT;
const bucket = process.env.R2_BUCKET;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

const client = new S3Client({
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
query {
  Page(page: 1, perPage: 50) {
    media(
      type: ANIME
      status: RELEASING
      sort: POPULARITY_DESC
    ) {
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
}
`;

/*
|--------------------------------------------------------------------------
| GET RELEASING ANIME
|--------------------------------------------------------------------------
*/

async function getReleasingAnime() {

  const response = await fetch(
    "https://graphql.anilist.co",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        query
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `AniList HTTP ${response.status}`
    );
  }

  const json = await response.json();

  if (
    json.errors ||
    !json.data ||
    !json.data.Page
  ) {
    throw new Error(
      "AniList returned invalid data"
    );
  }

  return json.data.Page.media;
}

/*
|--------------------------------------------------------------------------
| SAVE TO R2
|--------------------------------------------------------------------------
*/

async function saveToR2(id, data) {

  const body = JSON.stringify(
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
| MAIN
|--------------------------------------------------------------------------
*/

async function main() {

  console.log(
    "Getting currently airing anime..."
  );

  const animeList =
    await getReleasingAnime();

  console.log(
    `Found ${animeList.length} anime.`
  );

  for (
    const anime of animeList
  ) {

    try {

      console.log(
        `Updating anime ${anime.id}...`
      );

      await saveToR2(
        anime.id,
        anime
      );

      console.log(
        `Anime ${anime.id} updated`
      );

    } catch (error) {

      console.error(
        `Anime ${anime.id} failed:`,
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

    console.error(error);

    process.exit(1);

  }
);
