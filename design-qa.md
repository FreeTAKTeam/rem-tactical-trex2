# Design QA

Source: user-provided rugged tactical T-Rex 2 watch reference.

Implementation captures:

- `assets/trex2/preview-v2.png` generated at 454 x 454.
- `assets/trex2/emulator-v2.png` captured from the live T-Rex 2 emulator.

## Comparison

- Circular black tactical dial and topographic texture match the source direction.
- Green telemetry labels, white primary values, and orange accent preserve the source palette.
- Large centered time remains the dominant element.
- Heart rate and battery occupy the upper telemetry row.
- Date separates the clock from three lower status panels.
- GPS, compass/heading, operator/team, and last-sync areas now match the requested hierarchy.
- Outer content remains inside the T-Rex 2 round-screen safe area.
- Live emulator rendering confirms that the clock, seconds, and bottom strip do not overlap.
- AOD reduces the face to time and date on pure black.

## Remaining Differences

- Zepp OS uses the device system font rather than the distressed display face in the concept.
- GPS and heading are clearly presented as replaceable mock REM data because those live watch-face APIs are unavailable here.
- Decorative hardware belongs to the physical T-Rex 2 bezel and is not duplicated on-screen.

final result: passed
