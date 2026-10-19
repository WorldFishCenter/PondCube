# Changelog

What changed in each version of PondCube Collect. Versions follow
[semantic versioning](https://semver.org): big changes raise the first number, new
features the second, fixes the third.

## [0.3.0] - 2026-10-19

### Added

- The app can be installed on a phone or tablet: use "Add to Home screen" (or "Install app") in the browser. It then opens full-screen with its own PondCube icon.
- Once installed, the app also opens without signal, so you can start a record at the pond. Saving still needs signal; until then the record is kept on the device as a draft.

## [0.2.0] - 2026-10-19

### Changed

- Each operator now signs in with their own account instead of entering a shared site code. Every device needs to sign in once after this update.
- Records are saved under the name of whoever is signed in, so you no longer pick your name at the top.
- The "Penang HQ" label at the top of the screen is gone.

### Added

- Operators' email addresses are kept in Airtable next to their names. Signing in with that email is what lets someone record; anyone else sees a message to ask their supervisor.

## [0.1.1] - 2026-10-11

### Fixed

- Ponds removed from Airtable now disappear from the pond list (their past records are kept).
- Copying ponds and operators from Airtable now checks everything first: a typo, a duplicate or a renamed column stops the copy with a clear list of what to fix, instead of quietly changing the app's lists.

## [0.1.0] - 2026-10-10

First version.

### Added

- Record water quality, feeding, mortality and fish sampling for any pond, from a phone or tablet.
- Pick your name, the pond, and the date and time once at the top; the date and time reset after each save.
- Values outside realistic ranges are caught as you type.
- Half-filled forms are kept on the device, so a lost signal or a closed tab loses nothing.
- A site code keeps the app private to the team.
- Light and dark mode, and a PondCube logo.
- Ponds and operators are managed in Airtable and copied into the app.
