import { ImageResponse } from 'next/og'

export const alt =
  'Greenwich Utility Watch — a community record of problem utility poles in Greenwich, CT'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0f172a',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '34px',
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            ⚡
          </div>
          <div style={{ fontSize: '30px', color: '#94a3b8', letterSpacing: '2px' }}>
            GREENWICH COMMUNITY REPORTING
          </div>
        </div>
        <div style={{ fontSize: '76px', fontWeight: 700, lineHeight: 1.1 }}>
          Greenwich Utility Watch
        </div>
        <div
          style={{
            fontSize: '34px',
            color: '#cbd5e1',
            marginTop: '28px',
            lineHeight: 1.4,
          }}
        >
          Photo-document unsafe, unstable, or unsightly utility poles.
        </div>
        <div
          style={{
            fontSize: '28px',
            color: '#f59e0b',
            marginTop: '40px',
            fontWeight: 600,
          }}
        >
          Snap it. Report it. Build the public record.
        </div>
      </div>
    ),
    { ...size }
  )
}
