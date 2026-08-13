export const dynamic = 'force-dynamic'

import { MailOverview } from './mail-overview'

// Overzicht van de herinneringsmails: wat staat klaar, wanneer precies, en is
// het aangekomen. De status komt rechtstreeks bij Resend vandaan.
export default function SalesMailsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Herinneringsmails</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Wat er nog uitgaat, op welk moment precies, en wat er al vertrokken is.
        </p>
      </div>
      <MailOverview />
    </div>
  )
}
