# Changelog

What changed in each version of PondCube Collect. Versions follow
[semantic versioning](https://semver.org): big changes raise the first number, new
features the second, fixes the third.

## [0.11.0] - 2026-11-01

### Changed

- Water readings are now taken in rounds, as the operators asked. Pick an area once and its ponds are listed with dissolved oxygen and temperature side by side. Type the two readings and tap Save: the app saves them and moves to the next pond, about two taps per pond instead of six. On a pond left empty the same button says Skip, and no reading is made for it.
- Save stays in the same place under your thumb. The entry bar moves to the top of the screen when you tap into it or tap a pond, and the list then follows it.
- Each pond in the list says where its reading is: Saved, Waiting (kept on this phone until it can be sent) or Not saved. The entry bar confirms each save as you go, and shows how far you got.
- The entry bar is built around the walk from pond to pond: a big pond number to check against the pond, larger boxes for the two readings, and a wide Save button right under them. Morning or afternoon and the date moved to the top of the list.
- Decimals work the same on every phone, with a point or a comma (1.5 or 1,5), on every tab. A number that could mean two things, such as 1,500 kg of feed, is refused with a message rather than guessed.
- On a pond where nothing has been typed, Skip works only once the pond has been on screen for a second, so a double tap can't skip a pond.
- Each reading takes the time you tap Save, so there's no date to set. To type in readings written down on paper, turn on Typing from paper and set when you took them. After more than half an hour away from the app, it asks for that date and time again.
- The app shows how far you got in the round, even after closing it, and starts a new round on its own in the afternoon and the next day. It keeps saving with no signal, as before.
- pH, ammonia, nitrate, nitrite and remarks are under More readings, on the pond that needs them. They close again on the next pond.
- A reading typed earlier and never saved (on another day, or by someone else on this phone) shows on its pond, but it's saved only if you tap Save a second time or type over it.
- To correct a reading during the round, tap its pond: its values show faded in the boxes, and you type the new ones over them. They replace the old ones in the download, its averages and the data link, at the time of the reading they correct, even if you correct it after noon. The old values are kept in the database.
- The pond list on the Feeding, Mortality and Sampling tabs is grouped by area, and those tabs open on the pond the round has reached.
- The notice about records waiting to send no longer appears while a record is sending normally, so the screen doesn't jump. On the Water tab it sits under the entry bar, so Save stays under your thumb when the signal drops.
- Less to read and scroll past: the tabs are now at the top of the screen, with the entry bar right under them. The "Who, where & when" panel and the titles repeating each tab's name are gone, and your name now sits under the app's title.
- Easier to read: the links at the bottom of the screen in dark mode, red warnings and errors, and grey helper text.
- The app now looks and reads the same in every section. A record's state has the same word, icon and colour everywhere. Units are always in the field's name, every optional field says Optional, and the free-text box is always called Remarks. Numbered instructions and tabs look the same everywhere, and the sign-in page has the app's header.
- Every button and field is now big enough to tap easily, including the date button, the pond field, the theme button, the Typing from paper switch and the links at the bottom of the screen.
- The screen no longer jumps as the app finishes loading.

## [0.10.0] - 2026-10-30

### Added

- "Your data" at the bottom of the screen on a tablet or computer: download a month of your site's water-quality readings as an Excel file. It has every reading in a table you can filter, one tab per area laid out like the old log (ponds down, days across, morning above afternoon), and averages per pond and per day, ready for charts. Readings outside their plausible range are red; a day with more than one reading shows the latest in yellow (or red), with a note. Readings from the old log are included.
- A data link: a private key for a spreadsheet that keeps itself up to date, in Excel or Google Sheets, with every record of your site; the app shows how to add it to either. Keep it, and any sheet you paste it into, like a password. Making a new one stops the old one, and it stops working if you leave the operator list.
- Dates, times and morning or afternoon in these files follow your site's local time, even for records sent from elsewhere.

### Changed

- The app now follows the 2025 edition of WorldFish's shared data standard. Causes of death are its eleven, as it writes them: plain "Cull" is replaced by four kinds of cull (after the harvest measurement, after mating, final, other), and handling, measurement, tagging deaths and missing fish now have their own cause. In your data files, samplings are marked as routine pond monitoring.

## [0.9.0] - 2026-10-29

### Changed

- Water quality: the time of day is now set by the date & time at the top, so it can't disagree with it: before noon is morning, from noon on is afternoon. It shows as a small label next to the form's title instead of two buttons.
- The date & time at the top can no longer be later than now. Future days can't be picked, and a record set later than now isn't saved until you correct it.

### Fixed

- If the pond remembered on your device is no longer on your list (retired, or at another site), the app now asks you to pick a pond instead of recording to one it doesn't show.
- After saving a sampling, the message counts only the fish you measured, not rows left blank.

## [0.8.0] - 2026-10-29

### Changed

- The app now follows WorldFish's shared data standard for its breeding programmes, so its records line up with those of the other sites. You'll see it in the field names (Person, Pond, Cause of death, Total weight, Standard length, Feed), in the four causes of death (Cull, Unknown, Disease_parasites, Water_quality), and in sampling, where the length to measure is now the standard length: from the tip of the snout to where the tail fin starts.
- Ready for more sites: you see and record only the ponds of your own site (or sites), and each site has its own feed list, which replaces Pellet, Mash and Other.
- Records waiting to send and half-filled forms from before this update carry over. A feed type or cause of death that's no longer offered is kept in the remarks or note.

## [0.7.0] - 2026-10-22

### Changed

- Signing in is now the same for everyone: enter your email, then the code sent to it. There's no separate sign-up and no password; if you used one before, use the emailed code instead.
- If your email isn't on the operator list, the app now shows which email you signed in with, so you know what to ask your supervisor to add.

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
