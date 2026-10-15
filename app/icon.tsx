import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          borderRadius: '14px',
          color: '#f59e0b',
          fontSize: '40px',
          fontWeight: 700,
        }}
      >
        ⚡
      </div>
    ),
    { ...size }
  )
}
