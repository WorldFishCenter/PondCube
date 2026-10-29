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
A place with Ponds, identified by a three-letter code (`SITE` in the WorldFish DMS v3),
e.g. `PEN` (Batu Maung).
_Avoid_: location (the old log's word for an area such as Fish Tank 3)

**Species**
The species a Pond holds, identified by two uppercase letters (`SPECIES` in the WorldFish DMS v3),
e.g. `ON` (_Oreochromis niloticus_).
_Avoid_: strain, species strain

**Operator**
A person on site who makes observations; signs in with their own account, which is
matched to them by the email on the operator list. Linked to one or more Sites, and sees
and records only their Ponds.
_Avoid_: user, staff

**Person**
The Operator who made a particular Record (the Operator in the recording role); `PERSON`
in the WorldFish DMS v3.
_Avoid_: enumerator, author, creator

**Who & where**
The signed-in Operator and the Pond chosen on a device before recording; every Record
made there carries both. They share the top panel ("Who, where & when") with Recorded-at.
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
Dissolved oxygen and temperature (required) plus optional pH, ammonia, nitrite and
nitrate, taken in a Period.
_Avoid_: WQ entry, measurement

**Period**
The time of day a Water-quality reading belongs to: morning or afternoon.
_Avoid_: shift, session

**Feed**
A feed used at a Site, identified by three characters (`FEED` in the WorldFish DMS v3), e.g. `SUP`;
each Site has its own list.
_Avoid_: feed type

**Feeding event**
An amount of feed given to a Pond, optionally with the Feed used and number of feedings.
_Avoid_: feed log

**Mortality record**
A count of dead fish removed from a Pond, optionally with a cause of death (one of the DMS's four).
_Avoid_: death event, loss

**Sampling event**
A sample of fish taken from a Pond, made of one or more Fish measurements.
_Avoid_: sample (alone), weighing

**Fish measurement**
The weight (total weight, `WT` in the DMS), standard length (`LEN_ST`) or both of one sampled
fish within a Sampling event.
_Avoid_: fish row, specimen

**Recorded-at**
The instant the observation was made (not when it was saved), entered in the
Operator's local time. Set in the top panel for each Record: it starts empty and
clears after every save, so no Record inherits an earlier one's time.
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
