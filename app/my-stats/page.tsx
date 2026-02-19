import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Button from "@/components/Button"

export default async function MyStatsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/my-stats')
  }

  const userId = (session.user as any)?.id

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* You vs Crowd Card */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Your Pass Rate
            </h2>
            <p className="text-4xl font-bold text-slate-900">---%</p>
            <p className="text-sm text-slate-600 mt-2">
              Crowd: ---%
            </p>
          </div>

          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Total Submissions
            </h2>
            <p className="text-4xl font-bold text-slate-900">---</p>
            <p className="text-sm text-slate-600 mt-2">
              Last run: ---
            </p>
          </div>

          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Models Tested
            </h2>
            <p className="text-4xl font-bold text-slate-900">---</p>
            <p className="text-sm text-slate-600 mt-2">
              Most tested: ---
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mb-8">
          <h2 className="font-semibold text-blue-950 mb-2 flex items-center gap-2">
            <span className="text-2xl">🚧</span> Dashboard Under Construction
          </h2>
          <p className="text-sm text-blue-950 mb-4">
            This personalized dashboard will show:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-900">
            <li>Your pass rates vs crowd averages</li>
            <li>Performance trends over time</li>
            <li>Model-specific comparisons</li>
            <li>Drift detection insights</li>
          </ul>
          <p className="text-sm text-blue-950 mt-4">
            Your submissions are being tracked under user ID:{" "}
            <code className="bg-blue-900 text-blue-50 px-2 py-1 rounded font-mono text-sm">{userId}</code>
          </p>
        </div>

        <div className="bg-white shadow-sm rounded-lg p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Recent Submissions
          </h2>
          <p className="text-slate-600">
            No submissions yet. Run{" "}
            <code className="bg-slate-800 text-slate-100 px-2 py-1 rounded font-mono text-sm">
              pramana run --tier cheap --model gpt-4
            </code>{" "}
            to get started.
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
