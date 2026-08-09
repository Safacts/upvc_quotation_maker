Full Supabase backup
Generated: 2026-08-08T19-51-37-753Z
Tenant: effxrwrbsjduvhmorvrq
Host: aws-1-ap-south-1.pooler.supabase.com

Contains:
  schema.sql   - All DDL: tables (with PKs, FKs, unique, check constraints), indexes, sequences, views, functions, RLS policies, grants
  *.json       - Data for each table (one file per table)
  restore.js   - Node.js restore script

Restore:
  node restore.js "C:\Users\aadi\AppData\Local\Temp\opencode\db-backups-full\2026-08-08T19-51-37-753Z"

Tables backed up: admins, audit_logs, clients, customers, gst_invoice_counters, gst_invoice_items, gst_invoices, measured_items, products, quotation_counters, quotations, sent_emails, service_reviews, signup_requests, unmeasured_items, vitharn_invoice_counters, vitharn_invoice_items, vitharn_invoices
