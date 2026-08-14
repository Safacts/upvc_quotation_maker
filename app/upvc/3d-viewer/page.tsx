"use client";

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function WindowFrame({ width, height, depth }) {
  const group = useRef(null);

  useFrame(() => {
    if (group.current) {
      group.current.rotation.y += 0.001;
    }
  });

  return (
    <group ref={group}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#CD4A12" />
      </mesh>
      <mesh position={[0, height / 2, depth / 2 - 2]}>
        <boxGeometry args={[width, height, 4]} />
        <meshStandardMaterial color="#EA580C" />
      </mesh>
    </group>
  );
}

function GlassPanel({ width, height }) {
  return (
    <mesh position={[0, height / 2, 0.5]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#87CEEB" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Window3D({ design }) {
  const dimensions = design.dimensions;
  const w = dimensions.width_mm / 100;
  const h = dimensions.height_mm / 100;
  const fd = 6;

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <WindowFrame width={w} height={h} depth={fd} />
      <GlassPanel width={w - fd * 2} height={h - fd * 2 - 2} />
      <Html position={[0, -5, 0]}>
        <div style={{ background: 'rgba(255,255,255,0.9)', padding: '8px 16px', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
            {dimensions.width_mm} × {dimensions.height_mm} mm
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>{dimensions.configuration}</div>
        </div>
      </Html>
    </>
  );
}

function LoadingFallback() {
  return (
    <Html>
      <div style={{ color: '#EA580C', fontSize: '16px' }}>Loading 3D model...</div>
    </Html>
  );
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
  const canvasRef = useRef(null);

  // The API GET returns { design, order, renders } — never a flat design object.
  // `?designId=X` loads a saved design; `?fromQuotation=Y` derives one from the
  // quotation's first measured opening via the configurator.
  const searchParams = useSearchParams();
  const designId = (searchParams.get("designId") ?? "").trim();
  const fromQuotationId = (searchParams.get("fromQuotation") ?? "").trim();

  useEffect(() => {
    let cancelled = false;

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
            setError("No measurable opening found on this quotation");
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

  if (!design) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>No design found. Pass ?designId=XXX or ?fromQuotation=XXX to view.</div>
      </div>
    );
  }

  const cameraZ = Math.max(design.dimensions.width_mm, design.dimensions.height_mm) / 30 + 100;

  return (
    <Canvas
      ref={canvasRef}
      camera={{ position: [0, 0, cameraZ] }}
      style={{ height: '100vh', width: '100vw', background: '#f8f4f0' }}
    >
      <Suspense fallback={<LoadingFallback />}>
        <Window3D design={design} />
        <OrbitControls enablePan enableZoom enableRotate maxDistance={500} minDistance={50} />
      </Suspense>
    </Canvas>
  );
}
