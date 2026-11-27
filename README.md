# Fiberlog OSP simulator

Static 360-degree teaching simulation with five viewpoints, interactive utility markers and inspection questions. Published through GitHub Pages.

## Image rendering

The complete panoramas remain available as the background. Twenty-one independently projected detail images improve the street, curbside assets and overhead pole views. They retain their native 1774 × 887 samples instead of being enlarged and resampled into a single panorama. `photo-details.js` records their original camera poses; both WebGL and the software fallback project them with bilinear sampling and feathered boundaries.

The overview also uses renewed imagery. These are generated educational recreations, not photographs of verified Miami-Dade assets. Peripheral areas retain the original imagery; strong zoom can still reveal limited source detail. Field photography would be required for a fully photographic, site-accurate survey.

GPU rendering supports device pixel ratio up to 2, a 3840-pixel width and a six-million-pixel frame budget. The software fallback reduces resolution while dragging and restores it when stationary.

## Validation

Run `node tests/panorama.test.cjs`. Preview `index.html` with a static web server. Changes to the published files retain the existing simulator URL.

## Learner response tracking

`tracking.js` records each Check Answer submission, preserves first and latest answers, counts correct/incorrect attempts, and supports Try Again without erasing history. View Results displays totals and exports a CSV. Public GitHub Pages runs anonymous tab-local practice; it does not report learner data to instructors.

Build the TalentLMS package with `python3 scripts/build-scorm.py ../deliverables/Fiberlog_OSP_SCORM12.zip`. Upload the ZIP as a SCORM 1.2 unit, not as a web link. See [SCORM_GUIDE.md](SCORM_GUIDE.md) for setup, reporting fields, question mapping, and the required portal acceptance check.

The single-SCO package requires an LMS API and obtains learner identity from it. It commits after each answer, stores compact cumulative state in suspend_data, and appends a unique choice interaction for every submission. Twelve zero-weight neutral numeric interactions provide per-question counters. First-answer score is reported as raw score; completion requires all four questions to be answered at least once. This is unlimited practice, with no pass/fail threshold. LMS review/browse is read-only. Pending save retries reuse existing interaction indices. No learner records or credentials are published in this repository.

Run `node --test tests/tracking.test.cjs tests/panorama.test.cjs`. Tracking tests cover retries, failed commits/partial writes, resume, review mode, scores, completion, concurrent-tab detection, CSV escaping, and the SCORM 1.2 suspend-data budget. The native TalentLMS report layout must still be tested in the target portal. SCORM ZIP updates require re-uploading the package; they do not inherit GitHub Pages deployments.
