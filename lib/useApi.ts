import { useState, useEffect, useCallback } from "react";

export function useApi<T>(url: string, defaultValue: T) {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
      console.error(`fetch ${url} error:`, e);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
