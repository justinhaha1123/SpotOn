# snapshot log — append one line per snapshot; this file must survive hibernation
20261024-2251 d2b6-provB — D2 complete 36/36 (29 mismatch, 6 unreachable, 1 unverified, 0 confirmed); Liberty PDF provenance appended; Brewery clause pending fix

## 20261025-1347 — d2b6-prov (D2 complete: provenance corrections, 2 rows)
- the-brewery-romford: stale provenance clause replaced. sundayRate/eveningRate/motorcycle/accessControl quoted from HTML of thebreweryromford.com/visit/parking (HTTP 200, 93266 bytes); hourly bands, dailyRate, saturdayRate, exit fees £12/£18 transcribed from tariff poster JPG (HTTP 200, 2012974 bytes). No PDF tariff linked from page.
- NOTE poster JPG byte drift: 2091093 (Step B, 2026-10-24) -> 2012974 (Section 2, 2026-10-25). Static asset should not change size; either CDN variant or operator re-upload. Transcribed bands NOT re-checked against the new image. D3: image-transcribed figures need their own trust tier.
- the-liberty-shopping-romford: original premise ("tariffs transcribed from PDF") was wrong. All tariff bands, dailyRate, saturdayRate, sundayRate, Park All Day cap, openHours, ANPR, payment/grace, parent&child, totalSpaces quoted verbatim from theliberty.co.uk/car-parking HTML (HTTP 200, 223907 bytes). PDF citations retained for T&C/privacy only.
- disabledBays=32 and evChargingBays=12 initially NO MATCH in raw HTML (Sections 3, 3b: 25 pages crawled). Section 3c/3d: both present verbatim on /car-parking; sentences split by inline <strong>/<i> tags. Matched after tag-strip. disabledBays also verbatim on /services-guest-information (216375 bytes). /general-customer-faqs paraphrases both.
- LESSON: verbatim-quote probes must tag-strip before matching. Raw-HTML includes() produces false NO MATCH on any sentence containing inline formatting.
- D3 flag: Liberty hasEvCharging/evChargingBays=12 is Tesla Supercharger only. Needs restriction/qualifier slot, not bare integer. FAQ wording ("2 hours free while charging") differs from /car-parking ("charge once within a 24-hour period").
- Verification totals unchanged: 36/36 (29 mismatch, 6 unreachable, 1 unverified, 0 confirmed).

## 2026-10-25 — dataset population audit + TfL batch check
- Dataset is 94 rows: 36 hand-entered seed (D2 complete: 29 mismatch / 6 unreachable / 1 unverified / 0 confirmed) + 58 TfL Unified API ingest rows (ids tfl-CarParks_800440–800503; six ids absent from the live feed too, not dropped by ingest).
- TfL rows re-checked against live https://api.tfl.gov.uk/Place/Type/CarPark on 2026-10-25: 0/58 drift on totalSpaces, disabledBays, heightRestriction, dailyRate (cashless), saturdayRate, sundayRate, openHours, paymentMethods, postcode, notes (whitespace-only diffs). `modified` stamps unchanged since 2026-09-22T10:35:36Z. `verifiedAt` column on TfL rows = TfL `modified`, not a verification date.
- Code findings (server.ts, not yet fixed): cctvMonitoring coerces non-"True" to false (l.439); staffed ORs StaffedSite|PatrolledSite (l.392); dailyRate stores cashless only, cash is higher on 57/58.
- Occupancy endpoint (27 rows have OccupancyUrl) returned HTTP 500 on 2026-10-25 18:01 UTC; not usable until it responds.
- Removed verification/backups/ (byte-identical duplicates of the first two snapshots here).
- D3 policy: B — three tiers verified > api > null.
- Addendum 18:05 UTC: Occupancy is down service-wide (collection endpoint /Occupancy/CarPark also 500), not an id problem. occupancyEndpoint will be stored but unused until a 200 is observed.
- Addendum: .git/ was dropped by the 17:58 UTC hibernation (second time; cc2cb53 and prior history lost). Tree files incl. this directory survived. From now on git history is kept as verification/snapshots/spoton.bundle (regenerated on every commit) and the repo is re-initialised from it after each restore. Commit hashes in this file before this line no longer resolve.

## 2026-10-25 — Step 8: api-match stamping (TfL rows)
- 58/58 `source=tfl` rows stamped `verify_status=api-match`, `checked_on=2026-10-25`, `verify_notes` = fields compared + verifiedAt caveat. Script: scripts/stamp-tfl-api-match.mjs (aborts if any tfl row already stamped, CR present, or count != 58). Seed rows untouched (diff = 58 lines).
- verify_status enum is now: mismatch | unreachable | unverified | api-match. Policy B mapping: first three -> tier `verified` (with outcome), api-match -> tier `api`, "" -> null.
- D3 notes: `verifiedAt` is populated only on tfl rows (TfL `modified`), empty on seeds — two meanings in one column, to be split. `eveningRate` and `evChargingSpeedKw` are empty on all 94 rows. Verification sheet is 34 columns (28 facility + source, sourceUrl, verifiedAt, verify_status, verify_notes, checked_on); the "14-field" figure refers to the Gemini export shape, not this file.
- Git: RESTORE.md recipe proven on a scratch tree with no .git (status empty at bundle HEAD). Snapshots stored byte-exact via `verification/snapshots/*.csv -text` (last line in .gitattributes — last match wins). Bundle is git-ignored.

## 2026-10-26 — third hibernation: bundle lost (was git-ignored)
- Overnight hibernation dropped .git/, node_modules/ AND verification/snapshots/spoton.bundle. Cause: container persistence excludes .gitignore-matched paths; the bundle was ignored in 7b (41331ee). Commits 18b0e99..694b5bc no longer resolve. All non-ignored tree files survived; live CSV byte-identical to seed-verification.2026-10-25.step8-api-match.csv.
- Policy change: bundle is NOT ignored and NOT tracked (untracked non-ignored files have survived every hibernation so far). Stage with `git add -A -- . ":!verification/snapshots/spoton.bundle"`. Re-init from tree as the new root commit.
