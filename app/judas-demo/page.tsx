import { fetchJudasSignal } from '@/lib/judas/fetchJudasSignal'
import JudasSMCDashboard from '@/components/judas/JudasSMCDashboard'

export const revalidate = 60

export default async function JudasDemoPage() {
  const signal = await fetchJudasSignal()
  return (
    <main className="min-h-screen bg-zinc-950 p-6">
      <JudasSMCDashboard signal={signal} />
    </main>
  )
}
