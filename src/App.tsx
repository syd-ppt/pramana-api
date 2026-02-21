import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from '@/lib/auth';
import Navigation from '@/components/Navigation';
import Home from '@/pages/Home';
import SignIn from '@/pages/SignIn';
import CliToken from '@/pages/CliToken';
import MyStats from '@/pages/MyStats';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/signin" element={<SignIn />} />
          <Route path="/cli-token" element={<CliToken />} />
          <Route path="/my-stats" element={<MyStats />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
