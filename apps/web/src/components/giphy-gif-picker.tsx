"use client";

import { useState, useTransition } from "react";
import { sendChatGifMessageAction } from "@/app/game-actions";
import styles from "./chat-panel.module.css";

const GIPHY_SEARCH_LIMIT = 12;
const GIPHY_RATING = "pg";
const giphyApiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

type GiphyImage = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyGif = {
  id: string;
  title: string;
  url: string;
  images?: {
    fixed_height?: GiphyImage;
    fixed_height_small?: GiphyImage;
    preview_gif?: GiphyImage;
  };
};

type GiphySearchResponse = {
  data?: GiphyGif[];
  pagination?: {
    total_count?: number;
    count?: number;
    offset?: number;
  };
};

function getGifImage(gif: GiphyGif, kind: "preview" | "display") {
  const image =
    kind === "preview"
      ? (gif.images?.fixed_height_small ?? gif.images?.preview_gif)
      : gif.images?.fixed_height;

  if (!image?.url || !image.width || !image.height) {
    return null;
  }

  const width = Number(image.width);
  const height = Number(image.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    url: image.url,
    width,
    height,
  };
}

function toGifResult(gif: GiphyGif) {
  const preview = getGifImage(gif, "preview");
  const display = getGifImage(gif, "display");

  if (!preview || !display) {
    return null;
  }

  return {
    id: gif.id,
    title: gif.title || "GIPHY GIF",
    sourceUrl: gif.url,
    previewUrl: preview.url,
    displayUrl: display.url,
    width: display.width,
    height: display.height,
  };
}

type GifResult = NonNullable<ReturnType<typeof toGifResult>>;

function isGifResult(gif: GifResult | null): gif is GifResult {
  return gif !== null;
}

export function GiphyGifPicker() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [results, setResults] = useState<GifResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!giphyApiKey) {
    return null;
  }

  const apiKey = giphyApiKey;

  function searchGifs(nextOffset: number) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return;
    }

    setError(null);
    startTransition(() => {
      void (async () => {
        const params = new URLSearchParams({
          api_key: apiKey,
          q: trimmedQuery,
          rating: GIPHY_RATING,
          limit: String(GIPHY_SEARCH_LIMIT),
          offset: String(nextOffset),
        });

        try {
          const response = await fetch(
            `https://api.giphy.com/v1/gifs/search?${params.toString()}`
          );

          if (!response.ok) {
            throw new Error("GIPHY search failed.");
          }

          const payload = (await response.json()) as GiphySearchResponse;
          const nextResults =
            payload.data?.map(toGifResult).filter(isGifResult) ?? [];
          const pagination = payload.pagination;
          const total = pagination?.total_count ?? 0;
          const count = pagination?.count ?? nextResults.length;
          const currentOffset = pagination?.offset ?? nextOffset;

          setResults((current) =>
            nextOffset === 0 ? nextResults : [...current, ...nextResults]
          );
          setOffset(currentOffset + count);
          setHasMore(currentOffset + count < total);
        } catch {
          setError("GIF search is unavailable right now.");
        }
      })();
    });
  }

  return (
    <div className={styles.gifPicker}>
      <button
        type="button"
        className={styles.secondaryButton}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        GIF
      </button>
      {isOpen ? (
        <div className={styles.gifPopover}>
          <form
            className={styles.gifSearch}
            onSubmit={(event) => {
              event.preventDefault();
              setOffset(0);
              searchGifs(0);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search GIPHY"
            />
            <button className={styles.secondaryButton} type="submit">
              Search
            </button>
          </form>
          {error ? <p className={styles.gifHint}>{error}</p> : null}
          <div className={styles.gifGrid}>
            {results.map((gif) => (
              <form action={sendChatGifMessageAction} key={gif.id}>
                <input type="hidden" name="providerId" value={gif.id} />
                <input type="hidden" name="title" value={gif.title} />
                <input type="hidden" name="previewUrl" value={gif.previewUrl} />
                <input type="hidden" name="displayUrl" value={gif.displayUrl} />
                <input type="hidden" name="width" value={gif.width} />
                <input type="hidden" name="height" value={gif.height} />
                <input type="hidden" name="sourceUrl" value={gif.sourceUrl} />
                <button
                  type="submit"
                  className={styles.gifOption}
                  aria-label={`Send ${gif.title}`}
                >
                  <img src={gif.previewUrl} alt="" loading="lazy" />
                </button>
              </form>
            ))}
          </div>
          {hasMore ? (
            <button
              type="button"
              className={styles.loadMoreButton}
              disabled={isPending}
              onClick={() => searchGifs(offset)}
            >
              Load more
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
