import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import OptionsPage from './options.tsx'
import { startBackgroundTasks } from './lib/backgroundTasks'

function AppRoot() {
  useEffect(() => {
    startBackgroundTasks();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/settings" element={<OptionsPage />} />
      </Routes>
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
