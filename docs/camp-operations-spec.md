# Camp Operations Specification

**Status:** Pilot workflows approved. Implementation assumptions below are for review.  
**Related:** [Constitution](constitution.md) · [Registration specification](registration-spec.md) · [Sensitive decisions](sensitive-decisions.md)

## 1. Set up a camp week

- Maintain buildings and assignable dorms as editable inventory. Record physical bed capacity per dorm. Staff can take a dorm out of service and set fewer usable beds for a given week. Reserve one usable bed for each assigned adult Cabin Leader and each guest bed. Camp Counselors sleep together separately. The remainder is the dorm’s camper capacity, with a minimum of zero. Subtract existing camper placements when showing remaining beds during check-in.
- Configure the eligible age and gender group for each camper dorm per week. Require at least two adult Cabin Leaders per cabin. Camp Counselors stay together in separate housing and are not assigned to camper dorm teams or required for camper placement. Only dorms with usable beds and the required team are available for camper assignment.
- Preserve historical occupancy and Cabin Leader teams when inventory or staffing changes for future weeks.

### Reusable inventory and turnover

- Camp Leadership can add a dated camp week and select existing weeks for setup. Housing is managed separately. A building or room is created once and can be reused in every week.
- Camp Leadership can permanently delete an unused camper dorm or hotel room after explicit confirmation. Database references from weekly setup, reservations, assignments and history prevent deletion, including concurrent new references; never cascade removal. For linked rooms, use Edit inventory to take the room out of service while preserving records. Deletion reports success or explains why the room is protected.
- Store physical beds, default usable beds, and in-service status in Housing. In Week setup, leave the usable-bed override blank to use the default, or enter a temporary count for that week. Configure age and gender grouping, guest beds and adult Cabin Leaders per week.
- Weekly cabin saves validate beside the edited cabin. A visible, focused error panel lists fields needing attention, including a missing Group, invalid age range or unconfirmed availability exception. It opens collapsed exception fields when the operator selects an error. Server checks return specific staffing, capacity and reservation-conflict messages without navigation or lost selections. Successful saves confirm locally and refresh the cabin's saved team and bed summary. Unoccupied cabins may save partial teams, but cannot accept campers without two adult Cabin Leaders. Existing camper supervision and capacity remain protected atomically.
- Track current room readiness as Ready or Needs cleaning for both camper dorms and the Guest Hotel. Staff mark used rooms Needs cleaning and mark them Ready after preparing them. A room needing cleaning is unavailable for camper placement until ready. The pilot uses manual status updates. Departure-driven turnover and hotel booking are separate workflows.

### Guest Hotel and guest placements

- Keep the Guest Hotel in the shared housing inventory and give it its own room list and assignment screen. Use room numbers and editable bed counts, with two beds per room as the usual setup.
- Hotel rooms are guest-only. Staff may assign a single guest, a married couple, or two single guests when appropriate. A whole-room reservation makes the remaining bed unavailable for another booking.
- Guests can also stay in camper dorms where the camp permits it. Each guest bed reduces camper capacity. Hotel bookings affect hotel availability only.
- Treat assigning hotel rooms and placing guests in camper dorms as separate permissions. Camp Leadership decides who receives each permission. One staff member may hold both.

## 2. Check in and assign

### Registration-based cabin planning

Each camp week has an editable target of one, two or three ages per cabin group, defaulting to two consecutive ages (7–8, 9–10, 11–12), anchored at the week's minimum age. The Registrations and Week setup pages link to Cabin planning. Leadership and Registration can view live pending and confirmed registration counts by age band and gender; released places are excluded. Ages use the camp start date, with a visible provisional warning for undated weeks. Existing cabin ranges remain editable and broad ranges are flagged against the target.

The first planning view lists compatible cabin options and exceptions without reserving beds, assigning campers, or moving existing placements. Shared options are not summed across bands. Gender capacity totals count each configured, active cabin once, subtract guest beds and reserve at least two adult leader beds (or all assigned adult leader beds if more). Staffing and cleaning readiness remain separate visible checks before actual check-in. This view does not automatically rebalance cabins or replace the existing check-in confirmation and override workflow.

The planning page returns to its originating Registrations or Week setup screen, retaining the selected week. Registration-group rows show counts and a compact names-and-ages drilldown rather than repeating all compatible cabins per camper. Leadership can select Configure cabins for a group to open weekly setup with that age/gender target; only unconfigured cabins receive those initial form values, and saving is explicit. Existing cabin ranges, staffing and placements are preserved until deliberately edited.

Transportation setup — Configure each week's camp buses, routes, pickup and return drop-off stops, local times, and meeting instructions on the separate Transportation setup page linked from Week setup. Copy active arrangements from another week as independent records. Registration, printable forms, check-in, and departure use these weekly options while retaining Own transportation and actual-travel exceptions. Preserve registered plans when configuration changes and flag affected journeys for staff review. See the [Camp transportation specification](camp-transport-spec.md).

- Use the [team walkthrough](pilot-walkthrough.html) as the arrival screen baseline. Camp Registration opens the expected bus roster and can look up campers across the week. Record actual arrival and bus, where applicable. Route unmatched arrivals to Camp Registration for follow-up.
- Show participation permission and outstanding balance at a glance. Camp Registration can record presence while permission is pending. A designated adult supervises the camper until the authorized signer gives permission. An outstanding balance is tracked separately.
- Suggest a dorm using age, gender, remaining beds, and required coverage. Show the adult Cabin Leaders. Camp Registration can change the suggested placement and records the reason. Enforce usable bed capacity and required coverage. When there is no suitable dorm, keep the camper visibly unassigned for staff follow-up.
- Enforce the camper’s registered gender group for suggestions and manual overrides. Week setup must reject any group change that conflicts with existing camper placements. Camp Leadership defines any future age exceptions before the app offers them.

## 3. Account for departure

- Record the actual return bus or authorized pickup, along with staff recorder and time. Track boarding separately from bus departure. Record a destination handoff when the camp is responsible for it.
- For pickup, staff verify the receiving adult against the authorized plan. For unexpected pickup, the Cabin Leader supervises the camper and Camp Leadership verifies and decides on release. For an emergency return home, staff confirm the destination and the person receiving a minor and record the handoff.
- Provide a week-end reconciliation view of checked-in campers with no recorded departure and those still awaiting a camp-supervised handoff.

## 4. Camp overview

- Leadership and Registration can open Camp overview beside Week setup. Select a season by the camp week's start year; undated weeks are listed separately. Default to the current year if present, otherwise the next available year or latest past year. Show season registration, confirmed-place, remaining-place, capacity and released-registration totals, plus each week's counts and dates.
- Registered excludes released registrations. Confirmed places consume capacity; pending registrations do not. Remaining capacity is clamped to zero. Attendance includes all valid arrivals, including registrations subsequently released, and excludes voided arrivals. Still expected counts confirmed campers without a valid arrival.
- Arrived this week includes those who departed. Currently at camp means valid arrival without physical departure. Bus boarding remains at camp until the return bus departure is recorded. Pickup, return home and self-departure count when recorded. A pending destination handoff after bus departure does not count as still on site. Arrived equals Currently at camp plus Departed.
- Use the current date in Panama and highlight all weeks whose start/end dates include today. Show an explicit message if no week is current. Past weeks with campers still counted on site show a departure-record follow-up warning. Counts reflect records at page load and refresh, rather than a live headcount or automatic completion.
- Weekly registration and attendance counts link to matching roster filters, which remain visible and can be changed. No historical comparison, warehouse or inferred arrival/departure is introduced.

## 5. Lightweight week and season reviews

- Camp Leadership opens Week review from each overview row and Season review beside the selected season's totals. Registration and other roles cannot open or modify review notes. Undated weeks support a weekly review; seasonal rollups use dated weeks' start years.
- During the week, collect dated operational observations with type (worked well, improve, idea), text and recorder. Save notes, four closing-summary answers and open/done actions with optional owners together in one explicit save. There is no autosave or separate partial save. Inline Remove is saved with the rest of the draft. Do not include individual health, safeguarding or screening details.
- Closing review retains the original observations beside the summary. Use in summary explicitly copies an observation into the relevant summary answer, retaining date/author context. Staff write the final assessment themselves. Reviewed requires a recorder and at least one summary answer, records reviewer/date and an attendance snapshot, and locks edits until explicitly reopened.
- Season review displays each week's latest saved observations, summary and actions, labeled In progress, Reviewed or No review saved yet. Unfinished weeks remain usable as clearly identified sources. Staff can explicitly copy notes/summary sections into the season summary or carry an open weekly action into an independent season action. Copied text includes its source week; changing a season action never changes the weekly action. Source panels stay current; the saved season narrative is not automatically rewritten when a source changes.
- Current registration/attendance totals and the snapshot taken at completion are clearly distinguished. Later operational corrections do not rewrite completion snapshots. Reopening preserves the prior snapshot until the review is marked Reviewed again. No historical staff identity is inferred from shared pilot logins; the operator supplies their name, with individual authenticated attribution required before production.
- Optimistic revision checks reject stale saves without discarding local entries. The API requires a leadership session and matching request origin. Reviewed records require reopening before editing or deletion. Draft reviews may be permanently deleted only after confirmation; unrelated operational records and the other scope's review remain intact. Revision tokens are never reused after deletion/recreation.

## Acceptance scenarios

- Staff add a building and dorm and configure its capacity for a future week. Past camper placements and Cabin Leader teams still show the historical setup.
- A dorm with fewer than two adult Cabin Leaders or no usable beds remaining is unavailable for camper placement. When two staff attempt to assign the last bed, only one assignment succeeds.
- A camper arrives on a different bus with permission pending. Staff find the camper across the week, record actual arrival, and see that supervised follow-up is needed before activities.
- Staff can accept a suggestion or choose another available, compatible dorm and record why. The displayed adult Cabin Leaders match the chosen dorm.
- A single guest with a whole-room reservation uses a two-bed hotel room. Staff cannot place another guest there, and camper dorm suggestions never include that room.
- Staff with hotel assignment permission alone can book a hotel room and cannot place a guest in a camper dorm. An authorized guest placement in a camper dorm reduces camper capacity.
- A checked-in camper who has boarded a bus that has not departed remains visible in departure reconciliation. An authorized pickup is closed when the handoff is recorded.

## Pilot assumptions to verify

- Use fictional dorm inventory and staff teams for the first end-to-end test. Before a live week, confirm whether buildings contain separately assignable rooms and load real bed counts and teams.
- Start with a simple suggestion among compatible dorms with availability. Use staff feedback to refine how the app ranks multiple matches.
- Confirm who can configure weekly housing and who records destination handoffs on each route.

Check-in roster controls — Changing Camp week or Expected arrival immediately submits the current filters. Keep Apply filters for name searches and manual submission. Changing menus refreshes the expected stop options and roster for the selected week without recording an arrival.

Staff availability — Weekly roles and new cabin team assignments use confirmed seasonal availability or the latest ready application for that person/season. Default choices include available qualified active staff. Leadership may explicitly confirm an exception with a recorded reason; server checks and cabin safety requirements remain enforced. Preserve and flag existing mismatches. Direct-entry staff availability is recorded from the Staff directory. See [Staff applications](staff-applications-spec.md).
