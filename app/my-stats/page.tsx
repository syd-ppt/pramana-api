import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Button from "@/components/Button"
import type { UserStatsResponse } from "@/lib/types"

async function fetchUserStats(token: string): Promise<UserStatsResponse | null> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL
    if (!apiUrl) return null

    const res = await fetch(`${apiUrl}/api/user/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (!res.ok) return null
    return await res.json() as UserStatsResponse
  } catch {
    return null
  }
}

export default async function MyStatsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/my-stats')
  }

  const userId = session.user.id

  const cookieStore = cookies()
  const token =
    cookieStore.get("__Secure-next-auth.session-token")?.value ??
    cookieStore.get("next-auth.session-token")?.value ??
    ""

  const stats = await fetchUserStats(token)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white shadow-sm rounded-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Your Statistics
          </h1>
          <p className="text-base text-slate-700">
            Compare your eval results against the crowd
          </p>
        </div>

        {!stats ? (
          <div className="bg-amber-50 border-l-4 border-amber-600 p-6 mb-8">
            <h2 className="font-semibold text-amber-950 mb-2">
              Unable to load statistics
            </h2>
            <p className="text-sm text-amber-950">
              Stats service is unavailable. Your submissions are still being tracked under user ID:{" "}
              <code className="bg-amber-900 text-amber-50 px-2 py-1 rounded font-mono text-sm">{userId}</code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Total Submissions
              </h2>
              <p className="text-4xl font-bold text-slate-900">{stats.total_submissions}</p>
              <p className="text-sm text-slate-600 mt-2">
                Last run: {stats.last_submission ? new Date(stats.last_submission).toLocaleDateString() : "Never"}
              </p>
            </div>

            <div className="bg-white shadow-sm rounded-lg p-6">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Models Tested
              </h2>
              <p className="text-4xl font-bold text-slate-900">{stats.models_count}</p>
              <p className="text-sm text-slate-600 mt-2">
                {stats.models_tested.length > 0 ? stats.models_tested.join(", ") : "None yet"}
              </p>
            </div>

            <div className="bg-white shadow-sm rounded-lg p-6">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                User ID
              </h2>
              <p className="text-lg font-mono font-bold text-slate-900 break-all">{userId}</p>
              <p className="text-sm text-slate-600 mt-2">
                Linked to your OAuth account
              </p>
            </div>
          </div>
        )}

        <div className="bg-white shadow-sm rounded-lg p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Recent Submissions
          </h2>
          <p className="text-slate-600">
            {stats && stats.total_submissions > 0
              ? `${stats.total_submissions} submissions recorded across ${stats.models_count} model(s).`
              : <>No submissions yet. Run{" "}
                  <code className="bg-slate-800 text-slate-100 px-2 py-1 rounded font-mono text-sm">
                    pramana run --tier cheap --model gpt-4
                  </code>{" "}
                  to get started.</>
            }
          </p>
        </div>

        <div className="mt-8 text-center">
          <Button href="/cli-token" variant="ghost" size="md">
            ← Back to CLI Token
          </Button>
        </div>
      </div>
    </div>
  )
}
