import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { UiFeedbackProvider } from './components/UiFeedbackProvider';
import './index.css';
import { installGeminiKeyInjector } from './utils/geminiKey';

installGeminiKeyInjector();

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(
  <UiFeedbackProvider>
    <App />
  </UiFeedbackProvider>
);
