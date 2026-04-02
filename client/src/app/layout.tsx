import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Healthcare AI Dashboard | No-Show Prediction',
  description:
    'Real-time AI-powered appointment no-show risk monitoring for healthcare providers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <header
          style={{
            background:
              'linear-gradient(135deg, #0f1117 0%, #1a1d27 50%, #0f1117 100%)',
            borderBottom: '1px solid #2a2f45',
            padding: '1rem 2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {/* Pulse icon */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 700,
                background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
              }}
            >
              HealthAI Platform
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: '0.72rem',
                color: '#64748b',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              No-Show Prediction Dashboard
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Live</span>
          </div>
        </header>

        <main style={{ padding: '2rem' }}>{children}</main>

        <footer
          style={{
            borderTop: '1px solid #2a2f45',
            padding: '1rem 2rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#475569',
          }}
        >
          Healthcare AI Platform &copy; {new Date().getFullYear()} — Engineering
          Cloud Computing
        </footer>
      </body>
    </html>
  );
}
