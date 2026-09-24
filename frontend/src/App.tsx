import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '@components/ProtectedRoute';
import { useAuthStore } from '@lib/authStore';
import { DashboardPage } from '@pages/DashboardPage';
import { HomePage } from '@pages/HomePage';
import { LoginPage } from '@pages/LoginPage';
import { SignupPage } from '@pages/SignupPage';

export function App() {
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
