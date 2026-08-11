import './pricing.css';

export default function PricingPage() {
  return (
    <div className="pricing-page-container">
      <nav style={{ padding: '16px 48px', background: 'var(--paper-warm)' }}>
        <a href="/upvc/pricing" style={{ color: 'var(--rust)', fontSize: 14, fontWeight: 600 }}>← Back to Pricing</a>
      </nav>
      <div className="sheet">
        {/* HEADER */}
        <div className="header">
          <div className="logo-wrap">
            <img src="/pricing-logo.png" alt="Vitharn UPVC" loading="lazy" width={72} height={72} />
          </div>
          <div className="header-text">
            <div className="header-meta">Pricing Plan — 2026 · Valid for first 25 clients</div>
            <h1 className="header-title">Simple pricing.<br/><em>No monthly fees.</em></h1>
            <div className="header-subtitle">
              Vitharn ERP Services &nbsp;·&nbsp; <a href="https://app.vitharn.com">app.vitharn.com</a> &nbsp;·&nbsp; vitarn.dev@gmail.com
            </div>
          </div>
        </div>

        {/* INTRO */}
        <div className="intro-band">
          <div className="intro-copy">
            <p className="intro-lead">Built for UPVC fabricators. Priced fairly.</p>
            <p>We build software specifically for UPVC window and door fabricators — to help you create professional quotations faster, look more professional to your customers, and get paid on time. Unlike Tally or Excel, Vitharn is built ground-up for your workflow.</p>
            <p>Pay once and own it forever. No subscription traps. Free updates for the first year.</p>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="num">₹0</span>
              <span className="lbl"><strong>Monthly Fees</strong>One-time payment only. Yours forever.</span>
            </div>
            <div className="stat">
              <span className="num">7</span>
              <span className="lbl"><strong>Day Free Trial</strong>Full features, no credit card needed.</span>
            </div>
            <div className="stat">
              <span className="num">24</span>
              <span className="lbl"><strong>Hour Setup</strong>We load your brand &amp; pricing for you.</span>
            </div>
          </div>
        </div>

        {/* TIERS */}
        <div className="section-label"><h2>Choose your plan</h2></div>
        <div className="tier-section">
          <div className="tier-grid-top">
            <div className="tier-card featured">
              <div className="badge">Sweet Spot</div>
              <div className="tier-label">Base</div>
              <div className="tier-price">₹25,000<sub>&nbsp;one-time</sub></div>
              <div className="tier-desc">Small shops (1–5 people) who want digital quotations with cloud backup.</div>
              <ul className="tier-features">
                <li>Cloud sync &amp; web dashboard</li>
                <li>GST-compliant invoicing</li>
                <li>Customer &amp; product database</li>
                <li>Daily cloud backup</li>
                <li>Basic analytics</li>
              </ul>
            </div>

            <div className="tier-card">
              <div className="tier-label">Next</div>
              <div className="tier-price">₹35,000<sub>&nbsp;one-time</sub></div>
              <div className="tier-desc">Growing businesses wanting online visibility and customer reviews.</div>
              <ul className="tier-features">
                <li>Everything in Base</li>
                <li>SEO-optimized business webpage</li>
                <li>Customer star-rating system</li>
                <li>Auto review-request emails</li>
                <li>Advanced analytics &amp; conversion rates</li>
              </ul>
            </div>
          </div>
          <div className="tier-grid-bottom">
            <div className="tier-card">
              <div className="tier-label">Next+</div>
              <div className="tier-price">₹45,000<sub>&nbsp;one-time</sub></div>
              <div className="tier-desc">Businesses wanting direct customer engagement via WhatsApp.</div>
              <ul className="tier-features">
                <li>Everything in Next</li>
                <li>Direct WhatsApp sharing of quotes</li>
                <li>Review link sharing via WhatsApp</li>
                <li>Product performance analytics</li>
                <li>Customer retention metrics</li>
                <li>Priority email support</li>
              </ul>
            </div>

            <div className="tier-card">
              <div className="tier-label">Final</div>
              <div className="tier-price">₹55,000<sub>&nbsp;one-time</sub></div>
              <div className="tier-desc">Full-service businesses who want complete automation and financial control.</div>
              <ul className="tier-features">
                <li>Everything in Next+</li>
                <li>Desktop web console (split-view editor)</li>
                <li>Keyboard shortcuts — Tally-style speed</li>
                <li>Payment tracking: who paid, who owes</li>
                <li>GST reports, sales register, customer ledger</li>
                <li>WhatsApp + email priority support</li>
              </ul>
            </div>
          </div>
        </div>

        {/* UPGRADE NOTE */}
        <div className="upgrade-note">
          <p><strong>Upgrade anytime.</strong> Only the price difference is charged. Start on Base and move to Final as your business grows — your data always transfers seamlessly.</p>
          <a href="mailto:vitarn.dev@gmail.com" className="note-cta">Contact us to upgrade →</a>
        </div>

        {/* FAQ */}
        <div className="section-label"><h2>Frequently Asked Questions</h2></div>
        <div className="faq-section">
          <div className="faq-grid">
            <div className="faq-item">
              <h4>Is this a subscription or one-time?</h4>
              <p>Strictly one-time. No monthly fees, ever. Your software works as long as you need it.</p>
            </div>
            <div className="faq-item">
              <h4>How is this better than Tally or Excel?</h4>
              <p>Tally is for accountants. Vitharn is built for UPVC fabricators — with WhatsApp sharing, a customer webpage, and review tools Tally doesn&apos;t have.</p>
            </div>
            <div className="faq-item">
              <h4>What about software updates?</h4>
              <p>All updates are free for 1 year. After that, optional ₹5,000/year for continued updates.</p>
            </div>
            <div className="faq-item">
              <h4>Can I try before buying?</h4>
              <p>Yes — 7-day free trial with full features. No card required. Setup takes under 24 hours.</p>
            </div>
            <div className="faq-item">
              <h4>Do you support GST invoicing?</h4>
              <p>Fully. Vitharn handles GST invoicing on all plans. We currently don&apos;t charge GST on our software.</p>
            </div>
            <div className="faq-item">
              <h4>Do I need internet to use it?</h4>
              <p>Yes. All plans require internet for cloud sync and dashboard access.</p>
            </div>
          </div>
        </div>

        {/* QR CODE */}
        <div style={{ textAlign: "center", margin: "24px 0" }}>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7a5438", marginBottom: 12 }}>
            Scan to view pricing online
          </p>
          <svg width="80" height="80" viewBox="0 0 80 80" style={{ margin: "0 auto", display: "block" }}>
            {/* Simple QR code pattern */}
            <rect x="0" y="0" width="80" height="80" fill="white"/>
            <rect x="4" y="4" width="24" height="24" fill="#1A0A00"/>
            <rect x="52" y="4" width="24" height="24" fill="#1A0A00"/>
            <rect x="4" y="52" width="24" height="24" fill="#1A0A00"/>
            <rect x="8" y="8" width="16" height="16" fill="white"/>
            <rect x="56" y="8" width="16" height="16" fill="white"/>
            <rect x="8" y="56" width="16" height="16" fill="white"/>
            <rect x="12" y="12" width="8" height="8" fill="#C44A10"/>
            <rect x="60" y="12" width="8" height="8" fill="#C44A10"/>
            <rect x="12" y="60" width="8" height="8" fill="#C44A10"/>
            <rect x="32" y="4" width="8" height="8" fill="#1A0A00"/>
            <rect x="44" y="4" width="8" height="8" fill="#1A0A00"/>
            <rect x="32" y="16" width="8" height="8" fill="#1A0A00"/>
            <rect x="44" y="16" width="8" height="8" fill="#1A0A00"/>
            <rect x="4" y="32" width="8" height="8" fill="#1A0A00"/>
            <rect x="16" y="32" width="8" height="8" fill="#1A0A00"/>
            <rect x="32" y="32" width="8" height="8" fill="#1A0A00"/>
            <rect x="44" y="32" width="8" height="8" fill="#1A0A00"/>
            <rect x="56" y="32" width="8" height="8" fill="#1A0A00"/>
            <rect x="68" y="32" width="8" height="8" fill="#1A0A00"/>
            <rect x="32" y="44" width="8" height="8" fill="#1A0A00"/>
            <rect x="44" y="44" width="8" height="8" fill="#1A0A00"/>
            <rect x="56" y="44" width="8" height="8" fill="#1A0A00"/>
            <rect x="4" y="68" width="8" height="8" fill="#1A0A00"/>
            <rect x="16" y="68" width="8" height="8" fill="#1A0A00"/>
            <rect x="32" y="68" width="8" height="8" fill="#1A0A00"/>
            <rect x="44" y="56" width="8" height="8" fill="#1A0A00"/>
            <rect x="56" y="56" width="8" height="8" fill="#1A0A00"/>
            <rect x="68" y="56" width="8" height="8" fill="#1A0A00"/>
            <rect x="56" y="68" width="8" height="8" fill="#1A0A00"/>
            <rect x="68" y="68" width="8" height="8" fill="#1A0A00"/>
          </svg>
          <p style={{ fontSize: 11, color: "#7a5438", marginTop: 8 }}>vitharn.com/upvc/pricing</p>
        </div>

        {/* FOOTER */}
        <div className="footer">
          <div className="footer-left">
            Ready to start? Email us at <a href="mailto:vitarn.dev@gmail.com" style={{ color: 'var(--rust)' }}>vitarn.dev@gmail.com</a><br/>
            or visit <a href="https://app.vitharn.com" style={{ color: 'var(--rust)' }}>app.vitharn.com</a>
          </div>
          <div className="footer-right">
            7-DAY FREE TRIAL AVAILABLE<br/>
            SETUP IN 24 HOURS<br/>
            NO MONTHLY FEES
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 10, color: "#7a5438", textAlign: "center" }}>
          <a href="/privacy" style={{ color: "var(--rust)" }}>Privacy Policy</a> · <a href="/terms" style={{ color: "var(--rust)" }}>Terms</a> · <a href="mailto:vitarn.dev@gmail.com" style={{ color: "var(--rust)" }}>Contact</a>
        </div>

      </div>
    </div>
  );
}
