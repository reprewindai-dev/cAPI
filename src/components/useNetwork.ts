"use client";

import { useCallback, useEffect, useState } from "react";
import type { NetworkSnapshot } from "@/lib/network/snapshot";
import { getJSON } from "./util";

export function useNetwork(pollMs = 15000): { network: NetworkSnapshot | null; failed: boolean; refresh: () => void } {
  const [network, setNetwork] = useState<NetworkSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    getJSON<NetworkSnapshot>("/api/network")
      .then((snapshot) => {
        setNetwork(snapshot);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { network, failed, refresh };
}
