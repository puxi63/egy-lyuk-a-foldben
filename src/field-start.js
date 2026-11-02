/* ==== field-start.js — starts the field workers (field-gen.js) as soon as the module graph begins to evaluate
   (NOTES-20-startup): main.js imports this first, so the workers run while three.js and the game's modules evaluate
   and the save loads. `?gen=main` keeps the old main-thread generate() (A/B tests), `?genw=N` sets the worker count.
   A worker failure resolves to null: the Game constructor then calls generate() on the main thread. ==== */
import { generateInWorkers } from './field-gen.js';
// The loading screen's progress line (NOTES-21-screens): the same module instance index.html already loaded.
import { loading } from './ui/loading.js';

const params = new URLSearchParams(location.search);

/** Promise of generateInWorkers()'s stats, or null (main-thread fallback). */
export const fieldGen = params.get('gen') === 'main'
  ? Promise.resolve(null)
  : generateInWorkers(+params.get('genw') || undefined, (done, total) => loading.progress(done, total)).catch((e) => {
    console.warn(e);
    return null;
  });
