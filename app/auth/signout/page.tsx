'use client'

import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

export default function SignOutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await supabaseBrowser().auth.signOut()
        router.replace('/login')
      }}
      className="text-sm text-slate-400 hover:text-slate-200"
    >
      Sign out
    </button>
  )
}
