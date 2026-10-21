# Changelog

What changed in each version of PondCube Collect. Versions follow
[semantic versioning](https://semver.org): big changes raise the first number, new
features the second, fixes the third.

## [0.6.0] - 2026-10-21

### Added

- On a phone or tablet, the app now shows once, as it opens, how to add it to your home screen, with a single Install button where the browser allows it. "Install the app" at the bottom of the screen brings it back.
- On iPhone and iPad it first asks you to send any records waiting to send: the app on your home screen can't see them.

### Changed

- The waiting-to-send box no longer suggests adding the app to your home screen: on iPhone that could leave waiting records behind.

## [0.5.0] - 2026-10-21

### Added

- Records can be saved without signal. A saved record waits on the device and is sent by itself once there's signal. The top panel shows how many records are waiting, with a "Send now" button to try straight away.
- A waiting record the server can't accept is marked "needs attention" with the reason, so you can tell your supervisor; the others are still sent.
- Use the app from your home screen ("Add to Home screen"), not a browser tab: a browser can clear records left waiting there. The app reminds you while records are waiting.

### Fixed

- Saving on a weak connection can no longer store the same record twice.
- A record saved without signal keeps its own date and time; setting the time for the next pond no longer changes it.
- On a shared device, records wait for the operator who made them to sign in, so they are never saved under someone else's name.
- The app now opens without signal straight after you first sign in. Before, it had to be opened once more with signal first.
- The feedback form's close button is now easy to see, in a strip at the top. In dark mode it was almost invisible.

## [0.4.0] - 2026-10-20

### Added

- A "Send feedback" link at the bottom of the app opens a short form to tell the team about problems, missing things or ideas, without leaving the app. Your name is filled in for you.

### Fixed

- Renaming an operator in Airtable, or giving their email address to someone else, no longer stops ponds and operators from being copied into the app.
- While a record is saving, its form is locked, so nothing you type in the meantime gets lost.

## [0.3.0] - 2026-10-19

### Added

- The app can be installed on a phone or tablet: use "Add to Home screen" (or "Install app") in the browser. It then opens full-screen with its own PondCube icon.
- Once installed, the app also opens without signal, so you can start a record at the pond. Open it once with signal after installing so it can be kept on the device. Saving still needs signal; until then the record is kept on the device as a draft.

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
