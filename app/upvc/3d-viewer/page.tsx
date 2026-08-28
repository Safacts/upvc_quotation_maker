"use client";

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Box, 
  LogIn, 
  AlertCircle, 
  ArrowLeft, 
  RotateCcw, 
  Sparkles
} from 'lucide-react';

interface MeasuredItem {
  id?: string;
  description: string;
  width?: number | string;
  height?: number | string;
  units?: number;
  rate?: number;
  glass?: string;
}

interface QuotationData {
  id: string;
  quote_no?: string;
  customer_name?: string;
  client_id?: string;
}

function WindowFrame({ width, height, depth, color = "#CD4A12" }: { width: number; height: number; depth: number; color?: string }) {
  const group = useRef<THREE.Group>(null);

  return (
    <group ref={group}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0, height / 2, depth / 2 - 1]}>
        <boxGeometry args={[Math.max(0.1, width - 0.8), Math.max(0.1, height - 0.8), 2]} />
        <meshStandardMaterial color="#EA580C" roughness={0.4} metalness={0.1} />
      </mesh>
    </group>
  );
}

function GlassPanel({ width, height }: { width: number; height: number }) {
  return (
    <mesh position={[0, height / 2, 0.2]}>
      <planeGeometry args={[width, height]} />
      <meshPhysicalMaterial 
        color="#BAE6FD" 
        transparent 
        opacity={0.35} 
        roughness={0.05} 
        transmission={0.9} 
        thickness={0.5} 
        side={THREE.DoubleSide} 
      />
    </mesh>
  );
}

function Window3D({ design, autoRotate }: { design: any; autoRotate: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const dimensions = design.dimensions || { width_mm: 1200, height_mm: 1500, configuration: 'fixed' };
  const w = (dimensions.width_mm || 1200) / 100;
  const h = (dimensions.height_mm || 1500) / 100;
  const fd = 6;

  useFrame((_, delta) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[15, 20, 10]} intensity={1.5} />
      <directionalLight position={[-15, -10, -10]} intensity={0.6} />
      <pointLight position={[0, h, 10]} intensity={0.8} />

      <WindowFrame width={w} height={h} depth={fd} />
      <GlassPanel width={Math.max(1, w - fd * 1.5)} height={Math.max(1, h - fd * 1.5)} />

      <Html position={[0, -2.5, 0]} center>
        <div style={{
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          color: '#ffffff',
          padding: '8px 14px',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          whiteSpace: 'nowrap',
          fontSize: '12px',
          fontWeight: 600
        }}>
          <span style={{ color: '#f97316' }}>{dimensions.width_mm} × {dimensions.height_mm} mm</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span style={{ textTransform: 'capitalize', color: '#cbd5e1' }}>{dimensions.configuration || 'Fixed'}</span>
        </div>
      </Html>
    </group>
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        gap: '12px',
        color: '#EA580C', 
        fontSize: '14px', 
        fontWeight: 600,
        background: 'rgba(255,255,255,0.9)',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
      }}>
        <div>Generating 3D Model...</div>
      </div>
    </Html>
  );
}

function ViewerContent() {
  const searchParams = useSearchParams();
  const designId = searchParams.get('designId');
  const fromQuotation = searchParams.get('fromQuotation');

  const [design, setDesign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [quotation, setQuotation] = useState<QuotationData | null>(null);
  const [measuredItems, setMeasuredItems] = useState<MeasuredItem[]>([]);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [configType, setConfigType] = useState<string>('fixed');
  const [autoRotate, setAutoRotate] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string>('');

  useEffect(() => {
    if (!designId && !fromQuotation) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setAuthRequired(false);
      setNotFound(false);
      setErrorDetails('');

      try {
        if (designId) {
          const res = await fetch(`/api/console/3d/designs/${designId}`, { credentials: 'include' });
          if (res.status === 401) {
            setAuthRequired(true);
            return;
          }
          if (res.status === 404) {
            setNotFound(true);
            return;
          }
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || `Failed to load design (${res.status})`);
          }
          const data = await res.json();
          setDesign(data);
        } else if (fromQuotation) {
          const qRes = await fetch(`/api/console/quotations/${fromQuotation}`, { credentials: 'include' });
          if (qRes.status === 401) {
            setAuthRequired(true);
            return;
          }
          if (qRes.status === 404) {
            setNotFound(true);
            return;
          }
          if (!qRes.ok) {
            const errData = await qRes.json().catch(() => ({}));
            throw new Error(errData?.error || `Failed to load quotation (${qRes.status})`);
          }

          const qData = await qRes.json();
          const q = qData && qData.quotation;
          setQuotation(q);

          const measured: MeasuredItem[] = qData.measured_items || [];
          setMeasuredItems(measured);

          const validItems = measured.filter((m) => Number(m.width) > 0 && Number(m.height) > 0);
          
          if (validItems.length > 0) {
            const targetItem = validItems[selectedItemIndex] || validItems[0];
            const width_mm = Number(targetItem.width) || 1200;
            const height_mm = Number(targetItem.height) || 1500;

            const cfgRes = await fetch('/api/console/3d/configurator', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                width_mm,
                height_mm,
                type: configType || 'fixed',
                name: `${targetItem.description || 'Window'} (${q?.quote_no || 'Quote'})`,
              }),
            });

            if (!cfgRes.ok) {
              const cfgData = await cfgRes.json().catch(() => ({}));
              throw new Error(cfgData?.error || 'Configurator failed to create 3D window');
            }

            const cfgData = await cfgRes.json();
            setDesign(cfgData.design);
          } else {
            setDesign(null);
          }
        }
      } catch (err: any) {
        setErrorDetails(err?.message || 'Error processing 3D model');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [designId, fromQuotation, selectedItemIndex, configType]);

  const loadDemoWindow = async () => {
    try {
      setLoading(true);
      setErrorDetails('');
      const cfgRes = await fetch('/api/console/3d/configurator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          width_mm: 1500,
          height_mm: 1200,
          type: configType,
          name: 'Demo uPVC Casement Window',
        }),
      });
      const cfgData = await cfgRes.json();
      if (cfgData.design) {
        setDesign(cfgData.design);
      }
    } catch {
      setDesign({
        dimensions: { width_mm: 1500, height_mm: 1200, configuration: configType },
        name: 'Demo Window'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        gap: '16px'
      }}>
        <div style={{ fontSize: '15px', color: '#94a3b8', fontWeight: 500 }}>Loading 3D Visualizer...</div>
      </div>
    );
  }

  if (authRequired) {
    const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#090d16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          maxWidth: '440px',
          width: '100%',
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '32px 28px',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          color: '#f8fafc'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(234, 88, 12, 0.15)',
            border: '1px solid rgba(234, 88, 12, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            color: '#f97316'
          }}>
            <LogIn size={26} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
            Console Login Required
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 24px 0' }}>
            To view this quotation's 3D window designs, please sign in with your fabricator account.
          </p>
          <a
            href={`/login?next=${encodeURIComponent(currentUrl)}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '12px 20px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(234, 88, 12, 0.4)'
            }}
          >
            <LogIn size={16} /> Sign In to Console
          </a>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#090d16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          maxWidth: '440px',
          width: '100%',
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '32px 28px',
          textAlign: 'center',
          color: '#f8fafc'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            color: '#ef4444'
          }}>
            <AlertCircle size={26} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
            Quotation Not Found
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 24px 0' }}>
            The requested quotation ID does not exist or belongs to another tenant account.
          </p>
          <button
            onClick={() => window.history.back()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '12px 20px',
              borderRadius: '12px',
              background: '#334155',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  if (fromQuotation && quotation && (!measuredItems || measuredItems.length === 0 || !design)) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#090d16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '32px 28px',
          textAlign: 'center',
          color: '#f8fafc'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(249, 115, 22, 0.15)',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            color: '#f97316'
          }}>
            <Box size={26} />
          </div>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#f97316', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '4px' }}>
            Quote #{quotation.quote_no || 'Draft'}
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
            No Measured Openings Found
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 24px 0' }}>
            This quotation currently has no measured items with width and height. Add openings in the quotation editor to generate custom 3D models.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={loadDemoWindow}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '12px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.4)'
              }}
            >
              <Sparkles size={16} /> Preview Demo 3D Window
            </button>
            <button
              onClick={() => window.history.back()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '12px 20px',
                borderRadius: '12px',
                background: '#334155',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              <ArrowLeft size={16} /> Return to Quotation
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!design) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#090d16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          maxWidth: '440px',
          width: '100%',
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '32px 28px',
          textAlign: 'center',
          color: '#f8fafc'
        }}>
          <Box size={32} color="#f97316" style={{ margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0' }}>3D Window Visualizer</h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 20px 0' }}>
            Pass <code style={{ color: '#fdba74' }}>?fromQuotation=ID</code> or <code style={{ color: '#fdba74' }}>?designId=ID</code> to view a model.
          </p>
          <button
            onClick={loadDemoWindow}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              background: '#ea580c',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            Launch Interactive Demo Window
          </button>
        </div>
      </div>
    );
  }

  const dimensions = design.dimensions || { width_mm: 1200, height_mm: 1500, configuration: 'fixed' };
  const cameraZ = Math.max(dimensions.width_mm || 1200, dimensions.height_mm || 1500) / 25 + 90;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0b1120' }}>
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        right: '16px',
        zIndex: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none'
      }}>
        <div style={{
          pointerEvents: 'auto',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          color: '#ffffff'
        }}>
          <button
            onClick={() => window.history.back()}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f97316' }}>
              {quotation ? `Quote #${quotation.quote_no || 'Quotation'}` : (design.name || '3D Window Design')}
            </div>
            {quotation?.customer_name && (
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Customer: {quotation.customer_name}
              </div>
            )}
          </div>
        </div>

        <div style={{
          pointerEvents: 'auto',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          color: '#ffffff'
        }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px' }}>
            {['fixed', 'sliding', 'casement', 'tilt_turn'].map((type) => (
              <button
                key={type}
                onClick={() => setConfigType(type)}
                style={{
                  background: configType === type ? '#ea580c' : 'transparent',
                  color: configType === type ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease'
                }}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            style={{
              background: autoRotate ? 'rgba(234, 88, 12, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: '1px solid',
              borderColor: autoRotate ? '#ea580c' : 'transparent',
              borderRadius: '8px',
              color: autoRotate ? '#f97316' : '#94a3b8',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            <RotateCcw size={12} /> {autoRotate ? 'Rotating' : 'Paused'}
          </button>
        </div>
      </div>

      {measuredItems.length > 1 && (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          maxWidth: '90vw',
          overflowX: 'auto'
        }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', padding: '0 8px', fontWeight: 600 }}>Openings:</span>
          {measuredItems.map((item, idx) => (
            <button
              key={item.id || idx}
              onClick={() => setSelectedItemIndex(idx)}
              style={{
                background: selectedItemIndex === idx ? '#ea580c' : 'rgba(255, 255, 255, 0.08)',
                color: selectedItemIndex === idx ? '#ffffff' : '#cbd5e1',
                border: 'none',
                borderRadius: '12px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              #{idx + 1} ({item.width}×{item.height}mm)
            </button>
          ))}
        </div>
      )}

      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: 45 }}
        style={{ height: '100vh', width: '100vw', background: 'radial-gradient(circle at center, #1e293b 0%, #090d16 100%)' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Window3D design={design} autoRotate={autoRotate} />
          <OrbitControls 
            enablePan 
            enableZoom 
            enableRotate 
            maxDistance={600} 
            minDistance={40} 
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{
          height: '100vh',
          width: '100vw',
          background: '#090d16',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f8fafc',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div>Initializing 3D Viewer...</div>
        </div>
      }
    >
      <ViewerContent />
    </Suspense>
  );
}
