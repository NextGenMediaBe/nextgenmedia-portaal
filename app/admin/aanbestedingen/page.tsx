export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Stamp } from 'lucide-react'

// Aanbestedingen — Belgische overheidsopdrachten opvolgen.
// Stap 1 en 2 van de opbouw staan er: datamodel, rol en filterlink. Het
// ophalen, scoren en analyseren volgt in de volgende stappen.
export default function AanbestedingenPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Stamp className="h-6 w-6" />Aanbestedingen
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Belgische overheidsopdrachten die bij ons passen, met een score en een uitgewerkt dossier.
        </p>
      </div>

      <div className="card-base space-y-3">
        <h2 className="font-semibold text-gray-900">Deze module is in opbouw</h2>
        <p className="text-sm text-gray-600">
          Het datamodel staat klaar en de rol <b>Aanbestedingen</b> is toewijsbaar. De volgende stap is de
          koppeling met publicprocurement.be: opdrachten ophalen, scoren en de bestekken uitlezen.
        </p>
        <div className="text-sm text-gray-600">
          <div className="font-medium text-gray-900 mb-1">Wat je nu al kan doen</div>
          <ol className="list-decimal ml-5 space-y-1">
            <li>De migratie draaien in Supabase.</li>
            <li>
              Bij <Link href="/admin/werknemers" className="underline">Werknemers</Link> iemand de rol
              <b> Aanbestedingen</b> geven en zijn filterlink van publicprocurement.be invullen.
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
