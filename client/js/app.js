/* ══════════════════════════════════════════════════════════════
   APP — Vite build entry point.
   Bundles the full client (main.js bootstrap + all feature modules)
   and imports the consolidated stylesheet (css/index.css) directly
   from a module, per the ES-modules + Vite setup. Produces the
   production bundle in client/dist/ via `npm run build`.
   ══════════════════════════════════════════════════════════════ */

import './main.js';
import '../css/index.css';
