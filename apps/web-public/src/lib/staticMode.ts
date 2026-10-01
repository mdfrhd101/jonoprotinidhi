/* STATIC_EXPORT=1 builds the public site as plain files for GitHub Pages (`output: 'export'`, see next.config.mjs and
   scripts/build-static.mjs). Read on the server at build time only; client code needs nothing from it (the browser
   learns where the API is from NEXT_PUBLIC_API_ORIGIN, see publicApi.ts). Unset = the normal server-rendered site. */
export const STATIC_EXPORT = process.env.STATIC_EXPORT === '1';
