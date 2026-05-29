'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { useTransition } from 'react'

export function ClientsSearch({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  return (
    <div className="relative max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        type="search"
        defaultValue={defaultValue}
        placeholder="Zoek klant..."
        className="input-base pl-9"
        onChange={(e) => {
          startTransition(() => {
            const params = new URLSearchParams()
            if (e.target.value) params.set('q', e.target.value)
            router.replace(`${pathname}?${params.toString()}`)
          })
        }}
      />
    </div>
  )
}
