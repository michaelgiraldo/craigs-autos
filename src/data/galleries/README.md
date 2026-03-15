# Gallery Data

This folder stores gallery helpers that hydrate Astro content collections.

## Purpose

- `projects/` data: full case studies (example: Buick, Porsche).
- `src/content/galleries.json`: reusable service/category media.
- `src/content/showcases.json`: page-level showcase composition.

## Files

- `page-showcase.js`: collection-backed gallery/showcase resolver.
- `index.js`: shared exports.

## Notes

- Keep case-study assets in `src/assets/images/projects/`.
- Keep service assets in `src/assets/images/services/`.
- Keep before/after assets in `src/assets/images/before-after/`.
- Before/after file naming still uses `ba-<pairId>-before.jpg` and `ba-<pairId>-after.jpg`; the `pairId` in `src/content/galleries.json` must match the filename.
