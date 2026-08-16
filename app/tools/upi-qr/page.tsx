"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";

export default function UpiQrGenerator() {
  const [vpa, setVpa] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  const generate = useCallback(async () => {
    const trimmedVpa = vpa.trim();
    if (!trimmedVpa || !trimmedVpa.includes("@")) {
      setError("Enter a valid UPI ID, for example business@upi.");
      setQrDataUrl("");
      return;
    }

    const params = new URLSearchParams({ pa: trimmedVpa });
    if (name.trim()) params.set("pn", name.trim());
    if (amount.trim() && Number(amount) > 0) params.set("am", Number(amount).toFixed(2));
    if (note.trim()) params.set("tn", note.trim());
    params.set("cu", "INR");

    try {
      setQrDataUrl(await QRCode.toDataURL(`upi://pay?${params.toString()}`, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M",
      }));
      setError("");
    } catch {
      setError("Could not generate the QR code. Please check the details and try again.");
      setQrDataUrl("");
    }
  }, [amount, name, note, vpa]);

  const reset = () => {
    setVpa("");
    setName("");
    setAmount("");
    setNote("");
    setQrDataUrl("");
    setError("");
  };

  return (
    <div className="tool-page container">
      <Link href="/tools" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 24 }}>
        <ArrowLeft size={16} /> All Tools
      </Link>

      <div className="tool-page-header">
        <div className="tool-icon">📱</div>
        <h1>UPI QR Generator</h1>
        <p>Create a UPI payment QR code to print or share with your customers.</p>
      </div>

      <div className="calc-card">
        <div className="calc-card-header"><h2>Payment Details</h2></div>
        <div className="calc-card-body">
          <div className="info-box blue">
            Your payment details are used only in your browser to create the QR code. Vitharn does not process the payment.
          </div>

          <div className="form-group">
            <label htmlFor="upi-vpa">UPI ID <span className="hint">(required)</span></label>
            <div className="input-wrap"><input id="upi-vpa" type="text" inputMode="email" placeholder="business@upi" value={vpa} onChange={(e) => setVpa(e.target.value)} /></div>
          </div>
          <div className="form-group">
            <label htmlFor="upi-name">Payee name <span className="hint">(optional)</span></label>
            <div className="input-wrap"><input id="upi-name" type="text" placeholder="Your business name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="upi-amount">Amount <span className="hint">(optional)</span></label>
              <div className="input-wrap"><input id="upi-amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 2500" value={amount} onChange={(e) => setAmount(e.target.value)} className="has-unit" /><span className="unit">₹</span></div>
            </div>
            <div className="form-group">
              <label htmlFor="upi-note">Note <span className="hint">(optional)</span></label>
              <div className="input-wrap"><input id="upi-note" type="text" maxLength={80} placeholder="Invoice or order number" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
          </div>

          {error && <p role="alert" style={{ color: "#b42318", fontSize: 14, marginBottom: 16 }}>{error}</p>}
          <div className="btn-group">
            <button className="btn btn-primary btn-block" onClick={generate}>Generate QR Code</button>
            <button className="btn btn-outline btn-sm" onClick={reset}><RotateCcw size={14} /> Reset</button>
          </div>

          {qrDataUrl && (
            <div className="result-section qr-display">
              <h3>Scan to Pay</h3>
              <img src={qrDataUrl} alt={`UPI payment QR code for ${vpa}`} width={320} height={320} />
              <p className="upi-link">upi://pay · {vpa}</p>
              <a className="btn btn-outline btn-sm" href={qrDataUrl} download="upi-payment-qr.png" style={{ marginTop: 16 }}><Download size={14} /> Download QR</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
