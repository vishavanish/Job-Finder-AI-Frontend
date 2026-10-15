import { useEffect, useState } from "react";
import type { ProviderSettings } from "../../lib/api/types";
import { getProviders } from "../models/modelsApi";

const SEARCH_SOURCES = ["linkedin", "indeed", "naukri"];

/** The user's job-source settings from the server (null until loaded or if the request failed). */
export function useSources(): ProviderSettings | null {
  const [data, setData] = useState<ProviderSettings | null>(null);
  useEffect(() => {
    let active = true;
    getProviders()
      .then((res) => active && setData(res))
      .catch(() => active && setData(null));
    return () => {
      active = false;
    };
  }, []);
  return data;
}

/**
 * Search fields from the user's switches. The server still drops anything that
 * can't run (admin switch, Free tools only, missing key) and reports it back.
 */
export function searchSourceFields(data: ProviderSettings | null): {
  sources: string[];
  enable_naukri_apify: boolean;
} {
  if (!data) return { sources: ["linkedin", "indeed"], enable_naukri_apify: false };
  const on = new Set(data.sources.filter((s) => s.enabled).map((s) => s.key));
  return {
    sources: SEARCH_SOURCES.filter((k) => on.has(k)),
    enable_naukri_apify: on.has("naukri_apify"),
  };
}
