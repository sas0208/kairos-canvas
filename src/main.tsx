import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { VoiceStateProvider } from './contexts/VoiceStateContext';
import { ToastProvider } from './contexts/ToastContext';
import { CanvasStoreProvider } from './canvas/canvasStore';
import { installDemoFetch } from './demo/demoFetch';
import './index.css';
import './desktop-premium.css';
import './canvas-additions.css';
import './components/screens/screens.css';

// Demo mode (default): intercetta fetch/EventSource/WebSocket prima del render.
installDemoFetch();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VoiceStateProvider>
      <ToastProvider>
        <CanvasStoreProvider>
          <App />
        </CanvasStoreProvider>
      </ToastProvider>
    </VoiceStateProvider>
  </React.StrictMode>
);
