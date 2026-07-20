import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import './globals.css'

// Manrope i.p.v. Inter: strak en modern, maar met eigen karakter — Inter (en
// Geist/Roboto/Plus Jakarta) zijn dé herkenbare "AI-gegenereerd"-tells.
// Via next/font wordt het lettertype zelf-gehost: geen render-blokkerende
// Google-request en geen font-flikkering bij het laden.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NextGenMedia Portal',
  description: 'Operations platform voor NextGenMedia',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={manrope.variable}>
      <body>{children}</body>
    </html>
  )
}
