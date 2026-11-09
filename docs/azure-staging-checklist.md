# Azure staging checklist

Use a private Azure environment with fictional records to rehearse the pilot before opening registration to families. Track the Git commit, Azure region, and date for each rehearsal.

## Prepare the release

- [ ] Open a GitHub pull request for staging preparation and confirm that the Node.js 24 checks pass. The workflow installs locked dependencies, checks types, runs tests, builds the app, and applies the SQL migrations and fictional seed to a disposable PostgreSQL 17 instance.
- [ ] Select the Git commit to deploy. Record its SHA in the staging deployment notes.
- [ ] Confirm the Azure subscription, region, and monthly staging budget with the subscription owner. Estimate App Service, PostgreSQL, backup storage, logging, and any networking charges before provisioning. Set a budget alert scoped to the staging resource group. Budget alerts notify the owner when thresholds are reached.
- [ ] Create a dedicated staging resource group, a Linux Azure App Service for the Next.js server, and a separate Azure Database for PostgreSQL Flexible Server instance. Confirm the database region and version. Use HTTPS for the site and TLS for PostgreSQL. Restrict database connectivity to the app and authorized migration access.

## Configure and deploy staging

- [ ] Put an access gate in front of the entire staging site before enabling pilot mode. Allow only named reviewers, including anyone testing the public form. Verify that an anonymous visitor cannot reach the application or its endpoints.
- [ ] Set staging-only application settings in Azure. Use the staging `DATABASE_URL`, a fresh `PDV_SESSION_SECRET`, distinct fictional-pilot role credentials, and `PDV_LOCAL_DEMO=1` behind the access gate. Leave `PDV_BANK_ACCOUNT_NUMBER` unset so the pilot shows the masked account. Store credentials outside GitHub source and avoid copying the local environment file.
- [ ] From an authorized connection, run the numbered SQL files in `db/` in ascending order with error checking enabled. Use `db/fictional-seed.sql` once on a new fictional staging database. Record the last migration applied. The app initializes the embedded database locally. With `DATABASE_URL` set, applying migrations is an explicit deployment step.
- [ ] Configure a manually triggered GitHub deployment after the Azure resources exist. Use OpenID Connect and grant the deployment identity only the Azure access it needs. Deploy the reviewed build from the recorded commit. The current `npm start` command binds to loopback for the local pilot. Configure App Service to start Next.js with `npx next start --hostname 0.0.0.0` so it listens on the assigned port.
- [ ] Verify that the app starts after a restart, reaches PostgreSQL, and stays behind the staging access gate. Check operational logs for errors and confirm that routine logs contain no camper data or credentials.

## Rehearse with fictional records

| Workflow | What to verify |
| --- | --- |
| Public camp registration | In Spanish and English, select a dated week, check regular and early-bird pricing, submit with payment pending, and revisit the confirmation and balance. |
| Staff intake and finance | Enter desk and paper registrations. Check attachment restrictions, the follow-up queue, weekly and season scholarship limits, and verified deposits. |
| Arrival and housing | Check in a camper, review the suggested dorm, confirm or override it with a reason, and verify bed and staffing rules. |
| Departure | Process a bus roster, leave someone off, record any required handoff, and correct an individual departure. |
| Other camp operations | Verify facilities bookings, special-event registration, and weekly staffing. |
| Staff access | Test permitted and forbidden actions for each role, including health, kitchen, and signed forms. Test public registration from inside the staging gate without an app staff session. |
| Recovery | Restore PostgreSQL to a separate database and verify that the application can read the restored fictional records and attachments. Rehearse redeploying the prior known-good build. Check schema compatibility before reverting app code after a migration. |

Record results and issues against the tested commit. Re-run affected workflows after changes and repeat the rehearsal before production.

## Before production

- [ ] Implement and verify individual staff sign-in. The Azure subscription owner hosts the app and database. Register the app in the camp’s Microsoft Entra tenant with its Microsoft 365 administrator. Camp Leadership manages app roles separately from weekly staffing. Use individual identities for action history.
- [ ] Separate production public registration from the fictional demo flag. Production staff sign-in and public registration currently depend on pilot settings. Replace the shared pilot role logins and test that unauthenticated families can reach only the intended public routes.
- [ ] Confirm the real payment details and camp notice, the public Events-page link, and which staff can access sensitive records. Implement and test the full camper-data retention process, including signed-form cleanup and backup expiration.
- [ ] Provision a separate production environment and database. Verify the schema and approved configuration on an empty production database before publishing the registration link. Keep fictional seed data in staging.

## References

- [Azure App Service deployment from GitHub](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions)
- [Azure Database for PostgreSQL deployment from GitHub](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-deploy-github-action)
- [Azure budgets](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)
