export const dynamic = 'force-dynamic'

import { CmsManager } from './cms-manager'

export default function CmsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">CMS Manager</h1>
        <p className="text-sm text-gray-500 mt-0.5">Centraal overzicht van alle blogaccounts, Framer-projecten, publicaties en aandachtspunten.</p>
      </div>
      <CmsManager />
    </div>
  )
}
