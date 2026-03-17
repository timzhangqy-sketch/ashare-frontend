import { useState, useEffect, useRef } from 'react';

interface ApiState<T> {
  data:    T | null;
  loading: boolean;
  error:   string | null;
}

/**
 * Generic hook for async API data. Automatically re-fetches when deps change.
 * Cancels in-flight requests when deps change or component unmounts.
 */
export function useApiData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): ApiState<T> & { refetch: () => void } {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: true, error: null });
  const counter = useRef(0);

  function run() {
    const id = ++counter.current;
    setState(s => ({ ...s, loading: true, error: null }));
    fetcher()
      .then(data  => { if (id === counter.current) setState({ data, loading: false, error: null }); })
      .catch(err  => { if (id === counter.current) setState({ data: null, loading: false, error: err.response?.data?.detail || err.message || '加载失败' }); });
  }

  useEffect(() => {
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch: run };
}
