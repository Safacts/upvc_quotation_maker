"use client";

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useRef, useState, useEffect, Component, type ReactNode, type FC } from 'react';
import { useSearchParams } from 'next/navigation';

class ViewerErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f4f0' }}>
          <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#7C2D12', marginBottom: 8 }}>
              3D preview error
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12, wordBreak: 'break-word' }}>
              {String(this.state.error.message || this.state.error)}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ background: '#EA580C', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Reload preview
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FRAME_COLOR = "#E8E4DC";
const FRAME_COLOR_DARK = "#C8C4BC";
const GLASS_COLOR = "#B8D8E8";
const GLASS_OPACITY = 0.38;
const WALL_COLOR = "#F5F3EF";
const FLOOR_COLOR = "#E0DDD8";
const HANDLE_COLOR = "#8A8A8A";
const SASH_COLOR = "#DEDAD2";

// ─── Profile thickness ────────────────────────────────────────────────────────
// All mm values divided by 100 to get scene units. 1 unit ≈ 100mm.

function profileT(W: number, H: number): number {
  return Math.max(1.2, Math.min(2.2, Math.min(W, H) * 0.06));
}

// ─── Box helper ───────────────────────────────────────────────────────────────

function Box({
  w, h, d, x = 0, y = 0, z = 0, color, opacity = 1, transparent = false,
}: {
  w: number; h: number; d: number;
  x?: number; y?: number; z?: number;
  color: string; opacity?: number; transparent?: boolean;
}) {
  return (
    <mesh position={[x, y, z]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={color}
        opacity={opacity}
        transparent={transparent}
        roughness={0.35}
        metalness={0.05}
      />
    </mesh>
  );
}

// ─── Outer frame ──────────────────────────────────────────────────────────────
// Each rail = face box + inner lip box. This simulates an extruded U-profile.

function Frame({ W, H, t, fd }: { W: number; H: number; t: number; fd: number }) {
  const lip = t * 0.3;
  const lipD = fd * 0.4;
  const lipOffset = (fd - lipD) / 2;

  return (
    <>
      {/* Top rail */}
      <Box w={W} h={t} d={fd} y={H / 2 - t / 2} color={FRAME_COLOR} />
      <Box w={W - t * 2} h={lip} d={lipD} y={H / 2 - t + lip / 2} z={-lipOffset} color={FRAME_COLOR_DARK} />
      {/* Bottom rail */}
      <Box w={W} h={t} d={fd} y={-H / 2 + t / 2} color={FRAME_COLOR} />
      <Box w={W - t * 2} h={lip} d={lipD} y={-H / 2 + t - lip / 2} z={-lipOffset} color={FRAME_COLOR_DARK} />
      {/* Left stile */}
      <Box w={t} h={H - 2 * t} d={fd} x={-W / 2 + t / 2} color={FRAME_COLOR} />
      <Box w={lip} h={H - 2 * t - lip * 2} d={lipD} x={-W / 2 + t - lip / 2} z={-lipOffset} color={FRAME_COLOR_DARK} />
      {/* Right stile */}
      <Box w={t} h={H - 2 * t} d={fd} x={W / 2 - t / 2} color={FRAME_COLOR} />
      <Box w={lip} h={H - 2 * t - lip * 2} d={lipD} x={W / 2 - t + lip / 2} z={-lipOffset} color={FRAME_COLOR_DARK} />
    </>
  );
}

// ─── Glass pane ───────────────────────────────────────────────────────────────

function Glass({ w, h, z = 0 }: { w: number; h: number; z?: number }) {
  return (
    <Box w={w} h={h} d={0.3} z={z} color={GLASS_COLOR} opacity={GLASS_OPACITY} transparent />
  );
}

// ─── Handle ───────────────────────────────────────────────────────────────────

function Handle({ x, y }: { x: number; y: number }) {
  return (
    <>
      <Box w={0.3} h={1.2} d={0.4} x={x} y={y} z={3.5} color={HANDLE_COLOR} />
      <Box w={0.25} h={0.25} d={1.2} x={x} y={y + 0.3} z={4.1} color={HANDLE_COLOR} />
    </>
  );
}

// ─── Fixed window ─────────────────────────────────────────────────────────────

function FixedWindow({ W, H, t, fd }: { W: number; H: number; t: number; fd: number }) {
  const iW = W - 2 * t;
  const iH = H - 2 * t;
  return (
    <>
      <Frame W={W} H={H} t={t} fd={fd} />
      <Glass w={iW} h={iH} />
    </>
  );
}

// ─── Sliding window ───────────────────────────────────────────────────────────

function SlidingWindow({ W, H, t, fd }: { W: number; H: number; t: number; fd: number }) {
  const iW = W - 2 * t;
  const iH = H - 2 * t;
  const sW = iW / 2 + t * 0.6;
  const sH = iH;
  const mt = t * 0.7;

  return (
    <>
      <Frame W={W} H={H} t={t} fd={fd} />

      {/* Left sash (back) */}
      <Box w={sW} h={mt} d={fd * 0.55} x={-iW / 2 + sW / 2 - t * 0.3} y={iH / 2 - mt / 2} z={-fd * 0.2} color={SASH_COLOR} />
      <Box w={sW} h={mt} d={fd * 0.55} x={-iW / 2 + sW / 2 - t * 0.3} y={-iH / 2 + mt / 2} z={-fd * 0.2} color={SASH_COLOR} />
      <Box w={mt} h={sH - mt * 2} d={fd * 0.55} x={-iW / 2 + mt / 2} z={-fd * 0.2} color={SASH_COLOR} />
      <Box w={mt} h={sH - mt * 2} d={fd * 0.55} x={-iW / 2 + sW - mt / 2 - t * 0.3} z={-fd * 0.2} color={SASH_COLOR} />
      <Glass w={sW - mt * 2} h={sH - mt * 2} z={-fd * 0.2} />

      {/* Right sash (front) */}
      <Box w={sW} h={mt} d={fd * 0.55} x={iW / 2 - sW / 2 + t * 0.3} y={iH / 2 - mt / 2} z={fd * 0.2} color={SASH_COLOR} />
      <Box w={sW} h={mt} d={fd * 0.55} x={iW / 2 - sW / 2 + t * 0.3} y={-iH / 2 + mt / 2} z={fd * 0.2} color={SASH_COLOR} />
      <Box w={mt} h={sH - mt * 2} d={fd * 0.55} x={iW / 2 - mt / 2} z={fd * 0.2} color={SASH_COLOR} />
      <Box w={mt} h={sH - mt * 2} d={fd * 0.55} x={iW / 2 - sW + mt / 2 + t * 0.3} z={fd * 0.2} color={SASH_COLOR} />
      <Glass w={sW - mt * 2} h={sH - mt * 2} z={fd * 0.2} />

      <Handle x={iW / 2 - sW + mt + 0.4} y={0} />
    </>
  );
}

// ─── Casement / Tilt-Turn ─────────────────────────────────────────────────────

function CasementWindow({ W, H, t, fd }: { W: number; H: number; t: number; fd: number }) {
  const iW = W - 2 * t;
  const iH = H - 2 * t;
  const mt = t * 0.75;

  return (
    <>
      <Frame W={W} H={H} t={t} fd={fd} />
      <Box w={iW} h={mt} d={fd * 0.6} y={iH / 2 - mt / 2} z={fd * 0.15} color={SASH_COLOR} />
      <Box w={iW} h={mt} d={fd * 0.6} y={-iH / 2 + mt / 2} z={fd * 0.15} color={SASH_COLOR} />
      <Box w={mt} h={iH - mt * 2} d={fd * 0.6} x={-iW / 2 + mt / 2} z={fd * 0.15} color={SASH_COLOR} />
      <Box w={mt} h={iH - mt * 2} d={fd * 0.6} x={iW / 2 - mt / 2} z={fd * 0.15} color={SASH_COLOR} />
      <Glass w={iW - mt * 2} h={iH - mt * 2} z={fd * 0.15} />
      {/* Hinges */}
      <Box w={0.2} h={0.5} d={fd * 0.7} x={-iW / 2 + mt * 0.5} y={iH * 0.3} z={fd * 0.2} color="#999" />
      <Box w={0.2} h={0.5} d={fd * 0.7} x={-iW / 2 + mt * 0.5} y={-iH * 0.3} z={fd * 0.2} color="#999" />
      <Handle x={iW / 2 - mt - 0.5} y={0} />
    </>
  );
}

// ─── Wall + Floor context ─────────────────────────────────────────────────────

function Scene({ W, H }: { W: number; H: number }) {
  return (
    <>
      <mesh position={[0, 0, -12]}>
        <planeGeometry args={[W * 2.6, H * 2.2]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, -H / 2, -12 + (H * 1.8) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W * 2.6, H * 1.8]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.85} />
      </mesh>
    </>
  );
}

// ─── Window3D — top-level dispatcher ─────────────────────────────────────────

function Window3D({ design }: { design: any }) {
  const dimensions = design.dimensions;
  const W = dimensions.width_mm / 100;
  const H = dimensions.height_mm / 100;
  const fd = 6;
  const t = profileT(W, H);
  const type: string = (dimensions.configuration ?? "fixed").toLowerCase();

  let Opening: FC<{ W: number; H: number; t: number; fd: number }>;
  if (type === "sliding") {
    Opening = SlidingWindow;
  } else if (type === "casement" || type === "tilt_turn" || type === "tilt-turn") {
    Opening = CasementWindow;
  } else {
    Opening = FixedWindow;
  }

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[8, 12, 10]} intensity={0.9} castShadow />
      <directionalLight position={[-6, -4, 6]} intensity={0.2} />
      <Scene W={W} H={H} />
      <Opening W={W} H={H} t={t} fd={fd} />
    </>
  );
}

function LoadingFallback() {
  return null;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading 3D design...</div>}>
      <Viewer />
    </Suspense>
  );
}

function Viewer() {
  const [design, setDesign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needManual, setNeedManual] = useState(false);
  const [manualW, setManualW] = useState(1200);
  const [manualH, setManualH] = useState(1200);
  const [manualType, setManualType] = useState("fixed");
  const canvasRef = useRef(null);

  async function readError(res: Response): Promise<string> {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = String(body.error);
    } catch {
      // non-JSON body — keep the status-based message
    }
    return msg;
  }

  async function generateManual() {
    setLoading(true);
    setError(null);
    setNeedManual(false);
    try {
      const cfgRes = await fetch("/api/console/3d/configurator", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          width_mm: Math.round(Number(manualW)),
          height_mm: Math.round(Number(manualH)),
          type: manualType,
          profile_type: "uPVC",
          name: fromQuotationId ? `From quotation ${fromQuotationId}` : "Manual window",
        }),
      });
      if (!cfgRes.ok) {
        setError(await readError(cfgRes));
        return;
      }
      const cfgData = await cfgRes.json();
      setDesign(cfgData && cfgData.design ? cfgData.design : null);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Network error while loading");
    } finally {
      setLoading(false);
    }
  }

  // The API GET returns { design, order, renders } — never a flat design object.
  // `?designId=X` loads a saved design; `?fromQuotation=Y` derives one from the
  // quotation's first measured opening via the configurator.
  const searchParams = useSearchParams();
  const designId = (searchParams.get("designId") ?? "").trim();
  const fromQuotationId = (searchParams.get("fromQuotation") ?? "").trim();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (designId) {
          const res = await fetch(`/api/console/3d/designs/${encodeURIComponent(designId)}`, {
            credentials: "include",
          });
          if (!res.ok) {
            setError(await readError(res));
            return;
          }
          const data = await res.json();
          setDesign(data && data.design ? data.design : null);
          return;
        }

        if (fromQuotationId) {
          const qRes = await fetch(
            `/api/console/quotations/${encodeURIComponent(fromQuotationId)}`,
            { credentials: "include" },
          );
          if (!qRes.ok) {
            setError(await readError(qRes));
            return;
          }
          const qData = await qRes.json();
          const measured = Array.isArray(qData.measured_items)
            ? qData.measured_items
            : [];
          const opening = measured.find(
            (m: any) => Number(m.width) > 0 && Number(m.height) > 0,
          );
          if (!opening) {
            // No measurable opening — let the user enter dimensions manually
            // instead of dead-ending. Pre-fill with the quotation's first item
            // if it carries any width/height hint.
            const hint = measured[0];
            if (hint && Number(hint.width) > 0) setManualW(Math.round(Number(hint.width)));
            if (hint && Number(hint.height) > 0) setManualH(Math.round(Number(hint.height)));
            setNeedManual(true);
            setLoading(false);
            return;
          }
          const cfgRes = await fetch("/api/console/3d/configurator", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              width_mm: Math.round(Number(opening.width)),
              height_mm: Math.round(Number(opening.height)),
              type: "fixed",
              profile_type: "uPVC",
              name: `From quotation ${fromQuotationId}`,
            }),
          });
          if (!cfgRes.ok) {
            setError(await readError(cfgRes));
            return;
          }
          const cfgData = await cfgRes.json();
          setDesign(cfgData && cfgData.design ? cfgData.design : null);
          return;
        }
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Network error while loading");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [designId, fromQuotationId]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading 3D design...</div>
      </div>
    );
  }

  if (error) {
    const isAuth = /unauthorized|forbidden|login|session/i.test(error);
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f4f0' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#7C2D12', marginBottom: 8 }}>
            {isAuth ? 'Please log in to view this design' : 'Could not load this design'}
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
            {error}
          </div>
          <a
            href="/kprupvc/console"
            style={{
              display: 'inline-block',
              background: '#EA580C',
              color: '#fff',
              padding: '10px 24px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Log in to Ops Console
          </a>
        </div>
      </div>
    );
  }

  if (needManual) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f4f0' }}>
        <div style={{ background: '#fff', padding: 28, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 360, width: '90%' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#7C2D12', marginBottom: 4 }}>
            Enter window dimensions
          </div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>
            This quotation has no measured opening yet. Enter dimensions to generate a 3D preview.
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Width (mm)</label>
          <input
            type="number"
            value={manualW}
            onChange={(e) => setManualW(Number(e.target.value) || 0)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 14, fontSize: 14 }}
          />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Height (mm)</label>
          <input
            type="number"
            value={manualH}
            onChange={(e) => setManualH(Number(e.target.value) || 0)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 14, fontSize: 14 }}
          />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Type</label>
          <select
            value={manualType}
            onChange={(e) => setManualType(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 18, fontSize: 14 }}
          >
            <option value="fixed">Fixed</option>
            <option value="casement">Casement</option>
            <option value="sliding">Sliding</option>
            <option value="tilt_turn">Tilt &amp; Turn</option>
          </select>
          <button
            onClick={generateManual}
            style={{ width: '100%', background: '#EA580C', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Generate 3D
          </button>
        </div>
      </div>
    );
  }

  if (!design) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>No design found. Pass ?designId=XXX or ?fromQuotation=XXX to view.</div>
      </div>
    );
  }

  if (!design.dimensions || typeof design.dimensions.width_mm !== 'number') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ fontWeight: 700, color: '#7C2D12' }}>Invalid design data</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
            The generated design is missing dimension information. Try again or contact support.
          </div>
        </div>
      </div>
    );
  }

  const W3d = design.dimensions.width_mm / 100;
  const H3d = design.dimensions.height_mm / 100;
  const cameraZ = Math.max(W3d, H3d) * 1.8 + 18;

  return (
    <ViewerErrorBoundary>
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: 'linear-gradient(160deg, #EEF2F7 0%, #E2E8F2 100%)' }}>
      <Canvas
        ref={canvasRef}
        camera={{ position: [0, 0, cameraZ], fov: 45 }}
        style={{ height: '100vh', width: '100vw', background: 'transparent' }}
        shadows
      >
        <Suspense fallback={<LoadingFallback />}>
          <Window3D design={design} />
          <OrbitControls enablePan enableZoom enableRotate maxDistance={500} minDistance={50} />
        </Suspense>
      </Canvas>
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          padding: '10px 18px',
          borderRadius: 12,
          boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
          pointerEvents: 'none',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.01em' }}>
          {design.dimensions.width_mm} × {design.dimensions.height_mm} mm
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 2, textTransform: 'capitalize' }}>
          {(design.dimensions.configuration ?? 'fixed').replace(/_/g, ' ')} window
        </div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
          Drag to rotate · Scroll to zoom
        </div>
      </div>
      </div>
    </ViewerErrorBoundary>
  );
}
