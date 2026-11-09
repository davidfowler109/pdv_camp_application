# Technical Plan · Camper Pilot

**Status:** Proposed for implementation review  
**Inputs:** [Constitution](constitution.md) · [Registration specification](registration-spec.md) · [Camp operations specification](camp-operations-spec.md) · [Sensitive decisions](sensitive-decisions.md)

## Pilot outcome

Run a fictional camp week from assisted registration through departure. A family can register on a phone or submit paper for staff entry. Staff can record consent, apply a scholarship, confirm a place, check the camper in, assign a staffed dorm, and record the departure. Use the proposed live field set from the registration spec. Use the Spanish walkthrough as the staff interaction baseline.

## Architecture

- One TypeScript Next.js application on Node.js and one PostgreSQL database. Serve the public registration and staff workspace from the same app in Spanish and English. Default to Spanish and keep the selected language across pages. Translate interface text, validation messages, and camp-provided notices. Keep user-entered names and notes as entered. Keep authorization, validation, and operational writes on the server. Use versioned database migrations, repeatable fictional seed data, and local setup instructions for Windows.
- Enforce staff permissions on the server. Camp Registration handles intake, confirmation, arrival, and placement. Cabin Leaders see their assigned dorm and the camper care information relevant to that role. Camp Leadership handles unexpected release decisions and authorizes staff access. Show balance and participation permission to staff working the roster. Keep evidence and detailed health data in the appropriate restricted views.
- Use a single Azure test deployment with fictional data after local verification. Prepare a cost estimate and confirm the hosting region before provisioning. Evaluate App Service with managed PostgreSQL as the initial hosting option. Use private file storage if optional uploads are enabled. Keep GitHub deployment configuration and test evidence reviewable.

## Records and consistency

| Area | Records and rules |
| --- | --- |
| Registration | Camp season and week, camper, registration, signer and helper, contacts and home directions, health information, and transport plans. Keep confirmation, participation permission, physical presence, and finance separate. Record notice version and authorization method, including paper source and witness when applicable. |
| Places and finance | Week capacity, confirmation and release history, optional follow-up date, scholarship batch and codes, and payment entries. Confirm against the 250-place ceiling in one transaction. Allocate codes against the week's award count. Redeem a code once within its week. Store payment amount and reference separately from scholarship value. |
| Housing | Buildings and dorms, physical capacity, weekly usable beds and grouping, staff and weekly team assignments, guest occupancy, and camper placement history. Suggest a compatible dorm with room, at least one adult Cabin Leader, and one to three Camp Counselors. Reserve one usable bed for each assigned Cabin Leader and Camp Counselor, and subtract guest beds and existing camper placements. Enforce available beds and required staffing in the assignment transaction. Record override actor and reason. Keep hotel rooms in the shared housing inventory with room numbers, guest-only eligibility, and whole-room reservations. Authorize hotel bookings and guest placements in camper dorms separately. |
| Arrival and departure | Expected bus and actual arrival, boarding, departure, and pickup or destination handoff where applicable. Store actor and time. Reconcile checked-in campers against completed departures. |
| Privacy lifecycle | Separate restricted records and attachments from roster summaries. Keep sensitive values out of routine logs. Track the end of the scheduled week for retention processing. Verify identifier reduction at 15 months and deletion or anonymization at two years, including the approved handling of exports and backups. |

Use database transactions for operations that consume shared capacity. Serialize changes affecting the same camp week or weekly dorm and enforce unique code redemption in the database. Test simultaneous requests for the last place, last bed, and same code. [PostgreSQL locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html)

## Build order

1. **Foundation and week setup.** Create the app, migration and seed workflow, role checks, and staff screens to configure a fictional week, building, dorms, usable beds, and Cabin Leader teams. Verify a fresh local setup and staff role boundaries.
2. **Registration through confirmation.** Build Spanish registration and staff paper intake, traceable authorization, scholarship batches and redemption, payment recording, and the confirmed roster. Support sending a consent link through the staff-selected channel during the pilot. Test that missing participation permission and payment can remain visible when a place is confirmed. Test the weekly limit and scholarship rules.
3. **Arrival through departure.** Build bus check-in, dorm suggestions and overrides, and departure reconciliation. Test arrival on a different bus, pending permission, no eligible bed, and a valid override. Exercise return bus and authorized pickup as separate paths.
4. **Team rehearsal.** Run the full flow with fictional records in a clean environment. Verify role boundaries, privacy-sensitive paths, and a printable arrival roster. Capture feedback on steps staff find hard to complete. Run build, type checking, integration tests against PostgreSQL, and a browser walkthrough before handing it over.

## Before using real camper records

Confirm real dorms and Cabin Leader teams, staff accounts and permissions, Spanish notices and permission forms, and the practical retention rules for attachments, incidents, and finance. Implement and verify those retention rules, configure production authentication, confirm the Azure cost and region, and test backup restoration. Keep receipt uploads conditional on the camp's deposit-verification workflow. Confirm who configures weekly housing, who may book hotel rooms, who may place guests in camper dorms, and who records destination handoffs.
