# FLEET WAKE

FLEET WAKE is a standalone, single-file fleet analytics application. It keeps the familiar Fleet Overview, Ship List, and ship screens, with calendar-month comparisons and interactive charts.

## Current program

Open `WAKE FLEET - Only Secure in FS Sharepoint-current.html` in the approved SharePoint/Firepit host. The application renders immediately from its local offline copy, then reconciles with SharePoint in the background.

## Fleet and ship review

- **Fleet Overview:** compare September with August, or choose other calendar months. See lost/restored currency and level changes, with names and source dates in expandable evidence.
- **Fleet chart:** view every ship's hours, current currency, Level 2+ depth, or lost currency in both selected months. Select a ship to open its activity chart.
- **Ship View:** select any retained month in the chronological hours/evolutions chart. Select a date or evolution to open matching watch logs, then open an individual log's source details. The ship's calendar comparison follows the selected month.
- **Last watch conducted:** displays the latest retained watch with an exact recorded date, and time when supplied. Month-only and future dates cannot establish the last watch.
- **Ship List, Decision Board, Evolutions, OFRP, All Data, Import Report, and References:** retain the established screens and workflows.

Tabs replace the visible page and reset its scroll position. Backup, export, WAKE input, and SharePoint controls retain the established workflow.

## How to read the history

The source export timestamp anchors an observation. Calendar comparisons use the latest valid dated report **inside each selected month**, regardless of upload order. September versus August is a comparison of those months' recorded statuses. A missing August report cannot be replaced by July or by an upload timestamp. The source dates remain available in the evidence details; they do not prove month-end status or the exact day a change occurred. Comparison dates and months use UTC.

Monthly change counts compare the two selected monthly endpoints. Fleet totals include only ships with evidence in both months. Matching uses normalized ship and person names. Added or absent names indicate export membership, not proven arrival or transfer dates. Unknown currency never counts as a confirmed loss or recovery. Intermediate changes within a month are not attributed to a specific date.

Historical status remains frozen. Currency today ages from the latest dated numeric evidence under the explicit assumption of no later qualifying watch. A fresh export is needed to confirm actual status. Newer undated roster conflicts are flagged. Previously erased historical records cannot be reconstructed without the original exports; those files can be imported again as backfills.

## Ship import behavior

- A WAKE ship JSON or CSV export creates the ship when it is not already in the fleet database.
- A newer authoritative export for the same ship replaces that ship's current roster and log evidence.
- Older dated exports build historical comparisons without replacing newer current bridge evidence. Replaying a retained historical source cannot rewind the current record.
- Other ships remain unchanged.
- Prior same-ship snapshots, source-file history, and assessment outcomes remain available for audit/history.
- Historical roster membership survives departures from newer exports. Historical metrics do not follow changes to today's roster or logs.
- Retained bridge-watch rows accumulate in a separate activity history for the ship chart. A newer current export can replace today’s current log set without erasing earlier month activity; repeated or corrected log identities keep the later source version.
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
