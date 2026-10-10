import { useEffect, useState } from "react";
import { getAnalyticsOverview, type AnalyticsOverview } from "./api";

export function useAnalyticsOverview(pollIntervalMs = 30000) {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const overview = await getAnalyticsOverview();
        if (!cancelled) {
          setData(overview);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setError("Couldn't load analytics from the backend.");
        }
        console.error("Error loading analytics:", loadError);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollIntervalMs]);

  return { data, error, lastUpdated };
}
