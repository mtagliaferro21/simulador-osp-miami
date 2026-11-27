# Fiberlog OSP simulator

Static 360-degree teaching simulation with five viewpoints, interactive utility markers and inspection questions. Published through GitHub Pages.

## Image rendering

The complete panoramas remain available as the background. Twenty-one independently projected detail images improve the street, curbside assets and overhead pole views. They retain their native 1774 × 887 samples instead of being enlarged and resampled into a single panorama. `photo-details.js` records their original camera poses; both WebGL and the software fallback project them with bilinear sampling and feathered boundaries.

The overview also uses renewed imagery. These are generated educational recreations, not photographs of verified Miami-Dade assets. Peripheral areas retain the original imagery; strong zoom can still reveal limited source detail. Field photography would be required for a fully photographic, site-accurate survey.

GPU rendering supports device pixel ratio up to 2, a 3840-pixel width and a six-million-pixel frame budget. The software fallback reduces resolution while dragging and restores it when stationary.

## Validation

Run `node tests/panorama.test.cjs`. Preview `index.html` with a static web server. Changes to the published files retain the existing simulator URL.
