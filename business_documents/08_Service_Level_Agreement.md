<div align="center">

# 🟧 VITHARN ERP SERVICES
### SERVICE LEVEL AGREEMENT (SLA)

*Defining support, uptime, and service commitments for each pricing tier.*

</div>

---

**Effective Date:** `[DD-MMM-YYYY]`
**Applicable To:** All active Vitharn ERP Services clients
**Governing Document:** Vitharn ERP Services — Client Services Agreement (01_Client_Contract.md)

---

## 1. PURPOSE & SCOPE

This Service Level Agreement ("SLA") defines the service levels, support commitments, and performance guarantees provided by **Vitharn ERP Services** to its clients. It supplements the Client Services Agreement and applies to all five pricing tiers: **Low, Base, Next, Next+, and Final**.

This SLA is **tier-specific** — service levels vary based on the client's selected pricing tier. Higher tiers receive priority support, faster response times, and additional service guarantees.

---

## 2. SUPPORT CHANNELS & RESPONSE TIMES

### 2.1 Support Channels by Tier

| Channel | Low | Base | Next | Next+ | Final |
|---------|:---:|:----:|:----:|:-----:|:-----:|
| Email (`vitarn.dev@gmail.com`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| WhatsApp support | ❌ | ❌ | ❌ | ✅ | ✅ |
| Priority escalation | ❌ | ❌ | ❌ | ✅ | ✅ |
| Dedicated account manager | ❌ | ❌ | ❌ | ❌ | ✅ |

### 2.2 Response Time Commitments

| Priority | Description | Low | Base | Next | Next+ | Final |
|----------|-------------|:---:|:----:|:----:|:-----:|:-----:|
| **P1 — Critical** | Complete service outage, data loss risk, security breach | 48 hrs | 24 hrs | 12 hrs | 4 hrs | **2 hrs** |
| **P2 — High** | Major feature broken, quotation generation failing | 72 hrs | 48 hrs | 24 hrs | 8 hrs | **4 hrs** |
| **P3 — Medium** | Partial feature issue, performance degradation | 5 days | 3 days | 48 hrs | 24 hrs | **12 hrs** |
| **P4 — Low** | General inquiry, cosmetic issue, feature request | 7 days | 5 days | 3 days | 48 hrs | **24 hrs** |

**Note:** Response times are measured during **Indian business hours** (Monday–Saturday, 9:00 AM – 8:00 PM IST, excluding public holidays).

---

## 3. SERVICE AVAILABILITY & UPTIME

### 3.1 Infrastructure Uptime

| Component | Low | Base | Next | Next+ | Final |
|-----------|:---:|:----:|:----:|:-----:|:-----:|
| **Application uptime target** | N/A (offline) | 99.0% | 99.5% | 99.5% | **99.9%** |
| **Scheduled maintenance window** | N/A | Monthly, 4 hrs max | Monthly, 2 hrs max | Monthly, 2 hrs max | **Quarterly, 1 hr max** |
| **Maintenance notice** | N/A | 24 hrs | 48 hrs | 48 hrs | **72 hrs** |
| **Incident status page** | ❌ | ❌ | ❌ | ✅ | ✅ |

### 3.2 Scheduled Maintenance

- Maintenance windows are scheduled during **low-traffic hours** (typically 2:00 AM – 6:00 AM IST).
- Clients will receive advance notice via email as specified above.
- Emergency maintenance for critical security patches may occur outside scheduled windows with **best-effort notification**.
- **Low tier clients** have no uptime commitment as the application runs offline on the client's device.

---

## 4. DATA BACKUP & RECOVERY

### 4.1 Backup Frequency

| Tier | Backup Frequency | Retention | Recovery Point Objective (RPO) |
|------|------------------|-----------|-------------------------------|
| **Low** | None (client responsibility) | N/A | N/A |
| **Base** | Daily automated backup | 7 days | 24 hours |
| **Next** | Daily automated backup | 14 days | 24 hours |
| **Next+** | Daily automated backup | 30 days | 24 hours |
| **Final** | Daily automated backup + on-demand | 30 days | 12 hours |

### 4.2 Recovery Time Objective (RTO)

| Tier | Estimated Recovery Time |
|------|------------------------|
| **Low** | N/A (client-managed) |
| **Base** | 4–8 hours |
| **Next** | 2–4 hours |
| **Next+** | 1–2 hours |
| **Final** | 30 min – 1 hour |

### 4.3 Data Export

- All tiers with cloud sync (Base and above) support **one-click data export** in CSV format.
- **Tally XML export** is available for Final tier clients.
- **XLSX export** is available for Base tier and above.
- Data export is available **at any time** without requesting support.
- Upon termination, a complete data export is provided per §2.7 of the Client Services Agreement.

---

## 5. SOFTWARE UPDATES & MAINTENANCE

### 5.1 Update Eligibility

| Tier | Update Window | What's Covered |
|------|---------------|----------------|
| **Low** | No updates (offline app) | None — client uses version at install time |
| **Base** | Free updates for 1 year | Bug fixes, security patches, minor improvements |
| **Next** | Free updates for 1 year | Bug fixes, security patches, minor improvements, feature additions |
| **Next+** | Free updates for 1 year | Bug fixes, security patches, feature additions, priority access to new features |
| **Final** | Free updates for 1 year | All of Next+ + early access to beta features, dedicated changelog |

### 5.2 Post-Warranty Updates

After the initial 1-year free update period:
- Optional continued updates: **₹5,000/year** (all tiers except Low).
- Updates include bug fixes, security patches, and compatibility updates.
- **New features** may require upgrade to a higher tier.
- Low tier clients who wish to receive updates must upgrade to Base or above.

---

## 6. PERFORMANCE STANDARDS

### 6.1 Application Performance

| Metric | Base/Next | Next+/Final |
|--------|-----------|-------------|
| Page load time (dashboard) | < 3 seconds | < 2 seconds |
| Quotation generation | < 5 seconds | < 3 seconds |
| PDF generation | < 10 seconds | < 5 seconds |
| Search response | < 2 seconds | < 1 second |

### 6.2 Scalability

| Tier | Max Quotations/Month | Max Customers | Max Products |
|------|---------------------|---------------|--------------|
| **Low** | Unlimited (local only) | Unlimited (local only) | Unlimited (local only) |
| **Base** | 50 | 200 | 100 |
| **Next** | 200 | 500 | 250 |
| **Next+** | 500 | 1,000 | 500 |
| **Final** | Unlimited | Unlimited | Unlimited |

**Note:** Exceeding monthly quotation limits may result in throttling or require a tier upgrade.

---

## 7. COMMUNICATION & REPORTING

### 7.1 Proactive Communication

| Communication | Low | Base | Next | Next+ | Final |
|---------------|:---:|:----:|:----:|:-----:|:-----:|
| Monthly service report | ❌ | ❌ | ❌ | ✅ | ✅ |
| Security advisory notifications | ❌ | ✅ | ✅ | ✅ | ✅ |
| Feature release announcements | ❌ | ✅ | ✅ | ✅ | ✅ |
| Dedicated account review | ❌ | ❌ | ❌ | ❌ | ✅ |
| Quarterly business review | ❌ | ❌ | ❌ | ❌ | ✅ |

### 7.2 Incident Communication

- **P1 (Critical) incidents:** Notification within 1 hour of detection for Final/Next+ clients; 4 hours for Next; 12 hours for Base.
- **Incident updates:** Every 2 hours for P1; every 4 hours for P2.
- **Post-incident report:** Within 48 hours of resolution for Final/Next+ clients; 7 days for all other tiers.

---

## 8. EXCLUSIONS & LIMITATIONS

### 8.1 What This SLA Does NOT Cover

This SLA does not apply to:
1. **Low tier clients** — as the application runs offline, no uptime or support guarantees apply (except email support for onboarding queries within 7 days of purchase).
2. **Scheduled maintenance windows** — downtime during announced maintenance is not counted against uptime.
3. **Client-caused issues** — including but not limited to: incorrect data entry, unauthorised modifications, third-party integrations not provided by Vitharn.
4. **Force Majeure events** — including natural disasters, internet backbone outages, government actions, or third-party service failures (Supabase, Vercel, Brevo, etc.).
5. **Third-party services** — including Tally software, WhatsApp, email clients, web browsers, and Android OS updates that may affect functionality.

### 8.2 Service Credits

Vitharn ERP Services does **not** offer financial service credits for downtime. This is a **bootstrapped, one-person operation** and service credits are not feasible. Instead, Vitharn commits to:

- Transparent communication about any issues.
- Best-effort resolution within the response times specified above.
- Priority handling for Final and Next+ tier clients.

---

## 9. CLIENT RESPONSIBILITIES

To receive the service levels described in this SLA, the Client must:

1. **Use supported platforms:** Vitharn supports the latest two major versions of Android, Chrome, Firefox, Safari, and Edge.
2. **Maintain accurate contact information:** Ensure email and phone number are current for support communications.
3. **Report issues promptly:** Report bugs or issues as soon as they are discovered, with screenshots and steps to reproduce.
4. **Export data regularly:** Base tier and above clients should export data at least monthly as a safety net.
5. **Not exceed fair-use limits:** Abide by the monthly quotation limits for their tier.

---

## 10. SLA REVIEW & UPDATES

- This SLA is reviewed **quarterly** and may be updated to reflect infrastructure improvements or changes in service offerings.
- Material changes will be communicated to clients via email with **30 days' notice**.
- Continued use of Vitharn services after an SLA update constitutes acceptance of the revised terms.

---

## 11. CONTACT FOR SLA QUERIES

| Inquiry Type | Contact Method | Expected Response |
|--------------|----------------|-------------------|
| General SLA questions | Email to `vitarn.dev@gmail.com` | Per response times above |
| Escalation request | WhatsApp (Final/Next+ only) | Per response times above |
| Service report request | Email to `vitarn.dev@gmail.com` | 5 business days |

---

<br>

<div align="center">

**Vitharn ERP Services | Hyderabad, Telangana | vitarn.dev@gmail.com**

*This SLA is effective from `[DD-MMM-YYYY]` and supplements the Vitharn Client Services Agreement.*

</div>
