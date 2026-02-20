import { getServerSession } from "next-auth"
import { authOptions, extractSessionToken } from "@/lib/auth"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import CopyButton from "@/components/CopyButton"
import Button from "@/components/Button"

export default async function CLITokenPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/cli-token')
  }

  const cookieStore = cookies()
  const token = extractSessionToken(cookieStore)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white shadow-sm rounded-lg p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            Your CLI Token
          </h1>

          <p className="text-base text-slate-700 mb-6">
            Use this token to authenticate the Pramana CLI and link your submissions
            to your account.
          </p>

          <div className="bg-slate-800 rounded-lg p-4 mb-6 relative">
            <code className="text-slate-100 break-all font-mono text-sm">
              {token}
            </code>
            <CopyButton text={token} />
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mb-6">
            <h2 className="font-semibold text-blue-950 mb-2">
              Setup Instructions
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-950">
              <li>Copy the token above</li>
              <li>Open your terminal</li>
              <li>Run: <code className="bg-slate-800 text-slate-100 px-2 py-1 rounded font-mono text-sm">pramana login</code></li>
              <li>Paste the token when prompted</li>
            </ol>
          </div>

          <div className="bg-amber-50 border-l-4 border-amber-600 p-4">
            <h2 className="font-semibold text-amber-950 mb-2">
              Security Notice
            </h2>
            <p className="text-sm text-amber-950">
              This token is your session credential — treat it like a password.
              It expires when your browser session ends. Do not share it publicly.
              Revoke access anytime by signing out.
            </p>
          </div>

          <div className="mt-8 text-center">
            <Button href="/my-stats" variant="ghost" size="md">
              View Your Stats →
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
