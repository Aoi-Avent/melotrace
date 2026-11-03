import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initViewportFix } from './utils/viewport';
import { applyThumbPrefs, loadThumbPrefs } from './utils/thumbPrefs';
import { applyUiPrefs } from './utils/uiMode';
import { initNative } from './utils/nativeInit';
import { schedulePlayLogPrune } from './utils/playLog';

initViewportFix();
applyThumbPrefs(loadThumbPrefs());
applyUiPrefs();
initNative();
schedulePlayLogPrune();

createRoot(document.getElementById('root')!).render(<App />);
