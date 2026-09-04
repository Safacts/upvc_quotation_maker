"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserPlus, PackagePlus } from "lucide-react";
import { validateEmail, validatePhone, sanitizePhoneInput, validateGSTIN } from "@/lib/console-validators";

/**
 * QuickCreate — Alt+C, Tally's own "create master on the fly" key.
 *
 * ============================================================================
 *  WHY THIS IS THE MOST IMPORTANT SHORTCUT IN PHASE 3
 * ============================================================================
 * The workflow it removes is the one that makes people abandon an ERP. Halfway
 * through a quotation the fabricator types a customer who is not in the master.
 * Without this they must: abandon (or save) the half-typed quotation, navigate
 * to Customers, create the record, navigate back, find the draft, and resume.
 * Six steps, a lost train of thought, and a real chance of a duplicated or lost
 * draft. Tally solved this in the 1990s with Alt+C and users have expected it
 * ever since.
 *
 * ============================================================================
 *  IT NEVER TOUCHES THE PARENT FORM'S STATE
 * ============================================================================
 * The dialog POSTs to `/api/console/{customers,products}` and hands the created
 * row back through `onCreated`. The quotation being edited is NOT saved, NOT
 * reloaded, and NOT navigated away from — the master row is an independent
 * insert. That matters: saving the parent as a side effect of creating a
 * customer would commit a half-typed quotation the user never asked to save.
 *
 * ============================================================================
 *  THE DUPLICATE-PHONE CASE IS A SUCCESS, NOT AN ERROR
 * ============================================================================
 * Migration 007 has a UNIQUE index on (client_id, phone). The customers POST
 * route deliberately returns the EXISTING row with `existing: true` instead of
 * a 409, because a repeat customer typed in again is the normal case for
 * create-on-the-fly, not a mistake. This dialog surfaces that as "already on
 * file" and links the existing record — the user gets their customer either way
 * and no duplicate is created.
 */

/**
 * `"ask"` means the caller had no context to decide from — Alt+C pressed on the
 * Overview screen, or from the command palette. The dialog then offers the
 * choice instead of guessing. A screen that DOES know (the quotation editor,
 * which can see whether the caret is in the customer box or the item grid)
 * passes a concrete kind and skips the extra keystroke.
 */
export type QuickCreateKind = "customer" | "product" | "ask";

export interface CreatedCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  gst_number: string;
}

export interface CreatedProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  unit: string;
}

interface Props {
  kind: QuickCreateKind;
  /** Pre-fills the name field from whatever the user had already typed. */
  initialName?: string;
  onCreated: (row: CreatedCustomer | CreatedProduct, existing: boolean) => void;
  onClose: () => void;
}

export function QuickCreate({ kind, initialName = "", onCreated, onClose }: Props) {
  // When the caller passed "ask", the user picks first and `chosen` takes over.
  const [chosen, setChosen] = useState<"customer" | "product" | null>(
    kind === "ask" ? null : kind,
  );
  const isCustomer = chosen === "customer";

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState("");
  const [gst, setGst] = useState("");

  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("SFT");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only grab focus once a kind is settled — during the "what would you like
    // to create?" step there is no name field to focus yet.
    if (!chosen) return;
    const id = window.requestAnimationFrame(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [chosen]);

  const submit = useCallback(async () => {
    if (saving) return;
    // Guard: Enter during the chooser step must not POST a nameless record.
    if (!chosen) return;
    setFieldErrors({});
    if (!name.trim()) {
      setFieldErrors({ name: "Name is required" });
      setError("Name is required");
      nameRef.current?.focus();
      return;
    }
    if (isCustomer) {
      const phoneErr = validatePhone(phone);
      if (phoneErr) {
        setFieldErrors({ phone: phoneErr });
        setError(phoneErr);
        return;
      }
      const emailErr = validateEmail(email);
      if (emailErr) {
        setFieldErrors({ email: emailErr });
        setError(emailErr);
        return;
      }
      const gstErr = validateGSTIN(gst);
      if (gstErr) {
        setFieldErrors({ gst: gstErr });
        setError(gstErr);
        return;
      }
    }
    if (!isCustomer && price && (isNaN(Number(price)) || Number(price) < 0)) {
      setFieldErrors({ price: "Price cannot be negative" });
      setError("Price cannot be negative");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = isCustomer ? "/api/console/customers" : "/api/console/products";
      // `client_id` is DELIBERATELY absent from this body. The route derives it
      // from the HttpOnly session cookie; sending one would be ignored for a
      // customer session anyway (see resolveTenant) and including it here would
      // set a bad example for the next person copying this fetch.
      const body = isCustomer
        ? { name, phone, email, company, address, gst_number: gst }
        : { name, category, description, price, unit: unit || "SFT" };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        // The API returns per-field messages keyed by path; show the first one
        // rather than a generic "Validation failed" the user has to guess at.
        const firstField = data?.fields ? Object.values(data.fields)[0] : null;
        setError(String(firstField || data?.error || "Could not save"));
        return;
      }

      const row = isCustomer ? data.customer : data.product;
      if (!row?.id) {
        setError("Saved, but the server did not return the new record");
        return;
      }
      onCreated(row, data.existing === true);
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }, [
    saving, chosen, name, phone, email, company, address, gst,
    category, description, price, unit, isCustomer, onCreated, onClose,
  ]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // This dialog owns the keyboard while open. Without stopPropagation the
      // shell's Alt+C would re-fire and stack a second dialog on top.
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        e.preventDefault();
        void submit();
      }
    },
    [onClose, submit],
  );

  return (
    <div className="vc-overlay" onMouseDown={onClose}>
      <div
        className="vc-quick"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        tabIndex={-1}
      >
        <div className="vc-quick-head">
          {isCustomer ? <UserPlus size={14} /> : <PackagePlus size={14} />}
          <h3>{!chosen ? "Create" : isCustomer ? "New Customer" : "New Product"}</h3>
          <span className="vc-kbd">Alt C</span>
        </div>

        {/* Step 1, only when the caller could not infer the kind. Two big
            targets with single-letter accelerators — this step must cost at
            most one keystroke or it undermines the shortcut it belongs to. */}
        {!chosen && (
          <div className="vc-quick-choose">
            <button
              type="button"
              className="vc-quick-choice"
              onClick={() => setChosen("customer")}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            >
              <UserPlus size={18} />
              <span className="vc-quick-choice-label">Customer</span>
              <span className="vc-quick-choice-desc">Add to the customer master</span>
            </button>
            <button
              type="button"
              className="vc-quick-choice"
              onClick={() => setChosen("product")}
            >
              <PackagePlus size={18} />
              <span className="vc-quick-choice-label">Product</span>
              <span className="vc-quick-choice-desc">Add to the rate card</span>
            </button>
          </div>
        )}

        {chosen && (
        <div className="vc-quick-body">
          <div className="vc-field vc-span-2">
            <label className="vc-label">
              Name <span className="vc-req">*</span>
            </label>
            <input
              ref={nameRef}
              className="vc-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isCustomer ? "Customer name" : "Product name"}
            />
          </div>

          {isCustomer ? (
            <>
              <div className="vc-field">
                <label className="vc-label">Phone</label>
                <input
                  type="tel"
                  className={"vc-input" + (fieldErrors.phone ? " vc-invalid" : "")}
                  value={phone}
                  maxLength={16}
                  placeholder="10-digit mobile"
                  inputMode="tel"
                  data-calc="off"
                  onChange={(e) => {
                    const clean = sanitizePhoneInput(e.target.value);
                    setPhone(clean);
                    if (fieldErrors.phone) {
                      const err = validatePhone(clean);
                      setFieldErrors((f) => ({ ...f, phone: err || "" }));
                    }
                    if (error) setError("");
                  }}
                  onBlur={(e) => {
                    const err = validatePhone(e.target.value);
                    setFieldErrors((f) => ({ ...f, phone: err || "" }));
                    if (err) setError(err);
                  }}
                />
                {fieldErrors.phone && <span className="vc-err">{fieldErrors.phone}</span>}
              </div>
              <div className="vc-field">
                <label className="vc-label">Company</label>
                <input
                  className="vc-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div className="vc-field">
                <label className="vc-label">Email</label>
                <input
                  type="email"
                  className={"vc-input" + (fieldErrors.email ? " vc-invalid" : "")}
                  value={email}
                  placeholder="name@domain.com"
                  maxLength={100}
                  inputMode="email"
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      const err = validateEmail(e.target.value);
                      setFieldErrors((f) => ({ ...f, email: err || "" }));
                    }
                    if (error) setError("");
                  }}
                  onBlur={(e) => {
                    const err = validateEmail(e.target.value);
                    setFieldErrors((f) => ({ ...f, email: err || "" }));
                    if (err) setError(err);
                  }}
                />
                {fieldErrors.email && <span className="vc-err">{fieldErrors.email}</span>}
              </div>
              <div className="vc-field">
                <label className="vc-label">GSTIN</label>
                <input
                  className={"vc-input" + (fieldErrors.gst ? " vc-invalid" : "")}
                  value={gst}
                  maxLength={15}
                  placeholder="15-digit GSTIN"
                  data-calc="off"
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setGst(val);
                    if (fieldErrors.gst) {
                      const err = validateGSTIN(val);
                      setFieldErrors((f) => ({ ...f, gst: err || "" }));
                    }
                    if (error) setError("");
                  }}
                  onBlur={(e) => {
                    const err = validateGSTIN(e.target.value.toUpperCase());
                    setFieldErrors((f) => ({ ...f, gst: err || "" }));
                    if (err) setError(err);
                  }}
                />
                {fieldErrors.gst && <span className="vc-err">{fieldErrors.gst}</span>}
              </div>
              <div className="vc-field vc-span-2">
                <label className="vc-label">Address</label>
                <input
                  className="vc-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="vc-field">
                <label className="vc-label">Category</label>
                <input
                  className="vc-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Window, Door, Mesh..."
                  // Free text by design — an enum would mean a migration every
                  // time KPR invents a category. See products/route.ts.
                  list="vc-quick-categories"
                />
              </div>
              <div className="vc-field">
                <label className="vc-label">Rate</label>
                <input
                  className="vc-input vc-num"
                  value={price}
                  inputMode="decimal"
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="vc-field">
                <label className="vc-label">Unit</label>
                <select
                  className="vc-select"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="SFT">SFT</option>
                  <option value="NOS">NOS</option>
                  <option value="RFT">RFT</option>
                  <option value="SET">SET</option>
                  <option value="KG">KG</option>
                </select>
              </div>
              <div className="vc-field vc-span-2">
                <label className="vc-label">Description</label>
                <input
                  className="vc-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        )}

        {error && <div className="vc-quick-error">{error}</div>}

        <div className="vc-quick-foot">
          <span className="vc-config-hint">
            {!chosen
              ? "Creates a master record without leaving this screen."
              : isCustomer
                ? "Saved to the customer master. Your quotation is not saved."
                : "Saved to the rate card. Your quotation is not saved."}
          </span>
          <div style={{ flex: 1 }} />
          {/* Back, not Cancel, once a kind is chosen from the "ask" step —
              picking the wrong one should cost one click, not a reopen. */}
          {kind === "ask" && chosen && (
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => setChosen(null)}
            >
              Back
            </button>
          )}
          <button type="button" className="vc-btn vc-btn-sm" onClick={onClose}>
            Cancel <span className="vc-kbd">Esc</span>
          </button>
          <button
            type="button"
            className="vc-btn vc-btn-sm vc-btn-primary"
            onClick={() => void submit()}
            disabled={saving || !chosen}
          >
            {saving ? <span className="vc-spinner" /> : null} Create{" "}
            <span className="vc-kbd">Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
