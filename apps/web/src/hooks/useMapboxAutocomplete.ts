import { useState, useEffect } from "react";
import { useDebounce } from "./useDebounce";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export function useMapboxAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 3 || !MAPBOX_TOKEN) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();

    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(debouncedQuery)}.json?` +
      `access_token=${MAPBOX_TOKEN}&country=us&types=address&limit=5`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((data) => {
        const places = (data.features || []).map((f: any) => f.place_name as string);
        setSuggestions(places);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [debouncedQuery]);

  return suggestions;
}
