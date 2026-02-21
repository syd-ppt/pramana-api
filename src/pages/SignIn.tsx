import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import Button from '@/components/Button';
import SignInButtons from '@/components/SignInButtons';

export default function SignIn() {
  const { session, status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/cli-token', { replace: true });
    }
  }, [status, navigate]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-600 rounded-full"></div>
      </div>
    );
  }

  if (session) return null;

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

          <SignInButtons providers={["github", "google"]} />

          <div className="mt-8 text-center text-sm text-slate-600">
            <p>
              By signing in, you agree to link your eval submissions to your
              account for personalized tracking.
            </p>
            <p className="mt-4">
              <Button href="/" variant="ghost" size="sm">
                Continue without signing in
              </Button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
