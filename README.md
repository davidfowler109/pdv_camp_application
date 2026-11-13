# Palabra de Vida Panamá camp application

The first initiative is camp registration and operation. The [technical plan](docs/technical-plan.md) links to the constitution and specifications.

## Run the fictional pilot locally

Install Node.js 24, then run these commands from the project folder in PowerShell.

```powershell
npm.cmd ci
node scripts/setup-demo.mjs
npm.cmd run dev
```

Open [the local pilot](http://127.0.0.1:3000). Sign in as **Camp Leadership** using the generated leadership password to configure the sample week and its dorms. **Camp Registration** can view the setup. The **Cabin Leader** role has no week setup access. Use the language button in the header to switch between Spanish and English. Passwords are local to this setup and are stored in the ignored .env.local file.

The local pilot uses a persistent embedded PostgreSQL database under .local/camp by default. A local .local/active-database file can select a staged 2027 fictional database. Stop the app before switching, and set the file to camp to restore the original local database. The app initializes its selected database from the SQL files in db. With DATABASE_URL set, the application uses an external PostgreSQL connection. Apply the numbered SQL files in db in order and, for a new fictional environment only, db/fictional-seed.sql before connecting. Use the local demo with fictional data on loopback. Production authentication and hosting are later milestones.

Use **Camp registration** to enter a fictional online application. A public link can preselect a week, for example /es/register?week=1. Week setup supports an optional early-bird price and last eligible date in Panama time. Public registration saves the fee and shows a private confirmation link with the registration reference and balance. The transfer instructions show a masked pilot account by default. PDV_BANK_ACCOUNT_NUMBER configures the actual account number when the camp is ready. Sign in as **Camp Registration** or **Camp Leadership** to search the week roster, create a desk or paper registration, or print a blank form in the selected language. The current pilot records consent with the application. From the intake list, open an application to review permissions, apply a scholarship code, record payments, and confirm or release a place. Camp Leadership configures the sample week fee and award count in Week setup. In Scholarship batches, Any-week codes has a separate calendar-year limit. When a batch has a distributor email, Email available codes opens a draft for staff to review and send. A week without a configured fee suggests $80 when editing. Use fictional values. For signed-paper registrations, staff can preview and attach JPEG or PNG photos or a PDF during intake or from Review registration. Saving the registration is independent of uploading the files. Files are private to Camp Registration and Camp Leadership. They become inaccessible 15 months after the week ends (or after intake if the week has no end date). The local pilot purges expired files on startup and during uploads. Schedule `SELECT purge_expired_signed_forms();` daily for a hosted database and apply the camp's backup retention policy. Remote consent links and optional receipt uploads are later steps. Choose the language before entering the form, since switching pages starts a fresh form.

The **Camper health** page is available to Camp Leadership and Health staff. Kitchen staff see reported food allergies, with confirmed campers selected by default and an option to include pending campers. To add these demo roles to an existing setup, rerun the setup script and use the new credentials in the local environment file.

Use **Check-in** to select a week and expected pickup stop, or search the whole week by name. Open a camper to record their actual arrival. Confirm the camper's place before assigning a dorm. The app uses age on the week start date for placement and the current Panama date if an older demo week has no start date. Use **Departure** to record boarding, bus departure, destination handoffs when needed, or an authorized pickup. Use the unresolved filter for reconciliation. Staff can correct or undo check-in and undo boarding while the bus is at camp. Camp Leadership can reopen a recorded departure after a bus leaves or a pickup is recorded. Corrections require a reason and are visible in the camper's correction history. Intake for unmatched arrivals is separate work.

**Staff** lets Camp Leadership manage reusable skills and assign health, kitchen, and program coverage per week. Cabin roles are assigned in Week setup and appear on Staff. The directory does not create or change app logins.

**Facilities calendar** shows dated camp weeks and special events. Camp Leadership can create or cancel events and reserve lodging rooms in **Special events**. Camp cabin blocks cover all listed dates. Special events use Panama-time arrival and checkout with an optional cleaning buffer. Select an event to open its bilingual public registration form or staff attendee roster. Camp Leadership can enter desk and signed-paper registrations, review day and overnight attendance, confirm or release places, and record payments. Overnight attendees can indicate a church or roommate group. Room assignment is a later step.

**Church visits** lets Camp Leadership create and edit a church ministry visit with dates, purpose, group leader contacts, expected Student, Adult, and Leader counts, and reserved rooms. Visits appear on the Facilities calendar and share room conflict checks with camp weeks and special events. Cancel a visit to release its reservations while retaining its details. Local demos apply migration 018 automatically on restart. Hosted databases require db/018-church-visits.sql before deploying this update. [The Church visits specification](docs/church-visits-spec.md) records the implementation progress and build order.

Select a church visit, then open **Visitor roster** to register someone with staff assistance or **Open public registration** to preview the standalone form. The roster includes a full registration link to copy, name search, role and status filters, registered and expected counts, and the church leader acknowledgment status. Leaders can explicitly acknowledge church-managed permissions and supervision on registration. Staff can record that acknowledgment later with its source. Corrections, withdrawal, and restoration retain a staff recorder, reason, and history. The public form uses the existing local-demo availability setting. Local demos apply migration 019 automatically. Apply db/019-church-visitor-registration.sql to hosted databases before deploying this stage. Registration is for fictional pilot information until the visit privacy and retention decisions are confirmed. Housing assignment, arrival, itinerary, meals, and budget workflows continue in the specification's build order.

For church visitor housing, open **Church visits**, select a visit, then **Visit housing**. Configure the church's room groupings, minor eligibility, resident adult requirements, and supervision notes. Generate suggestions, review requests and assignments, make manual changes, and lock assignments to preserve them during regeneration. Publish the reviewed plan after resolving outstanding issues and room readiness. The visitor roster shows assigned rooms and draft or published status. Withdrawal frees the visitor's bed, while restoration requires a new assignment. Local demos apply migration 020 automatically. Hosted databases require db/020-church-visit-housing.sql before deployment. Arrival, departure, transportation, meals, and budgets continue in the specification's build order.

For church group arrival and departure, open a visit and select **Visit arrival and departure**. Filter by attendance status or name, choose the action, select visitors or use Select all eligible visitors in this list, and save once with the staff recorder. Undo arrival and Undo departure require a reason and preserve the action history. The roster reflects current attendance and the page highlights visitors still at camp. Used rooms are marked Needs cleaning when vacated, including after manual room moves. Staff review room readiness after corrections. Local demos apply migration 021 automatically. Hosted databases require db/021-church-visit-attendance.sql before deploying this stage.

For church trip planning, select the visit, then **Itinerary & budget**. Choose a day and add activities, meals, and expenses. Use expected counts while recruiting, or select registered counts in Budget planning. Prices can be per person or for the whole group, with role-specific quantities and optional overrides. Camp meals and packed lunches contribute to the kitchen preparation plan. Whole-visit charges are entered once. Review the budget and suggested traveler allowances, then **Publish a dated estimate** to create a copyable link with bilingual and browser print/PDF views. Published numbers stay fixed while the working plan changes. Archive/restore supports activity and cost corrections, and estimate links can be withdrawn/restored with a reason. Apply db/022-church-visit-itinerary.sql and db/023-visit-estimate-sharing.sql to hosted databases before deploying this stage. The local pilot applies both automatically.

## Azure staging

Use the [Azure staging checklist](docs/azure-staging-checklist.md) for setup, rehearsal, and production handoff.

## Checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```
