# Invoices, Credit Notes, Billing Settings & Leads API Specification

Every amount an org owes is an **invoice** with a due date, and any kind of payment settles it: Razorpay checkout, a pay link, an auto-debit charge, a bank transfer we record, or a complimentary grant. Credit notes reduce an invoice and can carry a refund. Billing Settings hold the seller details printed on every document. Leads are "Talk to sales" requests.

**Last checked:** 2026-11-08 (`feature/subscriptions`).

---

## Documents and numbers

| Document | Number | When |
|---|---|---|
| Invoice | `INV/26-27/00001` | From the moment it's issued. A GST tax invoice. The number, issue date and total never change |
| Receipt | `REC/26-27/00001` | One per payment, showing the amount paid and the payment history |
| Credit note | `CN/26-27/00001` | Reduces one invoice, in full or in part |

- Prefixes come from Billing Settings, up to 4 characters each. The year is the Indian financial year, written short so a number stays within GST's 16-character limit.
- Each PDF is saved once (`billing_documents`), so ops, the owner and the email all get the same file. It's rebuilt only when the document changes: a void, a new due date, a new pay link or a voided payment.
- Ops amounts are rupees. `amount` fields on input are **before GST** unless stated otherwise.

## Roles

| Action | Super admin | Billing admin | Support |
|---|---|---|---|
| List invoices; download PDFs, receipts, proofs, credit notes; read settings | Yes | Yes | Yes |
| Issue an invoice, record a payment, `extend_due`, `create_link`, `resend` | Yes | Yes | No |
| Issue a `COMPLIMENTARY` invoice | Yes | No | No |
| `void`, `write_off`, void a payment | Yes | No | No |
| Credit notes and refunds | Yes | No | No |
| Save Billing Settings | Yes | No | No |
| List and update leads | Yes | Yes | Yes |

---

## Invoices

### 1. List invoices
`GET /api/v1/ops/invoices`

**Query:**

| Param | Notes |
|---|---|
| `organizationId` | one org's invoices |
| `status` | `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`, `WRITTEN_OFF` |
| `overdue` | `true`: open invoices past their due date |
| `page`, `limit` | default 1 and 25; `limit` is at most 100 |

**Response `data`:** `{ rows, total, page, limit }`.

Each row is an invoice with its `payments` (each with `proof.fileName` where one was uploaded) and its `creditNotes`. Key invoice fields:

- `invoiceNumber`, `description`, `organizationId`, `organizationName`, `planId`, `billingCycle`, `periodMonths`
- `subtotal`, `gstRate`, `cgstAmount`, `sgstAmount`, `igstAmount`, `total`
- `amountPaid`, `tdsAmount`, `creditedAmount`, `status`
- `dueAt`, `paidAt`, `periodStart`, `periodEnd`, `collectionMethod`, `accessMode`, `accessGrantedAt`
- `razorpayLinkId`, `razorpayLinkUrl`, `razorpayLinkStatus`, `aiCredits`
- `buyer` and `seller` snapshots, `closedReason`, `createdAt`

The amount still due is `total − amountPaid − tdsAmount − creditedAmount`.

---

### 2. Issue an invoice (payment request)
`POST /api/v1/ops/organizations/[orgId]/invoices`

**Body:**

| Field | Type | Notes |
|---|---|---|
| `description` | string, 1–500 | Printed as the item line |
| `collectionMethod` | `PAY_ONLINE` \| `OFFLINE` \| `COMPLIMENTARY` | Online creates a Razorpay pay link. Offline means bank transfer or cheque, recorded by ops. Complimentary is **super admin only** |
| `amount` | number ≥ 0 | Before GST. Must be > 0, except `COMPLIMENTARY` which must be 0 |
| `gstRate` | 0–100 | default 18. CGST and SGST, or IGST, follow the seller's and buyer's states |
| `dueInDays` | int 0–365 | |
| `accessMode` | `ACCESS_NOW` \| `ON_PAYMENT` | `ACCESS_NOW`: the plan applies now; if unpaid by due date + grace, the org is restricted automatically. `ON_PAYMENT`: nothing changes until it's paid in full |
| `planId` | string | Optional. Leave it out for an instalment or an extra charge on the current plan. Required for `COMPLIMENTARY` |
| `billingCycle` | `MONTHLY` \| `HALF_YEARLY` \| `ANNUAL` \| `CUSTOM` | Required with `planId`. `CUSTOM` is a contract with its own end date |
| `periodEnd` | ISO datetime | Required for `CUSTOM` and `COMPLIMENTARY` |

**Response `data`:** `{ invoice, linkError }`. The owner is emailed the invoice. For an online invoice the email's button opens their Billing page, where they pay. The email never carries a Razorpay link or bank details: someone paying by direct transfer is told to contact us. `linkError` is set when the invoice was issued but Razorpay didn't create a link; retry with `create_link`.

**Errors:**
- `400`: validation, or the end date isn't after the start date.
- `404`: org not found, or plan not found or inactive.
- `409`: Billing Settings not filled in, or the plan is private to another org.

How an invoice is paid:
- **Online:** through `payment_link.*` webhooks (see `billing-portal-api.md` §11).
- **Offline:** recorded with §3.
- **Checkout and auto-debit:** these payments create and settle their own invoices.

When it's fully paid:
- a plan on the invoice is applied (renewals continue from the old end date);
- any `aiCredits` become an `AiCreditTopUp` valid for 12 months;
- a receipt is issued and emailed.

---

### 3. Record an offline payment
`POST /api/v1/ops/invoices/[id]/payments`

**Body:**

| Field | Type | Notes |
|---|---|---|
| `amount` | number ≥ 0 | Cash received, including GST |
| `tdsAmount` | number ≥ 0 | default 0. TDS the customer deducted; it counts towards the total |
| `receivedAt` | ISO datetime | Can't be in the future |
| `source` | `BANK_TRANSFER` \| `CHEQUE` \| `UPI_DIRECT` \| `OTHER` | |
| `reference` | string, 1–100 | UTR or cheque number. A reference already used for the same org is refused |
| `notes` | string ≤ 1000 | optional |
| `proof` | `{ fileName, contentType: application/pdf \| image/png \| image/jpeg, base64 }` | optional, up to 5 MB |

`amount + tdsAmount` must be above 0. Part payments are allowed: the invoice becomes `PARTIALLY_PAID`, then `PAID` once cash plus TDS covers what's due. Every recorded payment gets a receipt and is marked as recorded manually.

**Errors:** `400` (more than is still due; future date) · `404` · `409` (invoice not open; duplicate reference; Billing Settings missing).

---

### 4. Void a payment
`DELETE /api/v1/ops/invoices/[id]/payments/[paymentId]` (**super admin**)

**Body:** `{ "reason": string }`

For a bounced cheque or a wrong entry. The payment stays on the record, crossed out, and the invoice goes back to unpaid or part paid. Receipts are rebuilt.

A Razorpay payment can't be voided; refund it with a credit note instead (`409`).

---

### 5. Act on an invoice
`POST /api/v1/ops/invoices/[id]`

**Body:** one of

| `action` | Extra fields | Who | Effect |
|---|---|---|---|
| `create_link` | — | Billing | Creates a Razorpay pay link for an open invoice. The link expires on the due date; for an overdue invoice it expires 7 days from now and the due date stays as it was |
| `resend` | — | Billing | Emails the open invoice to the owner again |
| `extend_due` | `dueAt`, `reason` | Billing | New due date (in the future). Extends the link and rebuilds the PDF |
| `write_off` | `reason` | Super | Gives up on what's still owed. Status `WRITTEN_OFF` |
| `void` | `reason` | Super | Cancels an invoice issued by mistake. Status `VOID`. Payments must be voided first. Doesn't undo a plan change it already applied |

**Response:** the updated invoice.
**Errors:** `409` ("Only an unpaid invoice can …", "Void its payments first.", link errors) · `400`.

For a tax invoice that won't be paid, a full **credit note** (§8) is usually the right record. Ask the CA when to void instead.

---

### 6. Documents
| Endpoint | Returns |
|---|---|
| `GET /api/v1/ops/invoices/[id]/document` | Invoice PDF |
| `GET /api/v1/ops/invoices/[id]/payments/[paymentId]/receipt` | Receipt PDF (`404` if the payment has no receipt number) |
| `GET /api/v1/ops/invoices/[id]/payments/[paymentId]` | The uploaded proof file (`404` if none). Served as an attachment with `nosniff` |
| `GET /api/v1/ops/invoices/[id]/credit-notes/[creditNoteId]` | Credit note PDF |

All need an ops session and return `Cache-Control: private, no-store`.

---

## Credit notes and refunds

### 7. How a credit note works
- It offsets one invoice and never changes the invoice itself. `Invoice.creditedAmount` goes up.
- **GST** is split in the same proportion as the invoice (`splitCredit` in `invoice-math.ts`).
- An **unpaid** invoice credited in full becomes `VOID` with `closedReason` "Cancelled by credit note CN/…".
- A payment refunded in full becomes `REFUNDED`.
- The PDF is saved as kind `CREDIT_NOTE` and emailed to the owner as an attachment (`CREDIT_NOTE_ISSUED`). It's listed on the invoice in ops and on the owner's Billing page.

### 8. Issue a credit note
`POST /api/v1/ops/invoices/[id]/credit-notes` (**super admin**)

**Body:**

| Field | Type | Notes |
|---|---|---|
| `amount` | number > 0 | Including GST. At most what's still creditable on the invoice |
| `reason` | string, 3–500 | Printed on the credit note |
| `refundMethod` | `RAZORPAY` \| `BANK_TRANSFER` \| `NONE` | `NONE` only lowers what's owed |
| `paymentId` | string | Required for a refund: the payment to refund. The amount can't be more than that payment has left |
| `refundReference` | string ≤ 100 | Required for `BANK_TRANSFER`: the UTR of our transfer |
| `endAccess` | boolean | default false. Stops any auto-debit and moves the org to Free. Data is kept |

How each refund method works:
- **`RAZORPAY`:** calls Razorpay's refund API on the original payment (`POST payments/:id/refund`). Without Razorpay keys (local dev), a fake `rfnd_test_…` id is stored instead.
- **`BANK_TRANSFER`:** records our transfer.
- **`NONE`:** no money moves.

**Response `data`:** the credit note `{ id, number, invoiceId, organizationId, paymentId, subtotal, cgstAmount, sgstAmount, igstAmount, total, reason, refundMethod, refundReference, razorpayRefundId, endedAccess, createdById, createdAt }`, with the message `Credit note CN/… issued.`

**Errors:**
- `400`: zero amount; more than creditable or refundable; no payment picked; a Razorpay refund on a non-Razorpay payment; a bank transfer without a reference.
- `403`: not a super admin.
- `404`: invoice not found.
- `409`: invoice void or written off; Billing Settings missing; Razorpay not configured (refund by bank transfer instead).

---

## Billing Settings

### 9. Get settings
`GET /api/v1/ops/billing/settings`

Returns the settings object, or `null` until a super admin saves them. **Invoices are refused until then.**

### 10. Save settings
`PUT /api/v1/ops/billing/settings` (**super admin**)

| Field | Required | Notes |
|---|---|---|
| `legalName` | yes | Company name, top of every document |
| `gstin` | yes | 15 letters and digits |
| `address`, `state` | yes | `state` decides CGST and SGST, or IGST |
| `sacCode` | no | ≤ 10 characters. Have the CA confirm it |
| `email`, `phone` | no | |
| `bankName`, `accountName`, `accountNumber`, `ifsc`, `upiId` | no | Printed for customers paying by transfer |
| `invoicePrefix`, `receiptPrefix` | yes | 1–4 of A–Z, 0–9, `-` |
| `creditNotePrefix` | yes | Same rule, default `CN` |

Changes apply to new documents only. Documents already issued keep the details they went out with.

---

## Leads

### 11. List leads
`GET /api/v1/ops/leads?status=NEW&page=1`

`status` is `NEW`, `CONTACTED`, `WON` or `LOST`. 25 per page.
**Response `data`:** `{ rows, total }`. Each lead has `{ id, organizationId, name, email, phone, organization, message, learners, source, status, notes, createdAt, updatedAt }`.

### 12. Update a lead
`PATCH /api/v1/ops/leads/[id]`

**Body:** `{ "status"?: "NEW" | "CONTACTED" | "WON" | "LOST", "notes"?: string ≤ 5000 }`

Leads are created by the main app through `POST /api/v1/billing-portal/leads` (see `billing-portal-api.md` §9).
