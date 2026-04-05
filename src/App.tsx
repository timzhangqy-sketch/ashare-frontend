import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import { CrossStrategyProvider } from './context/CrossStrategyContext';
import { ContextPanelProvider } from './context/ContextPanelContext';
import { DashboardRuntimeProvider } from './context/DashboardRuntimeContext';
import { DateProvider } from './context/DateContext';
import Dashboard from './pages/Dashboard';
import BacktestPage from './pages/BacktestPage';
import Holdings from './pages/Holdings';
import IgnitionList from './pages/IgnitionList';
import PatternScreen from './pages/PatternScreen';
import Portfolio from './pages/Portfolio';
import ExecutionPage from './pages/Execution';
import ResearchPage from './pages/Research';
import ResearchDetailPage from './pages/ResearchDetail';
import RiskPage from './pages/Risk';
import Retoc2Alert from './pages/Retoc2Alert';
import WeakBuyPage from './pages/WeakBuyPage';
import MlSelectPage from './pages/MlSelect';
import Signals from './pages/Signals';
import Watchlist from './pages/Watchlist';
import SystemPage from './pages/System';

export default function App() {
  return (
    <DateProvider>
      <DashboardRuntimeProvider>
        <CrossStrategyProvider>
          <ContextPanelProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="signals" element={<Signals />} />
                  <Route path="watchlist" element={<Watchlist />} />
                  <Route path="portfolio" element={<Portfolio />} />
                  <Route path="execution" element={<ExecutionPage />} />
                  <Route path="risk" element={<RiskPage />} />
                  <Route path="research" element={<ResearchPage />} />
                  <Route path="research/:detailTab/:detailKey" element={<ResearchDetailPage />} />
                  <Route path="research/:detailTab" element={<Navigate to="/research" replace />} />
                  <Route path="system" element={<SystemPage />} />

                  <Route path="ignition" element={<IgnitionList />} />
                  <Route path="retoc2" element={<Retoc2Alert />} />
                  <Route path="pattern" element={<PatternScreen />} />
                  <Route path="weak-buy" element={<WeakBuyPage />} />
                  <Route path="ml-select" element={<MlSelectPage />} />
                  <Route path="holdings" element={<Holdings />} />
                  <Route path="backtest" element={<BacktestPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ContextPanelProvider>
        </CrossStrategyProvider>
      </DashboardRuntimeProvider>
    </DateProvider>
  );
}
