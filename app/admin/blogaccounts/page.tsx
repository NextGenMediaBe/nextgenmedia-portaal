export const dynamic = 'force-dynamic'

import { BlogAccountsManager } from './blog-accounts-manager'

export default function BlogAccountsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Blogaccounts</h1>
        <p className="text-sm text-gray-500 mt-0.5">Beheer blog/Framer-accounts. Een account kan zelfstandig bestaan of optioneel aan een klant gekoppeld zijn.</p>
      </div>
      <BlogAccountsManager />
    </div>
  )
}
