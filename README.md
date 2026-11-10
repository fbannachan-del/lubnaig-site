# lubnaig.com

The site is one page. Its backdrop is Loch Lubnaig drawn live in the browser: real terrain, with the
light and weather the loch has at the moment you look.

## Layout of this repository

- `index.html`, `assets/` : the built site that Render publishes (publish directory `./`).
- `src/` : the source. `src/scene/` is the 3D loch, `src/env.js` is sun, moon and weather,
  `src/data/` is the baked terrain.
- `public/` : files copied to the site root as they are (share image, icons, robots, sitemap).
- `scripts/build.mjs` : the build.

## Changing the site

    npm install
    npm run build          # writes dist/

Then copy the contents of `dist/` over the repository root (`index.html` and `assets/`) and commit.
A cleaner setup is to let Render build it: set the build command to `npm ci && npm run build` and the
publish directory to `dist`, then delete the built `index.html` and `assets/` from the root.

Text lives in `src/index.html`. The camera's route is in `src/scene/journey.js`. Colours for each
time of day and season are in `src/scene/look.js`.

## Handy URL switches

- `?light=dawn|day|dusk|night` : start on a preset instead of live.
- `?tier=high|mid|low` : force a quality level.
- `?offline` : skip the weather request.

## Data

- Terrain: Mapzen terrain tiles on AWS (Copernicus EU-DEM), baked to `src/data/`.
- Weather: MET Norway Locationforecast, requested by the visitor's browser. No key, no cookies.
- Sun and moon: computed with suncalc for 56.28N, 4.28W.
