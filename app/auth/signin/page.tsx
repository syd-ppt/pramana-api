import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Button from "@/components/Button"
import SignInButtons from "@/components/SignInButtons"

export default async function SignInPage() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/cli-token')
  }

  const providerIds = authOptions.providers.map((p) => p.id)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <div className="bg-white shadow-sm rounded-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Sign In to Pramana
            </h1>
            <p className="text-base text-slate-700">
              Link your eval submissions to your account
            </p>
          </div>

          <SignInButtons providers={providerIds} />

          <div className="mt-8 text-center text-sm text-slate-600">
            <p>
              By signing in, you agree to link your eval submissions to your
              account for personalized tracking.
            </p>
            <p className="mt-4">
              <Button href="/" variant="ghost" size="sm">
                Continue without signing in →
              </Button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
