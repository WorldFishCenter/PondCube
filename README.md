# PondCube · Collect

A field data collection app for WorldFish's PondCube aquaculture facility at the
Penang headquarters. It lets the people working the ponds record what they observe
— water quality, feeding, mortality and fish sampling — from a phone or tablet at
the pondside, and keeps that data clean, consistent and in one place.

## Why it exists

WorldFish improves aquatic food systems to reduce hunger and poverty, and that
work runs on trustworthy data. A culture pond only tells its story if the daily
observations about it — the oxygen that dipped overnight, the feed that went in,
the fish that died, the sample that showed growth — are captured reliably and can
be compared across ponds and over time.

PondCube Collect exists to make those observations:

- **easy to record** where they happen, by the people who make them, without
  training on a complex tool;
- **trustworthy**, by catching impossible values the moment they're entered;
- **resilient**, so a dropped signal or a closed tab never loses a reading;
- **connected**, so manual records sit in the same dataset as the pond registry
  and, in time, the facility's sensor data — every record tied to the pond it
  belongs to.

## What it does

**One place, one pond, one observation at a time.** An operator opens the app,
says who they are and which pond they're standing at, and records what they see.

The four kinds of observation:

- **Water quality** — dissolved oxygen and temperature, plus pH, ammonia, nitrite
  and nitrate when taken, logged for the morning or afternoon round.
- **Feeding** — how much feed went into the pond, with feed type and number of
  feedings.
- **Mortality** — how many fish were removed dead, and the suspected cause.
- **Sampling** — a batch of individual fish weights and lengths, captured together
  as one sampling event.

## What makes it fit the field

- **Every pond, found fast.** All 296 coded ponds across the site — earthen ponds,
  fish tanks, hatchery and storage tanks — are searchable from one picker, so the
  right pond is two taps away.
- **Built for a phone at the pondside.** Large touch targets, a layout that works
  one-handed, and no fiddly controls.
- **No logins to slow anyone down.** Operators pick their name from a list; a
  single shared site code, entered once per device, is all that gates saving.
- **Nothing lost to a bad signal.** A half-finished record is saved on the device
  as you go and is still there after a refresh, a lost connection, or switching
  ponds. It clears only once the record is safely saved.
- **Bad numbers can't get in.** A reading outside its plausible range (say
  dissolved oxygen above 20 mg/L) is refused as it's typed — and checked again
  before it's stored — so the dataset stays clean at the source.
- **Continuous with the past.** Each pond carries how it was named in the old
  records, so new observations line up with the facility's history instead of
  starting from scratch.

## Where the data goes

Records are written to a single aquaculture database for the facility, hosted close
to Penang. The pond registry is maintained in Airtable as the human-friendly place
to add and edit ponds, and flows from there into the collection database. Sensor
data from the facility is planned to join the same database, meeting the manual
records pond-by-pond.

## For developers

Setup, infrastructure, the data model and deployment are documented in
[`docs/architecture.md`](docs/architecture.md). The shared domain vocabulary is in
[`docs/glossary.md`](docs/glossary.md), and working conventions for this codebase
are in [`CLAUDE.md`](CLAUDE.md).
