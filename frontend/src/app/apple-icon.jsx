import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        background: '#09090b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '140px',
          height: '140px',
          borderRadius: '34px',
          background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '14px' }}>
              <div style={{ width: '24px', height: '24px', background: 'white', borderRadius: '6px' }} />
              <div style={{ width: '24px', height: '24px', background: 'white', borderRadius: '6px' }} />
            </div>
            <div style={{ width: '62px', height: '12px', background: 'white', borderRadius: '6px', opacity: 0.85 }} />
          </div>
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
