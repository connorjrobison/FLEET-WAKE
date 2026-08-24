# FLEET WAKE

FLEET WAKE is a standalone, single-file fleet analytics application for importing ship-level WAKE exports and reviewing bridge watchstander hours, levels, currency, evolutions, and OFRP posture.

## Current program

Open `WAKE FLEET - Only Secure in FS Sharepoint-current.html` in the approved SharePoint/Firepit host. The application renders immediately from its local offline copy, then reconciles with SharePoint in the background.

## Ship import behavior

- A WAKE ship JSON or CSV export creates the ship when it is not already in the fleet database.
- A later authoritative export for the same ship replaces that ship's current roster and log evidence.
- Other ships remain unchanged.
- Prior same-ship snapshots, source-file history, and assessment outcomes remain available for audit/history.
- Importing a Fleet Backup is the separate whole-fleet replacement workflow.
- Submitted watch hours are counted once from each base watch row. Related event and special-condition rows remain evidence without inflating watchstander or fleet-hour totals.

## SharePoint performance

The current build uses local-first rendering, cached list discovery, bounded parallel manifest checks, cached-snapshot fingerprint reuse, and bounded concurrent snapshot-chunk writes. The existing numbered-list rollover, integrity checks, offline copies, and live polling remain in place.

## Verification

With Node.js installed, run:

```powershell
node --test work/regression/fleet-wake-regression.test.cjs work/regression/fleet-wake-sharepoint-responsive.test.cjs work/regression/index-shiphandling-board-review.test.cjs
```

Do not commit operational WAKE exports, Fleet backups, generated status reports, or files containing watchstander data. The repository ignore rules exclude those local artifacts by default.
