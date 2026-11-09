# Special Events Pilot Specification

**Status:** Pilot design for review  
**Pilot scenario:** Adult women's weekend conference at Palabra de Vida  
**Related:** [Constitution](constitution.md) · [Camp operations](camp-operations-spec.md) · [Technical plan](technical-plan.md)

## Purpose

Support occasional events at the facility outside the camp program. Special Events has its own setup, registration, roster, and room assignments. Reuse the shared building and room inventory, room readiness, and staff directory. Preserve the camper registration and supervision workflows.

## Event setup and registration

- Authorized staff create a named event with arrival and departure dates and times in Panama time, an attendance limit, an optional fee, and day-only or overnight attendance options. The event can reserve specific guest hotel rooms and cabins.
- A public link opens the event's standalone registration in English or Spanish. Use the staff roster for assisted registrations and paper intake where needed. Store registrations with the event. Collect names, a reachable contact, attendance type, and applicable food, accessibility, or rooming information.
- Present the event privacy notice and record the attendee's explicit permission to collect the information. Adult attendees authorize for themselves. The adult pilot skips the camp participation-permission workflow.
- Staff review attendance and payment separately. Show remaining attendance places and available overnight beds independently. Day attendees use an attendance place and no bed.

## Shared housing and rooming preferences

- Reserve rooms for the event's occupancy interval, with a turnover buffer when needed. Count a room only once across overlapping camp and event reservations. Allow adjacent use after checkout and the applicable turnover window. Recheck the reservation and capacity when saving or publishing a placement.
- Start with rooms reserved for the event that are in service. Show current readiness. Flag rooms needing cleaning before arrival so staff can prepare or replace them. A draft for a future event can still identify rooms that need preparation.
- Overnight attendees can select no preference, ask to room with people from their church, or join a roommate group using a shared code. Each attendee opts in through their own registration. Staff can see group sizes and flag requests they cannot fit together.
- Generate draft placements using this order: honor locked assignments, fit confirmed roommate groups, apply church preferences where possible, and fill remaining eligible beds. Accessibility, usable bed counts, whole-room reservations, and event room eligibility constrain suggestions.
- Keep rooming requests together where possible. If a group cannot fit, flag it for review rather than silently splitting it. Show unplaced attendees in **Needs assignment**.
- Staff can move attendees among eligible rooms, lock reviewed placements, and regenerate the remaining suggestions. Require a reason when resolving a flagged conflict. Publish the reviewed room list separately from generating it. Keep capacity and room reservation checks in force for manual moves.

## Live-in supervision

- **Require a designated adult supervisor in each shared room** is off by default for the adult conference. An adult attendee does not need an assigned live-in supervisor and no bed is reserved for one.
- When enabled for an event, record the designated adult supervisor for each room covered by the rule. Reserve a bed for the supervisor and flag missing coverage before placements can be finalized.
- The existing Cabin Leader and Camp Counselor requirements continue to govern camper cabins during camp.

## Event operations

- The event roster shows attendee, attendance type, confirmation, payment, and room placement. Authorized staff can mark an attendee present and, if useful for the event, record checkout.
- Use the existing Ready and Needs cleaning statuses after checkout. Staff can assign registration, kitchen, health, or program coverage from the staff directory. Weekly camp staffing and event staffing remain separate assignments.
- Limit attendee details to staff with a role that needs them. Keep event staff assignment and app access separate.

## Acceptance scenarios

- A day attendee and an overnight attendee both register. Only the overnight attendee appears in the rooming queue.
- Two attendees enter the same rooming code and fit together in a two-bed hotel room. A third attendee joining that group produces a review flag when the group no longer fits.
- An attendee who requests church-based rooming can be matched where space permits. An attendee with no preference can use an eligible remaining bed.
- The adult conference assigns a shared room with no supervisor and uses its full available capacity. Turning supervision on for a test event reserves a bed and blocks finalization for rooms that lack a designated supervisor.
- Staff move an attendee, lock the placement, and regenerate suggestions. The locked placement stays in place. An attempt to overfill a room is rejected.
- An overlapping room reservation is rejected. A reservation that begins after checkout and the turnover window can use the room.
- Staff mark a room Needs cleaning after checkout. The readiness status is visible in the shared Housing inventory.

## Build order and decisions to confirm

1. Event setup and shared room reservations.
2. Bilingual event registration, staff entry, and attendee roster.
3. Draft room suggestions, overrides, locking, and publication.
4. Rehearse with a fictional conference. Add basic arrival, checkout, and staffing as needed for the rehearsal.

Before a live event, confirm room inventory and timing, any private-room and lodging fee rules, which staff can reserve rooms and publish assignments, and the event's privacy notice and retention requirements. Keep events involving minors outside the adult pilot until the camp defines the applicable permissions and supervision workflow.
