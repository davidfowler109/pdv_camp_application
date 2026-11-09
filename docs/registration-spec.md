# Camper Registration Specification

**Status:** Draft for review  
**Governing document:** [Camp Application Constitution](constitution.md)

**Sensitive decisions:** [PDV-001 — Authorization and verification](sensitive-decisions.md#pdv-001--who-can-authorize-registration-and-how-the-camp-verifies-it)

## Outcome

A camper can register for a week of Palabra de Vida with help from a parent, guardian, pastor, or staff member. Camp Registration can review the submission, follow up on missing items, and confirm a place. The confirmed roster supports arrival, dorm assignment, and departure.

## Agreed rules

- A season can have multiple dated sessions with configured age groups. The 2027 pilot includes two kids sessions (7–11), two youth sessions (12–17), and two adult sessions (18+). Each week can have at most 250 confirmed campers. Staff confirmation reserves the place, including while participation permission is pending. A confirmed place counts toward the weekly limit immediately. Participation permission must be obtained before the camper joins activities.
- Track submission, confirmation, participation permission, physical presence, and financial standing separately. A scholarship or approved payment exception can cover all or part of a fee. A balance alone does not determine attendance.
- Record who completed registration and who authorized it. Use age on the date authorization is given to determine the signer. A parent or legal guardian authorizes for a camper under 18. A camper aged 18 or older authorizes for themselves, including when someone else helps complete the form.
- Collect personal information for defined camp purposes. New personal fields start blank. Data collection and participation require explicit actions. Camp registration records a separate Yes or No for use of the camper’s image in interviews promoting the camp on social media. Either answer permits registration. Record the signer, timestamp, and version of the notice or permission text.
- Apply one retention schedule to all camper ages, starting at the end of the scheduled week. At 15 months replace the camper’s name with initials, remove unnecessary identifiers and attachments, and restrict access to the remaining record. At two years retain anonymized totals and delete individual records, subject to specific retention obligations the camp confirms. Account for exports and backup expiration.
- Set a maximum number of scholarship awards for each week. Camp staff can allocate a batch of single-use codes to a pastor, missionary, or designated camp staff member for a specific week. Each allocated code reserves one award regardless of the amount covered. The distributor hands out the codes to campers or families at their discretion. A code is redeemed when a camper uses it at registration. Record who issued the code, who received it for distribution, which registration redeemed it, and the value of the award for financial reporting. Award value does not determine availability. Camp Leadership can set a separate award limit for any-week codes. A season uses the calendar year of the selected week’s start date. An any-week code is redeemable once in a camp week in that season, independent of the week-specific limit. Staff can record a distributor email and instructions and open an email draft containing the unused codes. Home church is optional.

## Pilot defaults

- A pending permission or paperwork item stays visible on the confirmed roster. Staff can set or change a follow-up date. The date is a reminder. Camp Registration can decide whether to keep or manually release a place and record the outcome.
- Participation permission remains required before joining activities. Explicit data authorization, the weekly limit, and the agreed safety rules still apply.

[Team review walkthrough](pilot-walkthrough.html) uses fictional data to rehearse the flow.

## Proposed first-release flow

1. Select the camp week and indicate whether the camper is registering directly or with help.
2. Obtain explicit authorization from the appropriate signer through one of the routes below. Open the camper’s personal fields after data collection is authorized. Track participation permission separately from data authorization.
3. Collect camper details, emergency contact, health and allergy information, transportation choice, and home church if provided. Record participation permission. Use a phone-friendly Spanish form as the initial proposal.
4. Show the selected week’s fee before registration. An optional early-bird price applies through its configured end date in Panama time. Save the price when registration is submitted. After submission, show the registration reference and bank transfer instructions. If a scholarship code is pending review, ask the family to wait for the updated balance. Staff match deposits and record verified payments separately.
5. Show that the registration was received and identify missing items. Camp Registration reviews the submission. An authorized staff member confirms a place when one is available.
6. Hand off the week roster to check-in. Camp Registration resolves unmatched arrivals and missing permission while a designated adult supervises the camper. Camp Registration can override a suggested dorm and records why. The Cabin Leader supervises during an unexpected pickup and Camp Leadership verifies and decides on release. Detailed arrival, dorm, and departure workflows belong in their own specification.

## Proposed authorization routes

- **Remote by email or WhatsApp.** Ask which channel the signer can reliably use. Send a link to the same authorization form through that channel. Keep camper and health details out of the message. For the pilot, staff can share the link manually through an approved camp channel.
- **In person on a shared device.** At church or camp, a pastor or staff member can explain the form and help navigate it. The signer reviews the notice and gives authorization directly. A personal device or email account is not required.
- **Paper when a device or connection is unavailable.** Use the same versioned notice and separate choices on paper. The signer signs the form. Camp Registration verifies and records the authorization from the signed form before opening or entering the camper’s personal details. Store any retained evidence with restricted access and apply the camp’s retention policy.
- **Signer and helper.** The helper facilitates the process. A parent or legal guardian authorizes for a camper under 18. A camper aged 18 or older authorizes for themselves. Record the signer, their relationship to the camper where applicable, the helper or staff recorder, the route, the date authorization was given, and the notice version. If authorization is missing at arrival, follow the supervised arrival exception.

Camp Leadership designates who can witness authorization. Camp Registration distinguishes the signer, witness, courier, and staff recorder where applicable. For email or WhatsApp, send the link directly to a contact reasonably attributable to the signer. If the information conflicts or a custody concern arises, keep authorization pending and follow up through an independently established contact or refer the case to Camp Leadership. See [PDV-001](sensitive-decisions.md#pdv-001--who-can-authorize-registration-and-how-the-camp-verifies-it).

## Registration entry points

The public link opens the standalone form in English or Spanish and can preselect a camp week. Staff use the Registrations roster to find an existing application or start a new one. Desk entry and entry from signed paper use the same camper fields and review queue. Staff record how authorization was obtained. A blank printable form for the selected week includes the notice version and space to sign and date the authorization.

The roster filters by week, name, and open follow-ups. Display 25 results per page with place, permission, balance, and follow-up in separate columns. Preserve the roster context when staff return from an application review.

## Proposed live pilot fields

Use the same field definitions for web, shared-device, and paper registration. Required fields apply to the relevant step. Staff can record missing information for follow-up where the agreed rules permit it. Personal fields and consent choices start blank. A required answer may be “none” or “unknown” where appropriate. An unknown health answer prompts follow-up and stays distinct from “none.”

| Area | Required | Conditional or optional | Purpose |
| --- | --- | --- | --- |
| Registration and camper | Camp week, given name(s), surname(s), date of birth, and the camp-approved dorm grouping field | Name used at camp if different | Eligibility, matching at arrival, and dorm suggestion. Derive age from date of birth using the relevant reference date. |
| Helper and signer | Who is completing the form, signer name, and signer role | Helper name when someone assists. Relationship and declaration of authority for the minor’s signer. For remote authorization, use the signer’s selected channel and only the email address or number needed for delivery. | Assisted signup and traceable consent. Paper and shared-device signup work without the signer having an email account or device. |
| Camper address | Where the camper lives, with locality and enough detail to locate the home | Street and house number where available. Accept community, landmark, and directions where a formal street address is unavailable. | Plan an emergency return or authorized handoff when needed. Limit access to staff handling the incident or transport. |
| Emergency contact | Name, relationship, and a reachable phone number or staff-reviewed contact arrangement | Additional contact if available. Record the preferred reachable channel or trusted contact arrangement if the family has no reliable phone. Reuse the guardian’s contact with an explicit choice when appropriate. | Reach someone during camp, including for an 18-year-old who signs for themselves. |
| Health and accommodations | Explicit answers for food allergies, medication allergies, medication needed during camp, and care or activity accommodations | Relevant details when a need is reported. Additional instructions and comments are optional. | Route reported needs to designated staff. Provide kitchen staff with food restrictions and Cabin Leaders with relevant care instructions. |
| Transport and departure | Arrival and departure method | Choose Albrook, Westland, or La Espiga for each camp bus leg. Show the morning pickup times on the arrival choices. If a minor will be collected by an adult, record the authorized pickup person before release. | Prepare rosters and document the expected handoff. Record actual movements at camp. For an emergency return home, staff confirm the destination and who will receive the camper before transport and log the handoff. Follow the unexpected-pickup procedure if the recipient differs from the authorized plan. |
| Permission | Explicit authorization for data collection before camper details are collected. Explicit participation permission before activities. | Participation permission may be pending when staff confirm the place. | Distinguish consent, place confirmation, and readiness to participate. |
| Payment and scholarships | Families can submit with payment pending. Staff record payment amount and reference when a payment is received. | Scholarship code if issued. Optional receipt when the camp uses it to verify deposits. | Apply valid codes and track payments and balances separately from attendance. |
| Camp logistics | None for this group | Home church is optional. Shirt size is required only if the camp supplies a shirt to that camper. | Support church coordination and shirt distribution where applicable. |

### Fields to consolidate or leave out

- Consolidate duplicate email fields. Collect a camper’s own email or mobile number only if needed for the chosen workflow, such as when an 18-year-old authorizes remotely. Replace the general “read the information” checkbox with a versioned notice and explicit authorization.
- Leave out national ID or passport numbers, social security numbers, country of birth and insurance details unless the camp confirms a specific operational or legal purpose. Leave out referral source, promo code, and first-time attendance as required fields. Track scholarship codes separately. Derive returning status from available records where practical.
- Capture submission time, authorization time and method, notice version, staff recorder or witness where applicable, registration and follow-up status, actual check-in and departure, dorm assignment, and payment and scholarship records through the system or staff workflow.

### Privacy and launch review

Show the privacy notice before consent. For the Spanish notice, confirm the organization responsible for the data, its purposes, who can receive it, retention, rights and how to exercise them, and any cross-border hosting or transfers. Confirm any camp-specific health, emergency authorization, insurance, or recordkeeping obligations before opening live registration. The proposed operational fields above are not a determination that Panama law requires each one. [ANTAI legislation and regulations](https://antai.gob.pa/legislacion/) · [ANTAI guidance for minors’ data](https://antai.gob.pa/guia-para-el-tratamiento-de-datos-personales-de-menores-de-edad/)

## Agreed staff workflow

- Camp Registration enters signed paper forms. Record how the form was received and who it came from when known, along with who entered it. This intake record is the accountable verification for routine paper submissions. Identify a witness separately when someone observed the signing. Follow PDV-001 when information conflicts or a custody concern arises.
- Show a weekly follow-up queue above Registrations with counts for all open, overdue, due today, and undated follow-ups. Staff complete or reschedule follow-ups in Review registration.
- Show the outstanding balance and participation permission status at a glance to staff working from the registration or check-in roster. Keep these as separate statuses and keep payment evidence and health details in their respective staff views.
- Use the current walkthrough as the arrival screen baseline: bus roster, camper lookup, mark present, permission status, and suggested dorm with bed availability, Cabin Leaders and Camp Counselors, and a recorded reason when staff change the suggestion. Revisit the screen after the pilot if staff identify a gap.

## Acceptance scenarios

- A designated pastor who sees a guardian sign can be recorded as a witness. A pastor who only delivers the signed form is recorded as the courier. Camp Registration records the authorization without requiring a routine ID upload or second verifier.
- If information conflicts or a custody concern is reported, authorization stays pending while Camp Registration follows up or refers the case to Camp Leadership.

- A pastor initiates registration for a 12-year-old. The parent or guardian explicitly authorizes it. The submission identifies the pastor as helper and the parent or guardian as signer.
- A family without reliable internet, a personal device, or an email account can register through a shared device or signed paper form. The record distinguishes the signer from the staff member who records the authorization.
- A camper who is 18 on the authorization date completes their own authorization even if a parent helped. The same privacy and retention rules apply to that record.
- A camper explicitly reports no food allergies and leaves the details blank. A camper who reports an allergy is prompted for relevant details, and an unknown answer is flagged for follow-up.
- A family without a formal street address provides a community, landmark, and directions. Staff can use those details to locate the home and confirm a receiving adult for a minor before an emergency return.
- A camper arriving by bus and leaving with an authorized adult is prompted for the inbound bus stop and applicable pickup details. A family traveling independently is not asked for a bus stop.
- Online, staff, and printable registration forms ask about promotional interview image use with neither answer selected. Staff can record that an older signed paper form did not include an answer.
- Two staff members try to confirm the last place at the same time. Only one confirmation succeeds and the other application stays available for follow-up.
- A week has one scholarship award left. A full or partial award uses that last allocation. Staff can report the value awarded, and a further award is unavailable even if the amount awarded so far is low.
- Camp Registration allocates five codes to a pastor for one week. Five awards are reserved. After one family uses a code at registration, staff can see one redeemed code and four still unredeemed in that batch. No camper names are needed when allocating the batch.
- Two registrations attempt to redeem the same scholarship code. At most one succeeds. A code issued for one week cannot be redeemed for another.
- A camper submits without payment. Staff can see the balance and record an approved exception. An authorized staff member can confirm an available place.
- Camp Registration confirms an available place while participation permission is pending. The camper counts toward the 250-place limit, appears on the confirmed roster with permission still pending, and cannot join activities until permission is recorded.
- A camper arrives before permission is resolved. Camp Registration records their presence without treating it as participation permission.
- At the retention milestones, the appropriate identifying information is removed for both minor and adult campers. Anonymized reports remain available after individual records are deleted.

## Decisions to confirm with the camp

1. **Authorization handoff.** Confirm which camp email and WhatsApp channels staff will use, who Camp Leadership will designate as witnesses, and who handles signed paper forms. Confirm the minimum contact details required for a remote request.
2. **Confirmation and waitlist.** Beyond eligibility for the week and authorization to collect data, are there any other requirements to confirm a place? What follow-up timing should the camp recommend, and how should staff record a decision to release a place? Who approves payment exceptions, and how are waitlist places offered?
3. **Scholarship allocation.** When can staff cancel an unused code and return its reserved award to the weekly allocation?
4. **Form fields and notices.** Review the proposed live-pilot fields with camp staff. Confirm the age reference date for week eligibility, dorm grouping wording, notice and permission text, any additional legally required records, and special retention requirements.
5. **Payment evidence.** Confirm whether the camp uses receipts to verify deposits and wants the optional upload enabled.
