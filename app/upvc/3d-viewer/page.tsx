"use client";

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { Suspense, useRef, useState, useEffect, Component, type ReactNode, type FC, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import * as THREE from 'three';

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

const FRAME_COLOR = "#F4F3F0"; // Slightly warmer, more realistic UPVC
const GLASS_COLOR = "#E8F4F8";
const WALL_COLOR = "#F5F3EF";
const FLOOR_COLOR = "#DEDAD5";
const HANDLE_COLOR = "#D1D1D1";
const SASH_COLOR = "#EAE8E4";
const GASKET_COLOR = "#222222";

function profileT(W: number, H: number): number {
  return Math.max(1.2, Math.min(2.2, Math.min(W, H) * 0.06));
}

// ─── Realistic Extruded Profile ──────────────────────────────────────────────

function ProfileExtrusion({ W, H, t, fd, color }: { W: number; H: number; t: number; fd: number; color: string }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-W / 2, -H / 2);
    s.lineTo(W / 2, -H / 2);
    s.lineTo(W / 2, H / 2);
    s.lineTo(-W / 2, H / 2);
    s.lineTo(-W / 2, -H / 2);

    const hole = new THREE.Path();
    const iW = W - 2 * t;
    const iH = H - 2 * t;
    hole.moveTo(-iW / 2, -iH / 2);
    hole.lineTo(iW / 2, -iH / 2);
    hole.lineTo(iW / 2, iH / 2);
    hole.lineTo(-iW / 2, iH / 2);
    hole.lineTo(-iW / 2, -iH / 2);
    s.holes.push(hole);
    return s;
  }, [W, H, t]);

  const extrudeSettings = {
    depth: fd,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.1,
    bevelThickness: 0.1,
  };

  return (
    <mesh position={[0, 0, -fd / 2]} castShadow receiveShadow>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

// ─── Gasket ───────────────────────────────────────────────────────────────────

function Gasket({ w, h, z }: { w: number; h: number; z: number }) {
  const t = 0.08;
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(-w / 2, h / 2);
    s.lineTo(-w / 2, -h / 2);

    const hole = new THREE.Path();
    hole.moveTo(-w / 2 + t, -h / 2 + t);
    hole.lineTo(w / 2 - t, -h / 2 + t);
    hole.lineTo(w / 2 - t, h / 2 - t);
    hole.lineTo(-w / 2 + t, h / 2 - t);
    hole.lineTo(-w / 2 + t, -h / 2 + t);
    s.holes.push(hole);
    return s;
  }, [w, h]);

  return (
    <mesh position={[0, 0, z]}>
      <extrudeGeometry args={[shape, { depth: 0.4, bevelEnabled: false }]} />
      <meshStandardMaterial color={GASKET_COLOR} roughness={0.8} />
    </mesh>
  );
}

// ─── Glass pane (Physical Material) ──────────────────────────────────────────

function Glass({ w, h, z = 0 }: { w: number; h: number; z?: number }) {
  return (
    <mesh position={[0, 0, z]}>
      <boxGeometry args={[w, h, 0.3]} />
      <meshPhysicalMaterial
        color={GLASS_COLOR}
        transmission={0.96}
        opacity={1}
        metalness={0.05}
        roughness={0.05}
        ior={1.5}
        thickness={0.5}
        transparent
      />
    </mesh>
  );
}

// ─── Architectural Handle ─────────────────────────────────────────────────────

function Handle({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      {/* Base rosette */}
      <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.8, 16]} />
        <meshStandardMaterial color={HANDLE_COLOR} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Lever spindle */}
      <mesh position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.4, 16]} />
        <meshStandardMaterial color={HANDLE_COLOR} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Lever handle */}
      <mesh position={[0, -0.6, 0.7]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 1.3, 16]} />
        <meshStandardMaterial color={HANDLE_COLOR} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Lever curve */}
      <mesh position={[0, 0.05, 0.7]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={HANDLE_COLOR} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[0, -1.25, 0.7]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={HANDLE_COLOR} roughness={0.3} metalness={0.6} />
      </mesh>
    </group>
  );
}

// ─── Fixed window ─────────────────────────────────────────────────────────────

function FixedWindow({ W, H, t, fd }: { W: number; H: number; t: number; fd: number }) {
  const iW = W - 2 * t;
  const iH = H - 2 * t;
  return (
    <>
      <ProfileExtrusion W={W} H={H} t={t} fd={fd} color={FRAME_COLOR} />
      <Gasket w={iW} h={iH} z={-0.2} />
      <Glass w={iW} h={iH} />
    </>
  );
}

// ─── Sliding window (Interactive) ─────────────────────────────────────────────

function SlidingWindow({ W, H, t, fd }: { W: number; H: number; t: number; fd: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const leftSashRef = useRef<THREE.Group>(null);
  
  const iW = W - 2 * t;
  const iH = H - 2 * t;
  const sW = iW / 2 + t * 0.4;
  const sH = iH;
  const mt = t * 0.7;

  useFrame((state, delta) => {
    if (leftSashRef.current) {
      const targetX = isOpen ? iW * 0.45 : 0;
      leftSashRef.current.position.x = THREE.MathUtils.damp(leftSashRef.current.position.x, targetX, 4, delta);
    }
  });

  return (
    <>
      <ProfileExtrusion W={W} H={H} t={t} fd={fd} color={FRAME_COLOR} />

      {/* Right sash (back, fixed for simplicity) */}
      <group position={[iW / 2 - sW / 2 + t * 0.2, 0, -fd * 0.2]}>
        <ProfileExtrusion W={sW} H={sH} t={mt} fd={fd * 0.55} color={SASH_COLOR} />
        <Gasket w={sW - 2 * mt} h={sH - 2 * mt} z={-0.2} />
        <Glass w={sW - 2 * mt} h={sH - 2 * mt} />
      </group>

      {/* Left sash (front, sliding) */}
      <group 
        ref={leftSashRef}
        position={[-iW / 2 + sW / 2 - t * 0.2, 0, fd * 0.2]}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        onPointerOver={() => document.body.style.cursor = 'pointer'}
        onPointerOut={() => document.body.style.cursor = 'auto'}
      >
        <ProfileExtrusion W={sW} H={sH} t={mt} fd={fd * 0.55} color={SASH_COLOR} />
        <Gasket w={sW - 2 * mt} h={sH - 2 * mt} z={-0.2} />
        <Glass w={sW - 2 * mt} h={sH - 2 * mt} />
        <Handle x={sW / 2 - mt * 1.5} y={0} z={fd * 0.25} />
      </group>
    </>
  );
}

// ─── Casement / Tilt-Turn (Interactive) ───────────────────────────────────────

function CasementWindow({ W, H, t, fd }: { W: number; H: number; t: number; fd: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const sashRef = useRef<THREE.Group>(null);
  
  const iW = W - 2 * t;
  const iH = H - 2 * t;
  const mt = t * 0.75;
  const pivotX = -iW / 2; // Hinge left

  useFrame((state, delta) => {
    if (sashRef.current) {
      const targetRot = isOpen ? -Math.PI / 3 : 0; // Open outward 60 degrees
      sashRef.current.rotation.y = THREE.MathUtils.damp(sashRef.current.rotation.y, targetRot, 4, delta);
    }
  });

  return (
    <>
      <ProfileExtrusion W={W} H={H} t={t} fd={fd} color={FRAME_COLOR} />
      
      {/* Sash hinged on the left */}
      <group position={[pivotX, 0, fd * 0.1]}>
        <group 
          ref={sashRef}
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          onPointerOver={() => document.body.style.cursor = 'pointer'}
          onPointerOut={() => document.body.style.cursor = 'auto'}
        >
          {/* Shift geometry back by pivotX to center it locally */}
          <group position={[iW / 2, 0, 0]}>
            <ProfileExtrusion W={iW} H={iH} t={mt} fd={fd * 0.6} color={SASH_COLOR} />
            <Gasket w={iW - 2 * mt} h={iH - 2 * mt} z={-0.2} />
            <Glass w={iW - 2 * mt} h={iH - 2 * mt} />
            <Handle x={iW / 2 - mt - 0.2} y={0} z={fd * 0.3} />
          </group>
        </group>
      </group>
      
      {/* Visual hinges */}
      <mesh position={[-iW / 2 + 0.1, iH * 0.3, fd * 0.2]}>
        <cylinderGeometry args={[0.15, 0.15, 0.6, 16]} />
        <meshStandardMaterial color="#999" />
      </mesh>
      <mesh position={[-iW / 2 + 0.1, -iH * 0.3, fd * 0.2]}>
        <cylinderGeometry args={[0.15, 0.15, 0.6, 16]} />
        <meshStandardMaterial color="#999" />
      </mesh>
    </>
  );
}

// ─── Wall + Floor context (HDRI) ──────────────────────────────────────────────

function Scene({ W, H }: { W: number; H: number }) {
  return (
    <>
      <Environment preset="apartment" background />
      
      {/* Wall */}
      <mesh position={[0, 0, -12]} receiveShadow>
        <planeGeometry args={[W * 3, H * 2.5]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      
      {/* Floor */}
      <mesh position={[0, -H / 2 - 1.5, -12 + (H * 1.8) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W * 3, H * 2]} />
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
      <ambientLight intensity={0.4} />
      <directionalLight position={[8, 12, 10]} intensity={1.2} castShadow />
      <directionalLight position={[-6, -4, 6]} intensity={0.4} />
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
