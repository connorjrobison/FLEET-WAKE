# FLEET WAKE

FLEET WAKE is a standalone, single-file command evidence application. It uses ship-level WAKE exports to answer: **What changed since the previous report, or since a selected date?**

## Current program

Open `WAKE FLEET - Only Secure in FS Sharepoint-current.html` in the approved SharePoint/Firepit host. The application renders immediately from its local offline copy, then reconciles with SharePoint in the background.

## Command review

- **Command Review:** compare the previous report, 3/6/12 months, or a chosen baseline and through date. Inspect gross losses, recoveries, new proficiency-watch requirements, level movement, endpoint totals, and named evidence.
- **Ship Progress:** compare ships with their actual source intervals and roster sizes, then open one ship's complete progression review.
- **Currency & Recovery:** review a named attention queue and conditional 30-day threshold exposure, with source age and unknown evidence visible.
- **Training Evidence:** filter activity and distinct evolution occurrences by ship/month, alongside separately observed progression and dated MSA outcomes.
- **OFRP Review:** compare the same ships grouped by baseline phase, with phase changes and missing comparisons visible.
- **Evidence Search:** filter retained watch records and export the matching rows, distinguishing exact-day, month-only, and undated evidence.
- **Upload History:** inspect source chronology, preserved rosters, backfills, corrections, repeated files, and rejected imports.
- **Guide:** review definitions, evidence limits, coverage settings, and the existing backup/SharePoint workflow.

Use **Evidence CSV** or **Print CO brief** in Command Review to export the selected comparison. Browser print can save the brief as PDF; a blocked print window falls back to downloadable HTML.

## How to read the history

The source export timestamp anchors an observation. Comparison dates and months use UTC; displayed upload timestamps use the browser's local time. Upload time does not substitute for a missing source date. A selected baseline uses the latest dated observation on or before that date; the screen shows the actual dates used. Months with no observation remain unknown. The first dated report establishes a baseline and does not prove zero changes.

Changes are observed between reports; their exact occurrence dates are usually unknown. A watchstander can lose and regain currency in one period, so gross movements remain separate from net endpoint changes. Matching uses normalized ship and person names. Added or absent names indicate export membership, not proven arrival or transfer dates. Unknown currency never counts as a confirmed loss or recovery.

Historical status remains frozen. Currency today ages from the latest dated numeric evidence under the explicit assumption of no later qualifying watch. A fresh export is needed to confirm actual status. Newer undated roster conflicts are flagged. Previously erased historical records cannot be reconstructed without the original exports; those files can be imported again as backfills.

## Ship import behavior

- A WAKE ship JSON or CSV export creates the ship when it is not already in the fleet database.
- A newer authoritative export for the same ship replaces that ship's current roster and log evidence.
- Older dated exports build historical comparisons without replacing newer current bridge evidence. Replaying a retained historical source cannot rewind the current record.
- Other ships remain unchanged.
- Prior same-ship snapshots, source-file history, and assessment outcomes remain available for audit/history.
- Historical roster membership survives departures from newer exports. Historical metrics do not follow changes to today's roster or logs.
- Same-source-time corrections are flagged and retained; repeated sources do not manufacture progress.
- Importing a Fleet Backup is the separate whole-fleet replacement workflow.
- Submitted watch hours are counted once from each base watch row. Related event and special-condition rows remain evidence without inflating watchstander or fleet-hour totals.

## SharePoint performance

The current build uses local-first rendering, cached list discovery, bounded parallel manifest checks, cached-snapshot fingerprint reuse, and bounded concurrent snapshot-chunk writes. The existing numbered-list rollover, integrity checks, offline copies, and live polling remain in place.

## Verification

With Node.js installed, run:

```powershell
node --test work/regression/*.test.cjs
```

Command UI and analytics sources live under `work/progression/`. After editing those modules, regenerate the inline bundle with:

```powershell
node work/progression/build-command-progress.cjs
```

The distributed HTML remains self-contained. The regression suite verifies the protected SharePoint persistence block against its pre-revamp hash. Local tests and browser checks do not establish authenticated tenant permissions or successful live SharePoint writes.

Do not commit operational WAKE exports, Fleet backups, generated status reports, or files containing watchstander data. The repository ignore rules exclude those local artifacts by default.
