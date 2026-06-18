"use client";

import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "@/lib/covenant/api";
import { getJSON } from "./util";

export function useLive(pollMs = 5000): {
  data: Snapshot | null;
  refresh: () => void;
  loading: boolean;
} {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    getJSON<Snapshot>("/api/state")
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    const onEvent = () => refresh();
    window.addEventListener("covenant:refresh", onEvent);
    return () => {
      clearInterval(id);
      window.removeEventListener("covenant:refresh", onEvent);
    };
  }, [refresh, pollMs]);

  return { data, refresh, loading };
}
