import type { Metadata } from 'next'
import { Cormorant } from 'next/font/google'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

const cormorant = Cormorant({
  subsets: ['latin'],
  variable: '--font-cormorant',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Aurvex \u00b7 Judas \u00d7 SMC Dashboard',
  description: 'Live XAU/USD signal analysis with Smart Money Concepts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${cormorant.variable} ${GeistMono.variable}`}>
      <body className="bg-zinc-950 text-zinc-300 antialiased">
        {children}
      </body>
    </html>
  )
}
