'use client'

import { Printer } from 'lucide-react'

export function PrintButton({ label = 'Afdrukken / Opslaan als PDF' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  )
}
