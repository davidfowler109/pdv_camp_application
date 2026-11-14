# Camp Operations Specification

**Status:** Pilot workflows approved. Implementation assumptions below are for review.  
**Related:** [Constitution](constitution.md) · [Registration specification](registration-spec.md) · [Sensitive decisions](sensitive-decisions.md)

## 1. Set up a camp week

- Maintain buildings and assignable dorms as editable inventory. Record physical bed capacity per dorm. Staff can take a dorm out of service and set fewer usable beds for a given week. Reserve one usable bed for each assigned adult Cabin Leader and each guest bed. Camp Counselors sleep together separately. The remainder is the dorm’s camper capacity, with a minimum of zero. Subtract existing camper placements when showing remaining beds during check-in.
- Configure the eligible age and gender group for each camper dorm per week. Require at least two adult Cabin Leaders per cabin. Assign one to three Camp Counselors for weeks serving campers under 18. Counselors are optional for 18+ weeks. Only dorms with usable beds and the required team are available for camper assignment.
- Preserve historical occupancy and Cabin Leader teams when inventory or staffing changes for future weeks.

### Reusable inventory and turnover

- Camp Leadership can add a dated camp week and select existing weeks for setup. Housing is managed separately. A building or room is created once and can be reused in every week.
- Store physical beds, default usable beds, and in-service status in Housing. In Week setup, leave the usable-bed override blank to use the default, or enter a temporary count for that week. Configure age and gender grouping, guest beds, Cabin Leaders, and Camp Counselors per week.
- Track current room readiness as Ready or Needs cleaning for both camper dorms and the Guest Hotel. Staff mark used rooms Needs cleaning and mark them Ready after preparing them. A room needing cleaning is unavailable for camper placement until ready. The pilot uses manual status updates. Departure-driven turnover and hotel booking are separate workflows.

### Guest Hotel and guest placements

- Keep the Guest Hotel in the shared housing inventory and give it its own room list and assignment screen. Use room numbers and editable bed counts, with two beds per room as the usual setup.
- Hotel rooms are guest-only. Staff may assign a single guest, a married couple, or two single guests when appropriate. A whole-room reservation makes the remaining bed unavailable for another booking.
- Guests can also stay in camper dorms where the camp permits it. Each guest bed reduces camper capacity. Hotel bookings affect hotel availability only.
- Treat assigning hotel rooms and placing guests in camper dorms as separate permissions. Camp Leadership decides who receives each permission. One staff member may hold both.

## 2. Check in and assign

- Use the [team walkthrough](pilot-walkthrough.html) as the arrival screen baseline. Camp Registration opens the expected bus roster and can look up campers across the week. Record actual arrival and bus, where applicable. Route unmatched arrivals to Camp Registration for follow-up.
- Show participation permission and outstanding balance at a glance. Camp Registration can record presence while permission is pending. A designated adult supervises the camper until the authorized signer gives permission. An outstanding balance is tracked separately.
- Suggest a dorm using age, gender, remaining beds, and required coverage. Show the Cabin Leaders and Camp Counselors. Camp Registration can change the suggested placement and records the reason. Enforce usable bed capacity and required coverage. When there is no suitable dorm, keep the camper visibly unassigned for staff follow-up.
- Enforce the camper’s registered gender group for suggestions and manual overrides. Week setup must reject any group change that conflicts with existing camper placements. Camp Leadership defines any future age exceptions before the app offers them.

## 3. Account for departure

- Record the actual return bus or authorized pickup, along with staff recorder and time. Track boarding separately from bus departure. Record a destination handoff when the camp is responsible for it.
- For pickup, staff verify the receiving adult against the authorized plan. For unexpected pickup, the Cabin Leader supervises the camper and Camp Leadership verifies and decides on release. For an emergency return home, staff confirm the destination and the person receiving a minor and record the handoff.
- Provide a week-end reconciliation view of checked-in campers with no recorded departure and those still awaiting a camp-supervised handoff.

## Acceptance scenarios

- Staff add a building and dorm and configure its capacity for a future week. Past camper placements and Cabin Leader teams still show the historical setup.
- A dorm with fewer than two adult Cabin Leaders, no Camp Counselors in a week serving minors, or no usable beds remaining is unavailable for camper placement. When two staff attempt to assign the last bed, only one assignment succeeds.
- A camper arrives on a different bus with permission pending. Staff find the camper across the week, record actual arrival, and see that supervised follow-up is needed before activities.
- Staff can accept a suggestion or choose another available, compatible dorm and record why. The displayed Cabin Leaders and Camp Counselors match the chosen dorm.
- A single guest with a whole-room reservation uses a two-bed hotel room. Staff cannot place another guest there, and camper dorm suggestions never include that room.
- Staff with hotel assignment permission alone can book a hotel room and cannot place a guest in a camper dorm. An authorized guest placement in a camper dorm reduces camper capacity.
- A checked-in camper who has boarded a bus that has not departed remains visible in departure reconciliation. An authorized pickup is closed when the handoff is recorded.

## Pilot assumptions to verify

- Use fictional dorm inventory and staff teams for the first end-to-end test. Before a live week, confirm whether buildings contain separately assignable rooms and load real bed counts and teams.
- Start with a simple suggestion among compatible dorms with availability. Use staff feedback to refine how the app ranks multiple matches.
- Confirm who can configure weekly housing and who records destination handoffs on each route.

Check-in roster controls — Changing Camp week or Expected arrival immediately submits the current filters. Keep Apply filters for name searches and manual submission. Changing menus refreshes the expected stop options and roster for the selected week without recording an arrival.
