# Domain glossary

The shared language of PondCube Collect. Use these terms exactly — in code, UI
copy, column names and conversation — and avoid the listed alternatives so the
vocabulary stays consistent across the app, the database and the collection schema.

## Ponds and people

**Pond**
A coded culture unit at a site (earthen pond, fish tank, hatchery tank or storage
tank) that records are made against.
_Avoid_: asset, unit, tank (as the general term)

**Pond code**
The stable identifier of a Pond, e.g. `PEN-FT3-091` (site, area, number).
_Avoid_: pond ID, tank number

**Legacy location / legacy tank ID**
How a Pond was named in pre-app historical data; together they map each historical
row onto exactly one Pond.
_Avoid_: old code

**Site**
A place with Ponds, identified by a three-letter code (`SITE` in the WorldFish DMS v5),
e.g. `PEN` (Batu Maung). Each has a time zone (e.g. `Asia/Kuala_Lumpur`): the dates and times people see
of its Records are in it.
_Avoid_: location (the old log's word for an area such as Fish Tank 3)

**Area**
A named group of Ponds at a Site, e.g. Fish Tank 3 or Hatchery: how Operators find a Pond and walk a Round. Not a name
in the WorldFish DMS v5 (`docs/naming-alignment.md`, Q5).
_Avoid_: facility, location, zone

**Species**
The species a Pond holds, identified by two uppercase letters (`SPECIES` in the WorldFish DMS v5),
e.g. `ON` (_Oreochromis niloticus_).
_Avoid_: strain, species strain

**Operator**
A person on site who makes observations; signs in with their own account, which is
matched to them by the email on the operator list. Linked to one or more Sites, and sees
and records only their Ponds.
_Avoid_: user, staff

**Person**
The Operator who made a particular Record (the Operator in the recording role); `PERSON`
in the WorldFish DMS v5.
_Avoid_: enumerator, author, creator

**Who & where**
The signed-in Operator (named under the app's title) and the Pond being recorded: chosen above the form, with
Recorded-at, or in a Round the one it has reached. Every Record made there carries both.
_Avoid_: context, session

## Records

**Record**
One observation a Person makes about a Pond at a Recorded-at instant.
_Avoid_: entry, submission, row

**Record kind**
Which of the four kinds a Record is: Water-quality reading, Feeding event,
Mortality record or Sampling event.
_Avoid_: record type, form, tab

**Water-quality reading**
Dissolved oxygen ("Oxygen" in the Round's bar, for room) and temperature (required) plus optional pH, ammonia, nitrite and
nitrate, taken in a Period.
_Avoid_: WQ entry, measurement

**Round**
An Operator's walk through an Area's Ponds in one Period, taking a Water-quality reading at each. Each filled row is its
own Record, saved by tapping Save; on a Pond left empty that button says Skip, and makes none. The Round itself isn't stored: its progress is kept on the
device, only to show how far the Operator got.
_Avoid_: session, batch, shift

**Period**
The time of day a Water-quality reading belongs to: morning or afternoon. Set from the
Recorded-at hour (before noon: morning), never picked by hand.
_Avoid_: shift, session

**Feed**
A feed used at a Site, identified by three characters (`FEED` in the WorldFish DMS v5), e.g. `SUP`;
each Site has its own list.
_Avoid_: feed type

**Feeding event**
An amount of feed given to a Pond, optionally with the Feed used and number of feedings.
_Avoid_: feed log

**Mortality record**
A count of dead fish removed from a Pond, optionally with a cause of death (one of the DMS's eleven).
_Avoid_: death event, loss

**Sampling event**
A sample of fish taken from a Pond, made of one or more Fish measurements.
_Avoid_: sample (alone), weighing

**Fish measurement**
The weight (total weight, `WT` in the DMS), standard length (`LEN_ST`) or both of one sampled
fish within a Sampling event.
_Avoid_: fish row, specimen

**Correction**
A Water-quality reading that replaces an earlier one of the same Pond: made by retyping the Pond in the Round that has
its reading. It keeps that reading's Recorded-at, as the same observation. The replaced reading stays stored but isn't
shown in the download or the data link.
_Avoid_: edit, amendment, overwrite

**Recorded-at**
The instant the observation was made (not when it was saved), in the Operator's local time. In a Round it's the moment
of tapping Save, or with Typing from paper on, one date and time set for the readings being typed in; a Correction keeps
the one it corrects. For the other Record
kinds it's set above the form for each Record: it starts empty and clears after every save, so no Record inherits an
earlier one's time. Never later than now.
_Avoid_: timestamp, created at, date

**Range**
The plausible bounds for a measurement (e.g. dissolved oxygen 0–20 mg/L); a value
outside its Range is never accepted.
_Avoid_: limit, threshold

**Draft**
A Record still being filled in, kept on the device per Record kind and Pond until
it is saved (it then moves to the Outbox).
_Avoid_: autosave, cache, unsaved form

**Outbox**
The saved Records on a device that the server hasn't received yet. Each waits there,
with its own Recorded-at, until there's signal and the Operator who made it is signed
in; it leaves only once the server has it. Shown in the app as "waiting to send".
_Avoid_: queue, pending, sync

**Record intake**
Accepting a Record into the PondCube dataset: checked against its Ranges and stored
whole or not at all (a Sampling event never without its Fish measurements). A Record
sent twice (its first reply was lost) is stored once.
_Avoid_: submission handling, insert

## Seeing the data

**Water-quality download**
An Excel file of one Site's Water-quality readings for one month, laid out like the old log, made from the
database when asked for. A copy: changes made in it never reach the database.
_Avoid_: report, sync

**Data link**
A secret key that lets a spreadsheet (Excel Power Query, Google Sheets) read CSV files of every Record at the
Operator's Sites (a corrected reading only as its Correction), current each time it's read. One per sign-in account; making a new one stops the old one.
_Avoid_: API key, token, share link

**Provisional name**
An export column name the WorldFish DMS v5 hasn't settled yet (e.g. `TANK`, `DISSOLVED_OXYGEN`), listed in one
place so it can change once when the DMS settles it.
_Avoid_: alias, temporary column
