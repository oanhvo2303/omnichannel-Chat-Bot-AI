import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#09090b',
          borderRadius: '22%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Outer glow ring */}
        <div style={{
          position: 'absolute',
          width: '380px',
          height: '380px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
          display: 'flex',
        }} />
        {/* Main icon bg */}
        <div style={{
          width: '320px',
          height: '320px',
          borderRadius: '80px',
          background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 80px rgba(99,102,241,0.5)',
        }}>
          {/* Bot face */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            {/* Eyes */}
            <div style={{ display: 'flex', gap: '32px' }}>
              <div style={{ width: '52px', height: '52px', background: 'white', borderRadius: '12px', opacity: 0.95 }} />
              <div style={{ width: '52px', height: '52px', background: 'white', borderRadius: '12px', opacity: 0.95 }} />
            </div>
            {/* Mouth */}
            <div style={{ width: '140px', height: '24px', background: 'white', borderRadius: '12px', opacity: 0.85 }} />
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
