# Bhanu Visuals — Website + Admin Studio

## Public website
- Minimal cinematic black/gold home.
- Services, dynamic Projects, Contact enquiry.
- Custom Package only; no fixed packages.
- Custom services unlock after client details are complete.
- Every enquiry creates/reuses a permanent Customer ID (`BV-C-0001`) and creates a Booking ID (`BV-B-2026-0001`).
- Enquiry PDF is generated automatically; studio email delivery works when SMTP is configured.

## Admin Panel
Open `/admin`.

Demo login:
- Username: `Bhanuvisuals`
- Password: `123456`

Change these before production deployment.

### CRM
- Customers: search by Customer ID, name, phone or email.
- Open a customer to see contact details, enquiry history, shoots, invoices and payments.
- Customer ID is permanent and is used across future work.

### Enquiries / bookings
- Each enquiry shows Customer ID + Booking ID.
- **Open Booking** opens a booking detail view with client, project, status, date/location, services and linked invoices.
- The Booking ID is also clickable from customer history.
- Status can be updated from New Enquiry → Contacted → Confirmed → Cancelled → Completed.

### Shoots
- Selecting a customer automatically fills the Booking ID from that client's latest enquiry.
- Booking ID is read-only so it cannot accidentally be mistyped.

### Invoices & Billing
- Create Advance, Partial Payment, Final Payment or Full Payment invoices.
- Selecting a customer automatically fills the Booking ID from that client's latest enquiry.
- Booking ID is read-only; no manual typing is required.
- Invoice PDFs include Customer ID, Booking ID, client details, shoot information, totals, paid/balance values and UPI QR when configured.
- Download invoice PDF.
- Email invoice PDF directly to the client after SMTP is configured.
- WhatsApp invoice PDF endpoint is ready for official WhatsApp Cloud API credentials.

### Settings
- Business details and UPI ID.
- Saving the UPI ID makes new invoice PDFs include a scannable UPI payment QR for the amount due.

## Local setup
From the project root:

```powershell
npm install
cd client
npm install
cd ..
cd server
npm install
cd ..
```

Create `server/.env` from `.env.example`.

### Email setup (required for automatic PDF email)
The app cannot send email with only the studio email address. Gmail requires an **App Password** when SMTP is used.

Set:

```env
SMTP_USER=bhanuvisuals17@gmail.com
SMTP_PASS=YOUR_GMAIL_APP_PASSWORD
MAIL_TO=bhanuvisuals17@gmail.com
```

Do not use the normal Gmail account password. Create a Gmail App Password after enabling 2-Step Verification. Restart the server after changing `.env`.

If SMTP is not configured, invoice email will show a clear configuration error instead of silently reporting success.

## Run

```powershell
npm run dev
```

Website: `http://localhost:5173/` (or the Vite port shown in the terminal)
Admin: `http://localhost:5173/admin`
API: `http://localhost:4000/`

## Billing
Enter the real Bhanu Visuals UPI ID under Admin → Settings. Invoice PDFs then contain a UPI QR generated for the invoice amount due. Do not store UPI PIN/OTP/card passwords in this app.

## WhatsApp
The WhatsApp PDF delivery endpoint is implemented but remains disabled until official WhatsApp Business/Cloud API credentials are configured. WhatsApp Business policies may also require approved templates for business-initiated messages outside the customer-service window.

Never commit `server/.env` or share passwords/tokens.
