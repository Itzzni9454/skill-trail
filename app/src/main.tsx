import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import ToastHost from './components/ToastHost';
import Home from './views/Home';
import RoadmapView from './views/RoadmapView';
import Dashboard from './views/Dashboard';
import EditorView from './views/EditorView';
import Dailys from './views/Dailys';
import HabiticaView from './views/HabiticaView';
import './index.css';
import { ThemeProvider } from './lib/theme';

function App() {
  return (
    <HashRouter>
      <ThemeProvider>
        <NavBar />
        <ToastHost />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/roadmap/:slug" element={<RoadmapView />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dailys" element={<Dailys />} />
          <Route path="/habitica" element={<HabiticaView />} />
          <Route path="/editor" element={<EditorView />} />
          <Route path="/editor/:slug" element={<EditorView />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </ThemeProvider>
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
