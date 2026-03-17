import { Navigate, useSearchParams } from 'react-router-dom';

export default function Holdings() {
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();

  return <Navigate to={query ? `/portfolio?${query}` : '/portfolio'} replace />;
}
