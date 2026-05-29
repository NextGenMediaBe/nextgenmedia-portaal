'use client'

import { Printer } from 'lucide-react'

export function ContractPrintButton({ pdfUrl }: { pdfUrl: string }) {
  const handlePrint = () => {
    // Open in new tab and trigger print dialog
    const win = window.open(pdfUrl, '_blank')
    if (win) {
      win.addEventListener('load', () => {
        win.print()
      })
    }
  }

  return (
    <button
      onClick={handlePrint}
      className="text-xs text-gray-500 hover:text-black flex items-center gap-1 transition-colors"
    >
      <Printer className="h-3 w-3" />
      Afdrukken
    </button>
  )
}
