const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
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

      Key: `anime/${id}.json`,

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
| GET OLD FILES FROM R2
|--------------------------------------------------------------------------
*/

async function getOldAnimeFiles() {

  const result = [];

  let continuationToken = undefined;

  do {

    const response = await client.send(
      new ListObjectsV2Command({

        Bucket: bucket,

        Prefix: "anime/",

        ContinuationToken:
          continuationToken

      })
    );

    if (response.Contents) {

      for (const object of response.Contents) {

        if (
          object.Key &&
          object.Key.endsWith(".json")
        ) {

          result.push(object.Key);

        }

      }

    }

    continuationToken =
      response.NextContinuationToken;

  } while (continuationToken);

  return result;
}

/*
|--------------------------------------------------------------------------
| DELETE OLD FILES
|--------------------------------------------------------------------------
*/

async function deleteOldFiles(
  animeList
) {

  const currentIds = new Set(
    animeList.map(
      anime => String(anime.id)
    )
  );

  const oldFiles =
    await getOldAnimeFiles();

  const filesToDelete =
    oldFiles.filter(key => {

      const filename =
        key
          .replace("anime/", "")
          .replace(".json", "");

      return !currentIds.has(filename);

    });

  if (
    filesToDelete.length === 0
  ) {

    console.log(
      "No old anime files to delete."
    );

    return;

  }

  console.log(
    `Deleting ${filesToDelete.length} old anime files...`
  );

  for (
    let i = 0;
    i < filesToDelete.length;
    i += 1000
  ) {

    const batch =
      filesToDelete.slice(
        i,
        i + 1000
      );

    await client.send(
      new DeleteObjectsCommand({

        Bucket: bucket,

        Delete: {

          Objects:
            batch.map(
              Key => ({ Key })
            )

        }

      })
    );

    console.log(
      `Deleted ${batch.length} old files.`
    );
  }
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

  /*
  |--------------------------------------------------------------------------
  | UPDATE CURRENT ANIME
  |--------------------------------------------------------------------------
  */

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

  /*
  |--------------------------------------------------------------------------
  | DELETE OLD ANIME
  |--------------------------------------------------------------------------
  */

  await deleteOldFiles(
    animeList
  );

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
