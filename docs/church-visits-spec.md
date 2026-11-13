# Church Visits Specification

Status — Agreed workflows, ready for implementation planning

Implementation progress — Step 1 is implemented for the local pilot. Church visits setup, editing, cancellation, shared room reservations, and Facilities Calendar integration are available in English and Spanish to Camp Leadership. Registration and the remaining workflows follow the build order below. The initial setup requires the main leader's email and phone and allows 1 to 1,000 expected travelers, consistent with the special-event planning scale. Rooms may be reserved after the visit is first saved.

Step 2 progress — Public and staff-assisted registration, a searchable visitor roster with 25 rows per page, corrections, withdrawal and restoration, and the church leader acknowledgment are implemented for the fictional local pilot. Visit setup links to the roster and public registration. The roster provides a complete registration URL to copy, shows registered counts alongside expected counts, and highlights a pending or outdated leader acknowledgment. The roster now displays actual attendance through the workflow below.

Housing progress — Visit housing now provides room arrangements, saved draft suggestions, manual assignment and removal, resident supervisor designation, locks for reviewed assignments, and publication after review. The roster links each active visitor to their room assignment and distinguishes drafts from published housing.

Attendance progress — Step 3 now includes group arrival and departure. Camp Leadership opens Visit arrival and departure from visit setup, the visitor roster, or housing. The page shows Expected, At camp, Departed, and Withdrawn counts, names, rooms, and recorded arrival and departure times in Panama time. Search and state filters define the displayed list. Staff select eligible visitors individually or select everyone eligible in that filtered list, then save the group once. The selection count and action controls appear above a scrollable table.

Attendance implementation decisions — A batch applies to 1 to 1,000 selected visitors and records the staff recorder, time, and optional notes. Undo arrival and Undo departure require a reason and retain the original events. Retries reuse a batch identifier, and concurrent changes cause a stale-selection message with no partial batch update. Arrival can be recorded while housing is still unassigned, with housing issues visible for follow-up. Record departure, or correct a mistaken arrival, before withdrawing a visitor who remains at camp. Record or correct outstanding departures before cancelling the visit.

Room turnover and attendance — Record rooms actually used by visitors. Church departures and manual room moves mark a used room Needs cleaning after its actual occupants have left, checking for both church visitors and campers still present. An expected visitor who has not arrived does not count as an actual occupant. Preserve the assigned rooms of visitors who already arrived during suggestion regeneration. Staff can move a present visitor manually with a reason. Correct a departure before changing that visitor's historical room assignment. Undo actions leave room readiness for staff review. Flag a room for supervision review when a resident adult leaves while minors remain.

Housing implementation decisions — Staff explicitly configure each reserved room as Female, Male, or Mixed according to the church's arrangement, indicate whether minors may stay there, and record the required number of resident supervising adults. The initial checkbox permits minors in cabins and starts unselected for hotel rooms. Staff can change that eligibility for the visit. The required adult count begins blank and can be zero when that reflects the church's arrangement. Occupied rooms with minors require supervision notes before publication. Every designated supervisor must be at least 18 on arrival and occupies a bed. Adult Students can be designated when the church chooses them.

Draft review and lifecycle — Suggestions place required resident adults before minors and preserve locked assignments. Rooming and accommodation requests remain visible for manual review because the registration captures them as free text. Every save records staff identity and review notes. Publication checks usable beds, room grouping, minor eligibility, resident supervision, readiness, and reservation conflicts. A visitor or visit change returns published housing to draft. Withdrawing a visitor removes their placement and preserves its history. Restoring registration leaves housing unassigned for a fresh capacity check. Move or clear occupants before removing their room from Visit setup. Changes to the shared room inventory are reevaluated on the housing page, roster, and publication.

Initial registration field decisions — Require names, date of birth, gender for housing, Student/Adult/Leader role, a visitor or group contact, and emergency contact name and phone. Food allergies, dietary requirements, and care or activity accommodations require an explicit None, Yes, or Unknown answer. Yes requires details. Rooming preferences remain optional. Church leaders manage medication, so visitor registration does not collect medication information. Older blank answers remain unanswered until reviewed, rather than becoming None. Adult and Leader roles require age 18 on arrival. Student remains a role independent of age. Record the name and relationship of the person authorizing information sharing. The pilot accepts an adult visitor, a minor's parent or legal guardian, or an authorized church representative who explicitly confirms authority to share the visitor's information. This representative route is an implementation assumption for customer and privacy review before use with real visitors.

Acknowledgment and corrections — An adult Leader can explicitly acknowledge the church's responsibility when registering. Staff can record a leader's acknowledgment later, with its source and staff recorder. Preserve the wording, language, version, named leader, and recording time. Flag acknowledgments associated with withdrawn leaders or changed leader identity or eligibility for review. Record a reason, staff recorder, previous record, and revision for corrections, withdrawal, and restoration. Preserve the original information-sharing permission when correcting ordinary visitor details.

Related — [Constitution](constitution.md), [Special events](special-events-spec.md), [Camp operations](camp-operations-spec.md), [Sensitive decisions](sensitive-decisions.md#pdv-002--church-visit-permissions-and-supervision)

Itinerary and budget progress — Visit setup now links to Itinerary & budget. Staff choose a day within the visit dates, add named activities with optional time, location, and team notes, and enter meals and costs beneath each activity. Copy activity and Copy day duplicate active costs and meal details into a selected day. Archive and restore retain planning history. Whole-visit charges have their own section so lodging can be entered once.

Budget assumptions — Start with expected Student, Adult, and Leader counts. Staff can explicitly switch to registered counts. Each expense identifies the payer, per-person or whole-group pricing, applicable visitor roles, an optional people-count override, and an estimated USD price. Blank prices remain visibly unknown and zero is explicitly free. Whole-group prices contribute once to the group's totals. Camp-served and camp-packed meals are charged through the church's camp payment. Restaurant meals can be church-funded or paid directly by participants. Kitchen preparation counts come from these same meal rows, separating served, packed, and outside meals.

Traveler guidance — Default contribution guidance includes whole-group church expenses, with a setting to fund those expenses separately. Show suggested collection and personal spending amounts by role and optional extra personal spending per traveler. Contributions assume participation in each applicable item and round shared group costs up to cents. Custom quantities produce a review warning because the leader must determine which individuals participate or receive church funding. Group budget totals retain the exact cost amounts. The group trip total includes the extra personal spending allowance multiplied by the selected attendance count. Missing prices leave a clearly marked partial estimate suitable for early planning.

Dated sharing — Publishing creates a numbered, dated snapshot of the itinerary, aggregate counts, costs, meal plan, and traveler allowances. Working edits preserve the figures already shared. Estimates use a bearer link that can be copied, viewed in English or Spanish, and printed or saved as PDF through the browser. The publication notice states what the link exposes. Visitor records, leader contact details, and staff change notes are excluded. Staff can withdraw and restore a link with a reason while preserving its snapshot and history. Visit date or expected-count changes flag older estimates for review. Registration changes flag estimates only when registered counts are selected. Activities outside revised visit dates must be moved or archived before publishing again. Transport arrangement controls and wider kitchen workflow integration follow as subsequent planning work.

## Purpose and navigation

Support churches traveling together to Palabra de Vida, commonly from the United States, for one or two weeks of ministry. Provide a Church visits tab next to Special events. Connect group registration, housing, meals, transportation, and a daily itinerary with cost estimates.

The church collects travelers' money and pays camp as a group. Individual registration collects the information needed for the visit. Check collection, payment processing, and accounting reconciliation are outside this feature's initial scope. Budget totals describe estimates and amounts expected to be paid, rather than evidence of payment.

## 1. Create and manage a visit

- Record visit name, church name, ministry purpose, main group leader and reachable contact details, arrival and departure dates and times, and expected attendance. Show expected Student, Adult, and Leader counts and their combined total.
- Use Panama local time for the facility schedule. Initialize an empty departure selector from the chosen arrival date, following the date controls used for special events.
- Publish the visit on the Facilities Calendar with its name and date range. Calendar entries open the staff visit workspace. Limit participant information to authorized views.
- Reserve cabins and eligible hotel rooms from the shared Housing inventory. Use the same occupancy intervals and applicable turnover buffers used for special events. Check overlaps against camp weeks, special events, and other church visits, including concurrent saves.
- Support correcting visit details and canceling a visit. A cancellation releases future facility reservations and closes new registrations while retaining the visit history. Check date and room changes against existing assignments before saving.
- Keep expected headcount, submitted registrations, and actual attendance separately visible. Planning can begin while registrations are still arriving.

## 2. Register the group

- Provide one public registration link per visit that can be copied into an email. The link opens the form for that church visit in English or Spanish. Provide assisted entry from the staff visit workspace using the same registration record and validation.
- Identify each visitor as Student, Adult, or Leader. Record date of birth independently so a Student aged 18 or older is represented accurately. Count each person once in attendance and housing.
- Collect name, date of birth, housing-relevant information, reachable contact or responsible group contact, emergency contact, and applicable food allergies, dietary requirements, accessibility needs, and rooming preferences. Exact required fields and wording are implementation review items.
- Link registrations to the visit and responsible church leaders. Leaders register as people in the group and occupy beds when staying overnight. Their visitor role does not grant staff application access.
- Show a staff roster with visitor role, age or minor indicator, arrival status, housing, and information requiring follow-up. Scope detailed dietary and health information to the staff who need it.
- Allow staff to correct registrations or withdraw a visitor, keeping history. Update affected meal plans and housing counts visibly when attendance changes.
- Keep the public form usable on phones and tablets, with English and Spanish labels maintained together. Public registration access exposes the form and the registrant's submission outcome. Access to the group roster, detailed budget, and other people's information requires authorization.

## 3. Church responsibility for permissions and supervision

- The church manages parental participation authorization and determines its supervision arrangements. Record the group leader's explicit acknowledgment that the church manages the necessary permissions and supervision.
- Record the acknowledging leader's identity, acknowledgment wording or version, and date and time. Leave the acknowledgment unselected until explicitly given. Show outstanding acknowledgment to staff for follow-up.
- Record which church adults or leaders supervise the students and how they are assigned to cabins. Visiting church adults stay in the cabins with their students according to that arrangement.
- Apply the church's documented supervision arrangements when suggesting and reviewing housing. The camp-week requirement for two adult Cabin Leaders and Camp Counselors belongs to the camp program. Church visits use their own supervision configuration.
- Treat the church's participation acknowledgment and authorization for camp to collect personal information as separate matters. The public registration notice must explain the camp's use of visitor data. The appropriate route for a church to provide minors' information, access permissions, and retention schedule must be settled before real visitor records are used.

This section records the agreed operating model. Its policy owner and review conditions are recorded in [PDV-002](sensitive-decisions.md#pdv-002--church-visit-permissions-and-supervision).

## 4. Plan housing and account for the group

- Suggest assignments within the visit's reserved rooms using usable bed capacity, the church's supervision arrangements, room eligibility, and rooming preferences. Use age and gender information where applicable to the church's agreed rooming plan.
- Count Students, Adults, and Leaders against bed capacity. Keep hotel eligibility visible when suggesting rooms. Display the assigned church leaders or supervising adults beside student cabin groups.
- Allow authorized staff to override suggestions, retain reviewed assignments, and record changes and reasons. Keep people who cannot be placed visibly unassigned. Recheck room reservations and available beds when publishing or changing assignments.
- Show Ready and Needs cleaning statuses from shared Housing. Allow planning for rooms that need preparation, with readiness visible before arrival.
- Provide arrival and departure rosters, with group actions and individual exceptions so actual attendance remains accurate. Identify people remaining at camp when the group leaves. Mark used rooms as needing cleaning after the applicable occupants check out.

## 5. Arrange transportation

Maintain a separate arrangement for arrival and departure. Offer a convenient action to copy the arrival arrangement to departure, with the departure details still editable.

| English field | Spanish field | Choices |
| --- | --- | --- |
| Who arranges the transportation? | ¿Quién organiza el transporte? | Church / Iglesia, Camp / Campamento |
| Who provides the driver? | ¿Quién proporciona el conductor? | Church / Iglesia, Camp / Campamento |

- Support all four combinations. Camp can arrange a rental that the church drives, and the church can arrange transportation with a camp-provided driver.
- Record applicable flight information, pickup or destination location, local pickup or departure time, passenger count, transportation contact, and instructions.
- Include transportation activities and estimated expenses in the daily itinerary when appropriate. Assign their payment arrangement and cost basis independently of who arranges or drives the vehicle.

## 6. Build the daily itinerary

- Organize the visit by local calendar day, sorted chronologically. Each day contains named activities, with times and locations when known, followed by its meals and expense details.
- Support multiple activities in a day, including ministry, travel, recreation, and time at camp. Allow days and activities to be copied and edited for repeated routines.
- Identify which visitors or planned group counts participate in an activity. Planning uses expected counts until staff choose to use the registered roster. Show which count basis is in use and surface differences when the roster changes.
- A meal can be served at camp, prepared by the camp kitchen as a packed meal, or obtained elsewhere. Link the meal and its expense so the same meal is counted once in the budget and once in kitchen preparation.
- Record requested quantities separately for breakfast, lunch, and dinner on each date. Allow first and last days and off-site days to differ. Show preparation or departure time and instructions for packed meals.
- Give kitchen staff a preparation view with in-camp and packed meal counts and applicable dietary needs. A restaurant meal appears in the itinerary and budget, with zero camp-kitchen preparation for that meal.
- Provide a readable itinerary and cost summary in English or Spanish, including a printable view. Keep internal staff notes and restricted participant information in authorized views.

### Illustrative day

Tuesday — Ministry visit to the orphanage

The following amounts are fictional examples, in US dollars.

| Planned item | Payment arrangement | Estimated unit cost | Cost basis | Quantity | Estimated total |
| --- | --- | --- | --- | --- | --- |
| Breakfast at camp | Church pays camp | $5 | Per person | 20 | $100 |
| Packed lunch from camp | Church pays camp | $6 | Per person | 20 | $120 |
| Camp transportation | Church pays camp | $150 | Whole group | 1 | $150 |
| Restaurant dinner | Participant pays directly | $12 | Per person | 20 | $240 |
| Donation to the orphanage | Church pays another provider | $100 | Whole group | 1 | $100 |

The church's estimated camp charge for this day is $370. The church's other estimated group expense is $100. Each restaurant diner should plan to bring $12. The kitchen prepares 20 breakfasts and 20 packed lunches.

## 7. Estimate the visit budget

Each expense records its description, linked day and activity where applicable, payment arrangement, cost basis, estimated unit amount, applicable quantity, and calculated total. Whole-visit charges such as lodging can be recorded once at visit level or broken into daily charges. Represent a charge in one place to prevent double counting.

| Payment arrangement | Meaning |
| --- | --- |
| Church pays camp | The church brings the money and settles the group's camp charges. |
| Church pays another provider | The church handles an expense outside its camp payment. |
| Participant pays directly | The traveler brings money and pays the restaurant, shop, or other provider. |

| Cost basis | Calculation |
| --- | --- |
| Per person | Unit estimate multiplied by the applicable number of participants. |
| Whole group | One estimated amount for the activity or visit, independent of headcount. |

- Keep payment arrangement and cost basis independent. A bus can be a whole-group charge paid to camp, while a camp meal can be a per-person charge paid to camp.
- Include all applicable visitors in the quantity, including leaders, unless staff specify different participation or pricing. Allow distinct rates or quantities when a cost applies differently to Students, Adults, or Leaders.
- Distinguish a confirmed zero price from a price still to be estimated. Flag incomplete costs and show totals as incomplete rather than presenting missing values as free.
- Use US dollars and integer cents for the initial pilot. Recalculate totals from current expense lines and quantities. Preserve entered unit estimates as the itinerary changes and flag changes to the published budget for review.
- Show daily and visit totals for the church's camp payment, the church's other expenses, and participants' direct expenses. Display optional additional personal spending guidance separately from planned expenses.
- Provide an optional per-person share of whole-group costs for the leader's collection planning. Label the divisor, handle rounding visibly, and preserve the original whole-group total. Different payment arrangements remain visible in the summary.
- Produce guidance stating the estimated amount to pay the church and the recommended amount to bring personally. Distinguish the church's total obligation from each traveler's suggested contribution. The leader can adjust contributions, for example when the church covers a donation from its own funds.
- These estimates do not establish an individual payment obligation to camp. The church is the payer for all Church pays camp lines.

## 8. Initial access and implementation assumptions

- Start visit setup, budgeting, housing, and roster management with Camp Leadership, reusing existing staff authorization. Delegating selected work to Registration or a church leader is a subsequent access decision. Registering as Leader alone grants no administrative access.
- Provide staff with a public registration link they can copy and email through their chosen channel. Automated invitations and an authenticated church-leader portal are separate features.
- Start with one planned itinerary and budget per visit, using expected or registered counts as explicitly selected. Confirm how the customer wants to handle headcount deadlines and later changes during the pilot walkthrough.
- Reuse the shared room reservation and calendar mechanisms. Keep Church visits identifiable as their own booking category, with visitor records and the church responsibility workflow appropriate to this program.

## Acceptance scenarios

1. Staff create a two-week ministry visit. Its dates appear on the Facilities Calendar and its room reservations prevent conflicting camp, event, or visit reservations. Canceling the visit releases its future reservations.
2. A Student, an Adult, and a Leader use the same group link. They appear once each on the visit roster. An 18-year-old Student is identified as an adult by age while retaining the Student visitor role.
3. The church leader acknowledges responsibility for permissions and supervision. Staff can see who acknowledged, when, and which wording was accepted. The acknowledgment begins unselected.
4. Staff apply the church's supervision arrangement and override a suggested dorm. Every occupant consumes a bed, the responsible church adults remain visible, and exceeding usable capacity is rejected.
5. Arrival uses Camp for arranging transportation and Church for providing the driver. Departure uses Church for both. Each leg retains its own details.
6. For the illustrative orphanage day with 20 travelers, the camp estimate is $370, the church's other expense is $100, and the direct spending guidance is $12 per restaurant diner. The $150 transportation charge and $100 donation are each counted once.
7. Kitchen staff see 20 breakfasts and 20 packed lunches for that day. The restaurant dinner appears on the itinerary without increasing camp dinner preparation.
8. Staff change a per-person meal quantity from 20 to 18. Its subtotal updates, while a whole-group transportation charge remains $150. Published guidance affected by the change is flagged for review.
9. A missing restaurant estimate makes the budget visibly incomplete. An explicitly free ministry activity contributes zero and is treated as estimated.
10. The public link allows a person to register without access to other visitors' records or the staff workspace. Registering as Leader grants no additional application permissions.
11. Staff record group arrival and departure with individual exceptions. People still at camp remain visible, and used rooms are marked for cleaning when their occupants check out.
12. Staff and public forms, transportation labels, and itinerary summaries work in English and Spanish on phones, tablets, and laptops.

## Proposed build order

1. Church visits navigation, visit setup, calendar integration, shared room reservations, and cancellation.
2. Public and assisted registration, visitor roster, and the recorded church leader acknowledgment.
3. Housing suggestions and overrides using church supervision arrangements, plus arrival and departure accounting.
4. Transportation arrangements and daily itinerary with meal preparation counts.
5. Expense estimates, group and personal budget summaries, and printable bilingual guidance.
6. Rehearse a fictional ministry visit with both in-camp and off-site days. Confirm registration fields, privacy arrangements, church supervision details, headcount updates, and budget publication behavior with the customer.
