# Venkateshwara UPVC — Complete Business Application

## Project Overview & User Manual

---

**Prepared for:** Client Review  
**Application:** UPVC Quotation Maker  
**Platforms:** Android | Windows | Web | iOS | macOS | Linux  
**Date:** June 2026

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Complete Feature List](#2-complete-feature-list)
3. [Technology Stack & Why](#3-technology-stack--why)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [User Manual — Step by Step](#6-user-manual--step-by-step)
7. [Security & Data Handling](#7-security--data-handling)
8. [Maintenance & Support](#8-maintenance--support)

---

## 1. Application Overview

### What This App Does

The **Venkateshwara UPVC Quotation Maker** is a full-stack cross-platform business application that digitizes the entire quotation workflow for a UPVC windows and doors business. It replaces manual paper-based quotation creation with a digital system that handles:

- Customer data management with intelligent autocomplete
- Precise measurement calculations (MM to Square Feet)
- Automatic price computation with GST
- Professional PDF generation with company branding
- Email delivery of quotations to customers
- Cloud database storage with auto-save
- Business analytics and reporting

### Who It Serves

This application serves the complete workflow of a fabrication/installation business — from the first customer call, through site measurement, quotation generation, client approval, and final installation billing.

---

## 2. Complete Feature List

### 2.1 Authentication & Security

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Login System** | Email + hashed password authentication against cloud database | Medium |
| **Session Persistence** | Encrypted local storage remembers login across app restarts | High |
| **Forgot Password** | 6-digit OTP sent via email (Brevo SMTP), secure password reset flow | High |
| **Secure Storage** | All credentials stored using platform-level encryption (Android Keystore / Windows Credential Manager) | High |

### 2.2 Quotation Management

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Auto Quote Numbering** | Database-driven sequential numbering via Supabase RPC, with offline fallback | High |
| **Customer Autocomplete** | Smart search that loads past customer data and auto-fills address, contact, email on selection | Medium |
| **Measured Items** | Add items with width/height in MM, auto-calculates square footage, units, and rate | Medium |
| **Unmeasured Items** | Flat-rate items with description, units, and rate (no measurements needed) | Low |
| **Real-time Computation** | Instant subtotal, transport, GST (configurable %), and grand total calculation | Medium |
| **Amount in Words** | Converts any rupee amount to English words (supports Crore, Lakh, Thousand, Paise) | High |

The amount-in-words converter handles the Indian numbering system (Crore, Lakh, Thousand) with proper hyphenation, "and" for paise, and uppercase formatting — a non-trivial piece of business logic spanning ~60 lines.

### 2.3 PDF Generation

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Professional Layout** | Full A4 PDF with company logo, header, footer, and watermarked branding | High |
| **Itemized Tables** | Dynamic tables for measured and unmeasured items with auto-columns | High |
| **Terms & Conditions** | Configurable terms pulled from app settings | Medium |
| **Bank Details** | Company bank information printed on every quotation | Low |
| **GST Breakdown** | Itemized tax computation printed when applicable | Medium |

The PDF layout engine handles dynamic page overflow, table headers that repeat across pages, and precise positioning of stamps and signatures — this is custom layout code, not a template generator.

### 2.4 Email Integration

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Auto Email** | Sends quotation PDF to customer email with professional HTML template | High |
| **Inline Logo** | Company logo embedded in email body (CID attachment) | Medium |
| **Manual Email** | Send to any email address via dialog prompt | Low |
| **Email Tracking** | Sent emails logged in database for record-keeping | Medium |

SMTP integration required configuring Brevo's relay service with TLS, MIME attachments (both inline images and file attachments), and HTML email templates with responsive design.

### 2.5 Dashboard

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Quotation List** | All quotations fetched from cloud, sorted by date | Low |
| **Search** | Real-time search by customer name or quote number | Medium |
| **Filters** | Sort by newest, oldest, highest amount, lowest amount | Low |
| **Pull to Refresh** | Swipe-down refresh on mobile | Low |
| **Quick Actions** | New quotation, send email, analytics from side drawer | Low |

### 2.6 Settings & Configuration

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Company Details** | Name, address, contact, email — all editable | Low |
| **Bank Details** | Bank name, branch, account number, IFSC code | Low |
| **Tax Settings** | Default GST percentage, editable per quotation | Low |
| **Terms & Conditions** | 9 configurable terms for quotation footer | Low |
| **Proprietor Info** | Proprietor name and GST number for invoicing | Low |
| **Theme Toggle** | Dark/light mode with persistent preference | Low |

Settings are synced between local storage (SharedPreferences) and displayed throughout the app — changes take effect immediately on all screens.

### 2.7 Analytics

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Revenue Tracking** | Total quotation value, pending amounts | Medium |
| **Customer Insights** | Top customers by volume/value | Medium |
| **Visual Charts** | Color-coded analytics dashboard | Medium |

### 2.8 UI/UX

| Feature | Description | Technical Complexity |
|---------|-------------|---------------------|
| **Material Design 3** | Modern UI with dynamic theming | Low |
| **Animated Transitions** | Smooth animations on every screen (fade, slide, scale) | Medium |
| **Glassmorphism** | Semi-transparent cards with blur effects | Medium |
| **Google Fonts** | Custom 'Outfit' typography throughout | Low |
| **Dark Mode** | Complete dark theme with 30+ color overrides | Medium |
| **Responsive Layout** | Adapts to phones, tablets, and desktop | Medium |
| **Keyboard Navigation** | Tab/Enter/Next support across all form fields | Medium |

### 2.9 Platform Coverage

| Platform | Status | Notes |
|----------|--------|-------|
| **Android** | ✅ Fully supported | APK built and distributed via GitHub Actions |
| **Windows** | ✅ Fully supported | Native Windows application |
| **Web** | ✅ Fully supported | Deployable via Vercel or any static host |
| **iOS** | ✅ Supported | Requires Apple Developer account for deployment |
| **macOS** | ✅ Supported | Desktop experience for Mac users |
| **Linux** | ✅ Supported | Snap/Flatpak distribution possible |

---

## 3. Technology Stack & Why

### Frontend
```
Framework:    Flutter 3.29.3
Language:     Dart 3.7.2
State Mgmt:   Provider (ChangeNotifier)
```

**Why Flutter?** Single codebase for 6 platforms. Hot reload for rapid development. Rich widget library for complex UIs.

### Backend / Database
```
Database:     Supabase (PostgreSQL)
Auth:         Custom auth with SHA-256 hashing
Storage:      Supabase Storage (APK distribution)
```

**Why Supabase?** Provides database, authentication, and file storage in one service. PostgreSQL is robust and scalable. No server management needed.

### Cloud Services
```
Email:        Brevo SMTP Relay
Hosting:      Vercel (Web) + GitHub Actions (CI/CD)
Notifications: flutter_local_notifications + permission_handler
```

### Key Packages (37 dependencies)
| Package | Purpose | 
|---------|---------|
| `supabase_flutter` | Cloud database and API |
| `pdf` + `printing` | Professional PDF generation |
| `mailer` | SMTP email integration |
| `google_fonts` | Custom typography |
| `flutter_secure_storage` | Encrypted credential storage |
| `shared_preferences` | Local settings persistence |
| `provider` | State management |
| `flutter_animate` | UI animations |
| `intl` | Date and number formatting |
| `share_plus` | Share PDFs to other apps |
| `flutter_dotenv` | Environment configuration |
| `crypto` | Password hashing |
| `flutter_local_notifications` | Local push notifications |
| `permission_handler` | Runtime permission requests |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Android  │  │ Windows  │  │   Web    │  │  iOS/mac │        │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘        │
│        │              │              │              │            │
│  ┌─────┴──────────────┴──────────────┴──────────────┴─────┐      │
│  │                 FLUTTER APP (Single Codebase)           │      │
│  │  ┌─────────────┐ ┌──────────┐ ┌───────────────────┐   │      │
│  │  │  UI Layer    │ │  State   │ │  Service Layer    │   │      │
│  │  │  (Widgets)   │ │ (Provider)│ │ (API, PDF, Email) │   │      │
│  │  └─────────────┘ └──────────┘ └───────────────────┘   │      │
│  └────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLOUD LAYER (Supabase)                       │
│                                                                  │
│  ┌────────────────┐  ┌──────────────┐  ┌───────────────────┐    │
│  │  PostgreSQL DB  │  │  Auth System │  │  Storage (APKs)   │    │
│  │  - quotations  │  │  - admins   │  │  - app-releases   │    │
│  │  - measured_   │  │  (custom)   │  └───────────────────┘    │
│  │    items       │  └──────────────┘                           │
│  │  - unmeasured_ │                                            │
│  │    items       │                                            │
│  │  - sent_emails │                                            │
│  └────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CI/CD LAYER (GitHub Actions)                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Build APK   │→ │  Sign APK    │→ │  Release to GitHub   │   │
│  └──────────────┘  └──────────────┘  │  + Upload to Supabase│   │
│                                      └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Input → Form Validation → State Update (Provider)
    ↓
Auto-save (2s debounce) → Supabase API → PostgreSQL
    ↓
PDF Generation (on demand) → File System → Share/Save/Email
    ↓
Email → Brevo SMTP → Customer Inbox
```

---

## 5. Database Schema

The application uses **3 main tables** with relationships:

### Table: `admins`
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Unique identifier |
| email | TEXT | Admin login email |
| password_hash | TEXT | SHA-256 hashed password |

### Table: `quotations`
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Unique identifier |
| quote_no | TEXT | Sequential quote number |
| date | DATE | Quotation date |
| customer_name | TEXT | Customer name |
| reference | TEXT | Reference/project name |
| address | TEXT | Site address |
| contact_no | TEXT | Phone number |
| email | TEXT | Customer email |
| transport_cost | NUMERIC | Transport charges |
| include_gst | BOOLEAN | GST toggle |
| gst_percentage | NUMERIC | GST rate |
| created_at | TIMESTAMP | Auto-generated |

### Table: `measured_items`
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Unique identifier |
| quotation_id | UUID (FK) | Links to quotations |
| code | TEXT | Item code |
| description | TEXT | Item description |
| width | NUMERIC | Width in MM |
| height | NUMERIC | Height in MM |
| units | INTEGER | Quantity |
| glass | TEXT | Glass type |
| rate | NUMERIC | Rate per sq.ft. |

### Table: `unmeasured_items`
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Unique identifier |
| quotation_id | UUID (FK) | Links to quotations |
| description | TEXT | Item description |
| units | INTEGER | Quantity |
| rate | NUMERIC | Rate per unit |

### Table: `sent_emails`
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Unique identifier |
| recipient | TEXT | Email recipient |
| subject | TEXT | Email subject |
| body | TEXT | Email body |
| created_at | TIMESTAMP | Sent time |

### Stored Procedure: `get_next_quote_number()`
Database-level function that atomically increments and returns the next sequential quote number, ensuring no duplicates even with concurrent access.

---

## 6. User Manual — Step by Step

### 6.1 Getting Started

#### Login
1. Open the app on your device
2. Enter: **jvenkateshupvc@gmail.com**
3. Enter your password
4. Tap **Login** (or press Enter on keyboard)

> **First time?** Use the "Forgot Password?" link to set your password. An OTP will be sent to the registered email.

#### Dashboard Overview
After login, you'll see:
- **Top Cards:** "New Quotation" and "Send Email" quick actions
- **Search Bar:** Type customer name or quote number to find quotations
- **Filter Icon:** Sort by Newest, Oldest, Highest Amount, Lowest Amount
- **Quotation List:** All your quotations with customer name, quote number, amount, and date
- **Floating Action Button (+):** Quick way to create a new quotation
- **Side Menu (☰):** Navigate to all sections

### 6.2 Creating a New Quotation

1. Tap **"New Quotation"** (from dashboard card, menu, or + button)
2. The quote number and date are auto-generated
3. Fill in **Customer Details**:
   - **Name:** Start typing — the app will suggest past customers
   - **Select a suggestion** to auto-fill address, contact, and email
   - **Reference:** Project or reference name (optional)
   - **Address:** Site/installation address
   - **Contact No:** Customer phone number
   - **Email:** For sending quotation PDF

> **Tip:** Use Tab or Enter on keyboard to quickly move between fields

### 6.3 Adding Measured Items

For items with specific measurements (windows, doors):

1. Tap **"Add Measured Item"**
2. Fill in each field:
   - **Code:** Item identifier (e.g., W1, D2)
   - **Description:** What it is (e.g., "Sliding Window 4ft x 4ft")
   - **W (MM):** Width in millimeters
   - **H (MM):** Height in millimeters
   - **Units:** Quantity needed
   - **Glass:** Glass type (e.g., "5mm clear", "Double Glazed")
   - **Rate (Rs):** Rate per square foot
3. The app **automatically calculates**:
   - Square footage: `(W/304.8) × (H/304.8) × Units`
   - Total: `Sq.Ft. × Rate`

> To delete an item, tap the red delete icon next to its number.

### 6.4 Adding Unmeasured Items

For flat-rate items (hinges, handles, installation charges):

1. Tap **"Add Unmeasured Item"**
2. Fill in:
   - **Description:** What it is
   - **Units:** Quantity
   - **Rate (Rs):** Rate per unit
3. Total is auto-calculated: `Units × Rate`

### 6.5 Final Computations

- **Transport Cost:** Add delivery/transport charges if applicable
- **GST:** Check the box to enable GST, adjust percentage if needed
- The app shows:
  - Subtotal (actual amount)
  - Transport cost
  - IGST (if enabled)
  - **Grand Total** (highlighted)
  - **Amount in Words** (e.g., "TWENTY FIVE THOUSAND RUPEES ONLY")

### 6.6 Generating & Sending PDF

1. Tap the **"GENERATE PDF"** button
2. The app auto-saves the quotation to the cloud
3. If an email is saved, it sends the PDF automatically in the background
4. You'll see the **PDF Confirmation Screen** with options to:
   - **Open PDF** — View the generated quotation
   - **Share PDF** — Send via WhatsApp, email, or any app
   - **Send to Customer** — Email the PDF directly

The generated PDF includes:
- Company logo and letterhead
- Quote number, date, and validity
- Customer details
- Itemized table with measurements
- Terms and conditions
- Bank details for payment
- Proprietor signature and GST number

### 6.7 Managing Quotations

#### Edit a Quotation
1. On the dashboard, tap any quotation card
2. The quotation opens in edit mode
3. Make your changes (they auto-save after 2 seconds)
4. Regenerate PDF if needed

#### Search & Filter
- Type in the search bar to find by customer name or quote number
- Use the filter icon to sort by:
  - Newest First (default)
  - Oldest First
  - Highest Amount
  - Lowest Amount

#### Refresh
Tap the refresh icon on the dashboard toolbar to reload quotations from the cloud.

### 6.8 Settings

Access from the side menu → **Settings**

Customize your company information that appears on every quotation:
- **Company Name, Address, Contact, Email**
- **Proprietor Name, GST Number**
- **Bank Name, Branch, Account No, IFSC Code**
- **Terms & Conditions** (updatable text)
- **Default GST Percentage**
- **Dark Mode Toggle**

All changes save automatically and reflect immediately in new quotations.

### 6.9 Analytics

Access from the side menu → **Analytics**

View business insights including:
- Quotation value trends
- Customer purchase history
- Total revenue analysis

---

## 7. Security & Data Handling

| Concern | How It's Handled |
|---------|------------------|
| **Password Storage** | SHA-256 hashed — never stored in plain text |
| **Session Management** | Encrypted local storage via platform Keystore/Credential Manager |
| **API Keys** | Hardcoded anon key (Supabase RLS policies restrict access) |
| **SMTP Key** | Stored in `.env`, excluded from version control |
| **Data in Transit** | All Supabase traffic over HTTPS |
| **Database Access** | Row-Level Security (RLS) policies on all tables |
| **Input Validation** | Client-side sanitization and type checking |

### Row Level Security (RLS)

All database tables have RLS policies that restrict access:
- Only authenticated admins can read/write data
- No public access to any table
- Service role key (server-side only) can bypass RLS for automated operations

---

## 8. Maintenance & Support

### Deployment
- **Android APK** built via GitHub Actions workflow — automated builds on every push
- **Web version** deployable to Vercel/Netlify with one click
- **Windows/macOS/Linux** built locally for distribution

### Updates & Bug Fixes
- Bug fixes and feature additions are ongoing
- The codebase is modular and well-structured for future enhancements
- Potential future features:
  - Barcode/QR code scanning for inventory
  - Customer portal for quotation approval
  - Inventory management module
  - Payment tracking and invoicing
  - Multi-language support

### Technical Support
- Full source code available for auditing
- Architecture follows Flutter best practices
- All external services (Supabase, Brevo) have free tiers suitable for small business use

---

## Appendix: Code Complexity Metrics

| Component | Lines of Code | Complexity |
|-----------|--------------|------------|
| Main app & theme | ~200 | Setup & configuration |
| Login system | ~260 | Auth, OTP, session management |
| Dashboard | ~320 | Data fetching, search, filter, UI |
| Quotation screen | ~670 | Dynamic forms, calculations, auto-save |
| PDF generator | ~400 | Custom layout, tables, stamps |
| Email service | ~180 | SMTP, HTML templates, attachments |
| Settings | ~200 | 12 fields, persistence, validation |
| Models & database | ~200 | Data classes, serialization, queries |
| Notification service | ~80 | Cross-platform notifications |
| Analytics | ~100 | Data aggregation, charts |
| **Total** | **~2,610+** | **Full production application** |

---

> This document was generated to provide a complete understanding of the Venkateshwara UPVC Quotation Maker application — its features, architecture, and value. The application is a production-ready, cross-platform business tool built on modern technologies with proper security, error handling, and user experience design.
