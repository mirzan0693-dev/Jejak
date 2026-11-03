// Renders every vehicle style x colour with three.js in headless Chromium and writes the app's PNG layers
// plus src/vehicleImages.ts. Usage: node tools/vehicles/render.mjs [--preview out.png]
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const OUT = join(root, 'assets', 'vehicles');
const SS = 2; // render at 2x, downscale for clean edges
const W = 216, H = Math.round((W * 46) / 64); // app shows 64x46 on the map (3.4x) and 128 wide in the picker

const CARS = ['hatchback', 'sedan', 'suv', 'mpv', 'pickup'];
const BIKES = ['scooter', 'kapcai', 'superbike', 'cruiser', 'bicycle'];

const bundle = await build({
  entryPoints: [join(here, 'scene.js')],
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'error',
  absWorkingDir: root,
});
const js = bundle.outputFiles[0].text;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = [];
for (const [kind, styles] of [['car', CARS], ['motorbike', BIKES]]) {
  for (const style of styles) {
    const t0 = Date.now();
    const shots = await page.evaluate(
      ({ kind, style, w, h }) => {
        const V = window.__vehicles;
        window.__ctx = window.__ctx || V.createRenderer(w, h);
        return V.renderVehicle(window.__ctx, kind, style, V.PAINTS);
      },
      { kind, style, w: W * SS, h: H * SS },
    );
    for (const [layer, url] of Object.entries(shots)) {
      const file = `${kind}-${style}-${layer}@raw.png`;
      writeFileSync(join(OUT, file), Buffer.from(url.split(',')[1], 'base64'));
      index.push({ kind, style, layer, file });
    }
    console.log(`${kind} ${style}: ${Object.keys(shots).length} layers in ${Date.now() - t0} ms`);
  }
}
await browser.close();
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ W, H, SS, index }, null, 2));
console.log('raw renders done; run tools/vehicles/finish.py to downscale and write src/vehicleImages.ts');
