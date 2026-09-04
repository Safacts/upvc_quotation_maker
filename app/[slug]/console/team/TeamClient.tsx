"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Shield, Mail } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatDate } from "@/lib/console-format";
import { validateEmail, validatePhone, sanitizePhoneInput } from "@/lib/console-validators";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "owner" | "manager" | "accountant" | "salesperson";
  phone: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

const ROLE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  owner: { bg: "rgba(239, 68, 68, 0.15)", color: "#ef4444", label: "Owner (Super Admin)" },
  manager: { bg: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6", label: "Factory Manager" },
  salesperson: { bg: "rgba(16, 185, 129, 0.15)", color: "#10b981", label: "Sales & Estimation" },
  accountant: { bg: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", label: "Accountant" },
};

export default function TeamClient() {
  const { toast } = useConsole();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Invite Form
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"owner" | "manager" | "accountant" | "salesperson">("salesperson");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/console/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setRows(data.users || []);
    } catch (err: any) {
      toast(err?.message || "Failed to load team", "err");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useConsoleStatus({
    count: `${rows.length} team members`,
    hints: [{ keys: "F1 / Alt+N", label: "Invite Member" }],
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    if (!fullName.trim()) {
      setFieldErrors((f) => ({ ...f, fullName: "Full name is required" }));
      toast("Please enter full name", "err");
      return;
    }
    const emailErr = validateEmail(email, true);
    if (emailErr) {
      setFieldErrors((f) => ({ ...f, email: emailErr }));
      toast(emailErr, "err");
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setFieldErrors((f) => ({ ...f, phone: phoneErr }));
      toast(phoneErr, "err");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/console/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          role,
          phone: phone.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || "Failed to invite member");
      }

      toast("Team member invited successfully", "ok");
      setModalOpen(false);
      setEmail("");
      setFullName("");
      setPhone("");
      setFieldErrors({});
      void loadData();
    } catch (err: any) {
      toast(err?.message || "Failed to invite member", "err");
    } finally {
      setSaving(false);
    }
  };

  const onNewAction = useCallback(() => setModalOpen(true), []);
  useConsoleAction("new", onNewAction);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (r.role || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name & Contact",
        size: 240,
        cell: (c) => (
          <div>
            <div style={{ fontWeight: 600, color: "var(--vc-text-hi)" }}>{String(c.getValue() || "Staff Member")}</div>
            <div style={{ fontSize: "12px", color: "var(--vc-text-sub)", display: "flex", alignItems: "center", gap: "4px" }}>
              <Mail size={11} /> {c.row.original.email}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: "Role / Permissions",
        size: 200,
        cell: (c) => {
          const r = String(c.getValue() || "salesperson");
          const conf = ROLE_COLORS[r] || ROLE_COLORS.salesperson;
          return (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                background: conf.bg,
                color: conf.color,
              }}
            >
              <Shield size={12} /> {conf.label}
            </span>
          );
        },
      },
      {
        accessorKey: "phone",
        header: "Phone",
        size: 150,
        cell: (c) => <span style={{ fontSize: "13px" }}>{String(c.getValue() || "—")}</span>,
      },
      {
        accessorKey: "is_active",
        header: "Status",
        size: 110,
        cell: (c) => (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 600,
              background: c.getValue() ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: c.getValue() ? "#10b981" : "#ef4444",
            }}
          >
            {c.getValue() ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Joined",
        size: 120,
        cell: (c) => <span style={{ fontSize: "12px", color: "var(--vc-text-sub)" }}>{formatDate(String(c.getValue() || ""))}</span>,
      },
    ],
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Action Strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          gap: "12px",
        }}
      >
        <div style={{ position: "relative", maxWidth: "320px", width: "100%" }}>
          <Search
            size={15}
            style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--vc-text-sub)" }}
          />
          <input
            type="text"
            placeholder="Search team member, role, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px 7px 32px",
              background: "var(--vc-surface)",
              border: "1px solid var(--vc-border)",
              borderRadius: "8px",
              color: "var(--vc-text-hi)",
              fontSize: "13px",
            }}
          />
        </div>

        <button
          onClick={() => setModalOpen(true)}
          style={{
            background: "var(--vc-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "7px 14px",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
          }}
        >
          <Plus size={15} /> Invite Member (F1)
        </button>
      </div>

      {/* Data Grid */}
      <div style={{ flex: 1, padding: "0 20px 16px 20px", overflow: "hidden" }}>
        <DataGrid<UserRow>
          columns={columns}
          data={filteredRows}
          getRowId={(r) => r.id}
          loading={loading}
          emptyTitle="No team members invited"
          emptyHint="Invite sales personnel, workshop supervisors, or accountants using Invite Member or Alt+N."
        />
      </div>

      {/* Invite Modal */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <form
            onSubmit={handleInvite}
            style={{
              maxWidth: "440px",
              width: "100%",
              background: "var(--vc-bg)",
              border: "1px solid var(--vc-border)",
              borderRadius: "16px",
              padding: "24px",
              color: "var(--vc-text-hi)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>Invite Team Member</div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--vc-text-sub)", cursor: "pointer", fontSize: "18px" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Suresh Kumar"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) setFieldErrors((f) => ({ ...f, fullName: "" }));
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: fieldErrors.fullName ? "1px solid var(--vc-danger)" : "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
                {fieldErrors.fullName && (
                  <span style={{ color: "var(--vc-danger)", fontSize: "11px", marginTop: "3px", display: "block" }}>
                    {fieldErrors.fullName}
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="suresh@factory.com"
                  maxLength={100}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      const err = validateEmail(e.target.value, true);
                      setFieldErrors((f) => ({ ...f, email: err || "" }));
                    }
                  }}
                  onBlur={(e) => {
                    const err = validateEmail(e.target.value, true);
                    setFieldErrors((f) => ({ ...f, email: err || "" }));
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: fieldErrors.email ? "1px solid var(--vc-danger)" : "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
                {fieldErrors.email && (
                  <span style={{ color: "var(--vc-danger)", fontSize: "11px", marginTop: "3px", display: "block" }}>
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Role & Access
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  >
                    <option value="salesperson">Sales & Estimation</option>
                    <option value="manager">Factory / Workshop Manager</option>
                    <option value="accountant">Accountant</option>
                    <option value="owner">Owner / Super Admin</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    maxLength={16}
                    value={phone}
                    onChange={(e) => {
                      const clean = sanitizePhoneInput(e.target.value);
                      setPhone(clean);
                      if (fieldErrors.phone) {
                        const err = validatePhone(clean);
                        setFieldErrors((f) => ({ ...f, phone: err || "" }));
                      }
                    }}
                    onBlur={(e) => {
                      const err = validatePhone(e.target.value);
                      setFieldErrors((f) => ({ ...f, phone: err || "" }));
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: fieldErrors.phone ? "1px solid var(--vc-danger)" : "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  />
                  {fieldErrors.phone && (
                    <span style={{ color: "var(--vc-danger)", fontSize: "11px", marginTop: "3px", display: "block" }}>
                      {fieldErrors.phone}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "transparent",
                    color: "var(--vc-text-sub)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "var(--vc-accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
