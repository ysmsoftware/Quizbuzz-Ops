# QuizBuzz Ops: admin user guide

**For:** the QuizBuzz team who run the ops console (super admins, billing admins, support).
**Covers:** every screen in the sidebar, with plans, subscriptions, invoices and payments in depth.
**Last checked:** 2026-11-08, against branch `feature/subscriptions`.

Ops is where we run the business behind QuizBuzz. Customers never see it. It is the **system of record for billing**: plans, subscriptions, invoices, payments, credit notes and auto-debit live here, and ops writes each organization's limits and feature flags into the main app.

---

## Contents

1. [Roles: who can do what](#1-roles-who-can-do-what)
2. [A daily routine](#2-a-daily-routine)
3. [How billing works in one page](#3-how-billing-works-in-one-page)
4. [Organizations](#4-organizations)
5. [An organization's Subscription tab](#5-an-organizations-subscription-tab)
6. [Subscription Plans](#6-subscription-plans)
7. [Invoices](#7-invoices)
8. [Refunds and credit notes](#8-refunds-and-credit-notes)
9. [Auto-debit](#9-auto-debit)
10. [AI credits](#10-ai-credits)
11. [Event Pass: Contest Calculator and Bookings](#11-event-pass-contest-calculator-and-bookings)
12. [Billing Settings](#12-billing-settings)
13. [Leads](#13-leads)
14. [Feature Flags](#14-feature-flags)
15. [Other screens](#15-other-screens)
16. [How do I…? (common tasks)](#16-how-do-i-common-tasks)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Roles: who can do what

Your role is shown at the top of the screen. Only a super admin can change it.

| Action | Super admin | Billing admin | Support |
|---|---|---|---|
| View organizations, subscriptions, invoices, payments, leads | Yes | Yes | Yes |
| Change a plan, move dates, add or remove overrides | Yes | Yes | No |
| Issue invoices, create pay links, record payments, change due dates | Yes | Yes | No |
| Create and edit plans | Yes | Yes | No |
| Bookings and the contest calculator | Yes | Yes | No |
| Work on leads (status, notes) | Yes | Yes | Yes |
| Change grace days | Yes | No | No |
| Issue a **complimentary** (₹0) invoice | Yes | No | No |
| Void a payment, void an invoice, write off | Yes | No | No |
| Refunds and credit notes | Yes | No | No |
| Give free AI credits | Yes | No | No |
| Move a plan's subscribers to another plan | Yes | No | No |
| Save Billing Settings | Yes | No | No |

Every change is written to the **Audit Log** with who did it and the reason given.

---

## 2. A daily routine

1. **Invoices → Overdue.** Who owes us money past the due date. Follow up, extend the due date, or record a payment that arrived by bank.
2. **Leads → New.** People who pressed "Talk to sales". Reply, then set the status.
3. **Overview.** Contests live now or starting in the next 7 days, so nothing surprises us.
4. **Messaging**, filtered to Failed, if a customer says an email never came.

---

## 3. How billing works in one page

Three separate questions, kept apart on purpose:

| Question | Name | Values |
|---|---|---|
| What do they get? | **Plan** | Free, a public plan (Solo, Pro 500…), or a **private** plan made for one customer |
| How does money reach us? | **Collection method** | **Auto-debit** (Razorpay charges each cycle), **Pay online** (a pay link by a due date), **Offline** (bank transfer or cheque that we record), **Complimentary** |
| Can they use it right now? | **Access state** | Active, Past due, Restricted, Expired, Cancelled |

**Every amount owed is an invoice** with a due date, and any kind of payment settles it. Limits only look at dates. They never ask how someone paid.

### What happens when a renewal isn't paid

Grace is **7 days** by default and can be changed per customer (a contract might have 30).

| When | Status | What the customer can do |
|---|---|---|
| Renewal date passes, unpaid | **Past due** (amber banner in the app) | Everything |
| End date + grace days | **Restricted** (red banner) | Nothing new: no new contests, questions, members or learners. Live and scheduled contests still run, results and certificates still work |
| 30 days after the end date | **Expired**: Free limits apply | Free plan. All data is kept |
| They pay, any time | **Active** | Everything returns at once |

The owner sees our own wording for a failed payment ("your bank declined it", "card expired"…). The raw gateway message stays in ops (Audit Log).

### Upgrades and downgrades

- **Upgrade** (a dearer plan by monthly rate): starts **now**. They pay the new price minus a credit for unused time.
- **Downgrade**, or a shorter billing cycle on the same plan: waits for the **period end**. Nothing is charged now; they keep what they paid for.
- With no paid time left (Free, lapsed), any change starts now.

A downgrade never removes data. Existing contests keep their settings; only new additions are checked against the new limits.

### Plan enforcement switch

The feature flag **`plan_enforcement`** decides whether limits are actually refused. While it's **off**, nothing is blocked and each would-be refusal is logged as `WOULD_BLOCK`, so we can check the limits are right before turning it on.

---

## 4. Organizations

**Sidebar → Customers → Organizations.**

- **Search and filter** by plan or feature. Click a row to open the organization.
- **New Organization:** creates an org and its owner. The owner is emailed how to set a password.
- **Bulk Suspend:** tick several rows, give a reason.

### Inside an organization

Tabs: **Overview, Members, Contests, Participants, Institution, Features, Payments, Invoices, Payout Account, Support Notes, Subscription.**

| Action | What it does |
|---|---|
| **Edit** | Name, contact details, organization type |
| **Suspend** | No new activity. Scheduled and live contests **keep running**. Auto-debit is **not** stopped |
| **Reactivate** | Lifts a suspension |
| **Delete** | Soft delete; can be restored. **Cancels auto-debit straight away**, so a deleted org is never charged. Restoring it does **not** bring the mandate back: the owner sets it up again |

Every one of these asks for a reason, which goes in the Audit Log.

**Support Notes** is a free-text log for the team, never shown to the customer.

---

## 5. An organization's Subscription tab

**Organization → Subscription.** Everything about what this org pays for.

### The plan card

Shows the plan, status, billing cycle, **Cycle Start** and **Cycle End**, and when they would be **Restricted from** and on **Free limits from** if nothing is paid. The Free plan has no end date.

Also shown when they apply:
- **Auto-debit:** status, method (UPI, card, eMandate), next charge date and the Razorpay subscription id.
- **Last payment error**, in our wording.
- **Pending change:** "Changes to Basic on 8 Dec 2026", with **Cancel change** (they then stay on the current plan).
- **Last Payment Receipt**, with amount, date and reference.

Buttons:
- **Change / Upgrade Plan** (below).
- **Access and contract** (below).
- **Resend renewal reminder** (envelope icon): emails the owner a renewal reminder now.

### Change plan

1. **Select Target Tier**: the plan.
2. **Billing cycle**: Monthly, Every 6 months, Yearly (only the cycles the plan offers).
3. **When**:
   - **Now, with a fresh period**: the new plan starts today with a new period.
   - **At the period end** (date shown): they keep what they paid for, then switch. Shows on the card as a pending change, and the owner is emailed "Your plan changes to … on …".
4. **Reason / Notes for Audit Log**: why, for the audit log.

Changing a plan here does **not** create an invoice. If they owe money for the change, issue one from the **Invoices** tab (section 7).

A pending change is applied by the hourly job. For an auto-debit customer it waits for Razorpay's charge on the new plan, and applies a day later if no charge comes. Any new plan assignment or payment for a plan clears a pending change.

### Access and contract

| Field | Meaning |
|---|---|
| **Cycle started** | Start of the current period. Also where each month of usage starts counting. Must be before Paid until |
| **Paid until** | End of the period. Move it to extend access (a goodwill week, a late bank transfer) |
| **Grace days after that** | Days of Past due before Restricted. **Super admin only** |
| **Contract start / Contract end** | For contracts. The owner is reminded 60, 30 and 7 days before the contract ends |
| **PO number**, **Contract notes** | Printed on, or kept with, their invoices |

For an auto-debit customer, moving dates here does **not** move Razorpay's charge date. The audit entry notes this.

### Limit overrides

**Add Custom Override** gives one org more than its plan, or a feature its plan lacks.

- **Limits:** Max Quizzes per Month, Max Participants per Quiz, Max Questions per Quiz, Max Team Members, Max Learners, Max Candidates per Month.
  - **Add to current limit**: e.g. +500 participants on top of the plan.
  - **Set exact limit to**: replaces the plan's number.
  - **Unlimited Quota**.
- **Features:** Webcam Proctoring, Certificate Branding, Learner Groups, Gradebook, Ambassador Campaigns, Broadcast Emails, Custom Domain, Priority Support. **Turn on** or **Turn off**.
- **Expires At** (optional) and an **Authorization Reason** (required).

Overrides apply at once, survive a plan change, and stay on top of Free limits if the plan lapses. **Revoke** removes one (reason required). Overrides created by an Event Pass booking are removed when the booking is cancelled.

**Quota usage** shows used / limit for each meter, and marks where an override is active.

### Plan history

Every plan change: from, to, who, when.

---

## 6. Subscription Plans

**Sidebar → Revenue → Subscription Plans.** The plan catalogue. Each card shows price, limits, features and how many orgs are on it.

### Create or edit a plan

- **Basic Details:** Plan Name, Plan Slug (lowercase, hyphens), Description.
- **Prices:** turn on **Monthly billing**, **6-month billing** and/or **Annual billing**, each with its price (before GST).
- **On sale to new customers:** off for a contact-sales or retired plan. Ops can still assign it.
- **Shown on page:** Organizers, Educators, Business, or None. Decides which tab of the owner's plan picker it appears on.
- **Private to one organization (optional):** for a special price or special limits. Never on the website, and only that org can be put on it.
- **Default Quota Limits:** leave a box blank for unlimited. Max Learners 0 means no learner portal.
- **AI Credits per Month.**
- **Feature Entitlements:** the feature switches.

When you save changes to a plan that has subscribers, an **impact check** shows how many orgs it affects. Confirm, and their limits update immediately.

**Deactivate** removes a plan from sale. Existing subscribers stay on it.

### Move subscribers to another plan

Use this for a new plan version or a price change (**super admin only**). On the plan's card: **Move subscribers to another plan**.

1. **Move them to:** the target plan. A preview counts who moves, by payment method, and who can't (an org on a cycle the new plan doesn't offer is left for you to handle).
2. **When:**
   - **At each one's renewal**: prepaid time keeps its price. Recommended.
   - **Now, keeping their dates.**

**Auto-debit at a new price:** Razorpay can't change what an existing mandate charges, so these orgs stay on the old price until they approve a new mandate. The email they receive tells them to.

---

## 7. Invoices

**Sidebar → Revenue → Invoices** lists every org's invoices. Filters: **Overdue, All, Unpaid, Part paid, Paid**. Each org also has an **Invoices** tab with just theirs and an **Issue invoice** button.

Invoice numbers look like `INV/26-27/00012`, receipts `REC/26-27/00009`, credit notes `CN/26-27/00001`. Every invoice is a GST tax invoice from the day it's issued. Billing Settings must be filled in first (section 12).

### Issue an invoice (payment request)

**Organization → Invoices → Issue invoice.**

| Field | Options |
|---|---|
| **How will they pay?** | **Online, with a Razorpay pay link** · **Bank transfer or cheque, we record it** · **Complimentary, no charge** (super admin only) |
| **Plan** | **No plan change** (an instalment, or an extra charge on their current plan) · or a plan to grant |
| **Billing cycle** | The plan's cycles, or **Contract with its own end date** |
| **Access until** | For a contract, or optional |
| **Amount before GST (₹)**, **GST %** | Total with GST is shown |
| **Due in (days)** | e.g. 15 for "pay within 15 days" |
| **When do they get access?** | **Now, before payment**: usable straight away, restricted automatically if unpaid after the due date plus grace. **On payment**: nothing changes until it's paid in full |
| **Description on the invoice** | e.g. the partner deal it belongs to |

The owner is emailed the invoice. For an online invoice the email has a **Pay** button that opens their Billing page. Bank details are never emailed: for a direct transfer the email asks them to contact us, and we reach out too.

### Actions on an invoice

| Action | Who | Notes |
|---|---|---|
| **Download PDF** | All | The same saved file the owner and the email get |
| **Create pay link** | Billing | For an online invoice that lost or never had a link. On an overdue invoice the link lasts 7 days and the due date stays |
| **Resend email** | Billing | Emails the owner again |
| **Change due date** | Billing | Rebuilds the PDF and extends the link |
| **Record payment** | Billing | See below |
| **Refund or credit note** / **Credit note** | Super | Section 8 |
| **Write off** | Super | Gives up on the money. Reason required |
| **Void invoice** | Super | Cancels an invoice issued by mistake. Reason required. It does not undo a plan change it gave: change the plan separately |

Payment sources shown on an invoice: Razorpay checkout, Razorpay link, Razorpay auto-debit, Bank transfer, Complimentary.

### Record a payment (bank transfer, cheque, UPI to our account)

1. **Cash received (₹)** and **TDS they deducted (₹)**. The invoice is paid when cash plus TDS covers the total. Part payments are fine; "Still due" shows the rest.
2. **Received on**, **Paid by** (NEFT, RTGS or IMPS · Cheque · UPI to our account · Other).
3. **UTR or cheque number.** The same reference twice for one org is refused.
4. **Proof (optional):** PDF, PNG or JPG up to 5 MB, such as a bank screenshot or the customer's remittance advice.
5. **Note (optional).**

It is marked as recorded manually, with no Razorpay record behind it. A receipt is issued and emailed, and access follows the invoice's settings.

**Void payment** (super admin): for a bounced cheque or a wrong entry. It stays on the record, crossed out, and the invoice goes back to unpaid. Reason required.

---

## 8. Refunds and credit notes

**Super admin only.** A credit note offsets an invoice in full or in part. The invoice itself never changes.

**Invoice → Refund or credit note** (or **Credit note** if nothing was paid):

1. **Amount, including GST (₹).** Can't exceed what's left on the invoice. The credit note carries the invoice's GST split, scaled to the amount.
2. **Refund:**
   - **Refund through Razorpay**: pick the **Payment to refund**. Can't exceed what that payment has left. Razorpay returns the money to the customer's card, UPI or bank.
   - **I refunded it by bank transfer**: enter the **UTR of your transfer**.
   - **No refund**: only lowers what they owe.
3. **End their access now** (optional): stops any auto-debit and moves them to Free. Data is kept.
4. **Reason** (required, printed on the credit note).

What follows:
- The credit note is saved as a PDF, emailed to the owner with the PDF attached, and listed on the invoice in ops and on their Billing page.
- A payment refunded in full shows **REFUNDED**.
- An unpaid invoice credited in full closes as "Cancelled by credit note CN/…". This is how to cancel a tax invoice that was issued but won't be paid.

---

## 9. Auto-debit

Razorpay Subscriptions charge the customer each cycle by **UPI AutoPay, card or eMandate**. Only for self-serve plans billed **monthly or every 6 months**. Yearly is always paid upfront.

### Who can use it

Everyone. There is nothing to turn on per customer: any owner on a self-serve plan billed monthly or every 6 months can choose **Renew automatically** at checkout, or **Turn on automatic renewal** on their Billing page. **Feature Flags → `auto_debit`** is a platform-wide switch, on by default, and `razorpay_gateway_active` must be on too. Switching `auto_debit` off is a kill switch: nobody can set up a new mandate, and mandates already running keep charging.

### What you see

On the org's Subscription card: mandate status, method, next charge, and the last failure. Each charge creates a paid invoice with source **Razorpay auto-debit**, a receipt and two emails, exactly like a one-time payment.

### How it behaves

- **A failed charge:** Razorpay retries for a few days. The owner is emailed at the first failure and again when retries stop. Status goes Past due, then follows the timeline in section 3.
- **The customer cancels the mandate in their bank or UPI app:** they go back to paying online, with the usual reminders.
- **The owner cancels the plan or turns renewal off:** the Razorpay subscription is cancelled at once, so it can never charge again.
- **Paying once while on auto-debit** (renew or upgrade by link) stops auto-debit for that period.
- **Org deleted:** auto-debit is cancelled (section 4). **Suspended:** it keeps running.
- **Downgrade:** the new, cheaper mandate starts at the period end and its first charge switches the plan.

The hourly job re-reads every live mandate from Razorpay and catches any charge whose webhook was missed.

---

## 10. AI credits

Each plan has **AI Credits per Month**. On top of that, customers can have **top-ups** valid for 12 months.

- **Customers buy packs** from Billing → AI credits: 500 for ₹1,499, 2,000 for ₹4,999 or 10,000 for ₹19,999 (before GST). It's an ordinary invoice with a pay link; paying it adds the credits. Only where the opt-in flag **`ai_top_ups`** is granted, and never on a private (account-managed) plan. Turn it on only for orgs where AI generation is live.
- **You can give credits free** (super admin): **Organization → Subscription → AI credits → Give credits**. Enter the credits and a reason (pilot, goodwill…). The card lists live top-ups and when they expire.

---

## 11. Event Pass: Contest Calculator and Bookings

An **Event Pass** is a one-off booking for a single big event, priced by participant count.

### Contest Calculator

**Sidebar → Revenue → Contest Calculator.** Enter participants, questions, duration, schedule and add-ons. The panel shows:
- **Event Pass price**: what we charge. Rounded up to …99, from the tier sheet's participant anchors. Add-ons: extra contests (+25% each), AI questions, WhatsApp, an engineer on the day.
- **Cost floor**: our own cost-plus figure. A warning shows when the price is **below the cost floor**.

**Copy shareable estimate** copies a proposal to send. **Convert to Booking Quote** creates a booking (pick the organization, or enter the client's details).

### Bookings

**Sidebar → Customers → Bookings.** Each booking moves through:

**Quoted → Paid → Provisioned → Completed** (or **Cancelled**).

1. **Mark as Paid**: enter the payment reference.
2. **Provision**: needs the booking linked to an organization. It raises that org's limits for **30 days from the event**: participants and questions to fit, two more contests, plus proctoring, branded certificates and CSV export. These appear as overrides on the org's Subscription tab, tagged with the booking.
3. **Mark Completed** after the event.
4. **Cancel** (reason required) removes the limits the booking gave.

> Per-contest commission and "revenue share instead of a fee" are **on hold**. Payouts use the global commission rate.

---

## 12. Billing Settings

**Sidebar → Revenue → Billing & Revenue → Settings tab.** **Super admin only** to save. Invoices are refused until this is filled in.

- **Company name, Address**: shown at the top of every invoice and receipt. **Billing email**, **Phone**.
- **State**: decides CGST and SGST, or IGST, on each invoice. **GSTIN**: printed on every invoice and receipt. Both required.
- **SAC code**: printed on the invoice. Have the CA confirm it.
- **Bank account name, Bank, Account number, IFSC, UPI ID**: printed for customers who pay by transfer.
- **Invoice, receipt and credit note number prefixes** (default INV, REC, CN; up to 4 letters).

Changes apply to new documents only. Documents already issued keep the details they went out with.

---

## 13. Leads

**Sidebar → Customers → Leads.** People who pressed "Talk to sales" on their Billing page, with their message, phone and expected learner count.

- Set the **status**: New, Contacted, Won, Lost.
- Add **notes**.
- **Open organization** jumps to their org, to set up a private plan and invoice.

---

## 14. Feature Flags

**Sidebar → Platform Config → Feature Flags.**

- **Platform defaults:** on or off for everyone. An org override carves out an exception.
- **Opt-in features (granted per organization):** off for every org until you **Grant access**. The global switch only makes a feature grantable, and switching it off is a **kill switch for all**.
- **Emergency controls**, platform-wide: maintenance mode, pausing all candidate registrations, payment gateways.

Every override needs a reason, such as "Pilot institution, contract dated…".

Billing-related flags:

| Flag | Type | What it does |
|---|---|---|
| `plan_enforcement` | Global | Off: limits are only logged (`WOULD_BLOCK`). On: they are refused |
| `auto_debit` | Global | Every owner may choose automatic renewal. Off stops new setups; running mandates keep charging |
| `ai_top_ups` | Opt-in | The owner may buy AI credit packs |
| `razorpay_gateway_active` | Global | Online payments and checkout |

A plan's features also switch features off for an org. An override set here beats the plan.

---

## 15. Other screens

| Screen | What it's for |
|---|---|
| **Overview** | Totals, contests by status, live and upcoming contests, new orgs, recent audit entries |
| **Ops Metrics** | Live server health (memory, WebSocket connections) and a live contest's participant snapshot. Lower the poll interval during a load test |
| **Payments** | Every contest registration payment, with Razorpay order and payment ids, attempts and webhook status |
| **Billing & Revenue** | Payout desk: org payout accounts (Razorpay linked accounts) and payout status |
| **Messaging** | Every email and WhatsApp the platform sent: queued, delivered or failed, with the reason. **Retry** or **Resend** |
| **Audit Log** | Read-only record of every admin action |
| **Ambassador Types**, **Colleges & Departments**, **Application Logo** | Reference data and branding used by the main app |

---

## 16. How do I…? (common tasks)

**Set up an enterprise customer who pays by bank transfer**
1. **Subscription Plans → Create Plan**: their limits and price, **Private to one organization** = their org, not on sale.
2. **Organization → Invoices → Issue invoice**: How will they pay = Bank transfer, Plan = their private plan, cycle = Contract with its own end date, Access until = contract end, due in 15 or 30 days, access **Now, before payment** if they're trusted.
3. **Subscription → Access and contract**: contract dates, PO number, and grace days (e.g. 30).
4. When the money arrives: **Record payment** with the UTR and any TDS.

**Give a school a free pilot**
Issue invoice → **Complimentary**, grant the plan, Access until = pilot end. Super admin only. Excluded from revenue.

**A customer wants to downgrade**
They can do it themselves at checkout, and it's scheduled for their period end. Or: **Change plan → At the period end**. To undo: **Cancel change** on the plan card.

**A customer paid late by bank**
**Record payment** on the overdue invoice. A renewal continues from the old end date, so nobody gains free days by paying late.

**Give a customer a few more days**
**Access and contract → Paid until**: move it forward. Reason goes in the audit log.

**Refund a customer**
Invoice → **Refund or credit note** → Refund through Razorpay. Tick **End their access now** if they're leaving.

**Cancel an invoice issued by mistake**
Unpaid: **Credit note** for the full amount (no refund). It closes as cancelled by credit note, which keeps the tax records right. **Void invoice** is for documents that should never have existed; ask the CA which applies.

**Raise the price of a plan for everyone**
Create the new plan version, then **Move subscribers** from the old one, **At each one's renewal**. Deactivate the old plan.

**Let one org go over its limit for an event**
**Add Custom Override** with an **Expires At** date. For a paid event, use an Event Pass booking instead.

---

## 17. Troubleshooting

| Symptom | Check |
|---|---|
| "Billing is unavailable" on the customer's Billing page, or checkout fails at once | `BILLING_HANDOFF_SECRET` must be set to the same value (16+ characters) on the main app and ops |
| Issuing an invoice is refused | Billing Settings not filled in |
| Owner doesn't see **Turn on automatic renewal** | `auto_debit` and `razorpay_gateway_active` on (Feature Flags)? Plan is self-serve, monthly or 6-month, and paid online? |
| A Razorpay payment isn't showing | Razorpay webhook events enabled for the ops webhook URL. The hourly job also catches missed auto-debit charges |
| Limits aren't blocking anything | `plan_enforcement` is off. Rows are logged as `WOULD_BLOCK` |
| Customer is blocked but says they paid | Find the invoice. If paid by bank, record it. If paid online, check Payments for the Razorpay payment and the webhook status |
| A pending downgrade didn't happen | Applied by the hourly job. Auto-debit orgs wait up to a day for Razorpay's charge |
| An email didn't arrive | **Messaging**, filter by recipient. Retry, or fix the address |
