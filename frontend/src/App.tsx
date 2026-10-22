import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '@components/ProtectedRoute';
import { useAuthStore } from '@lib/authStore';
import { AppShell } from '@components/app/AppShell';
import { BoardPage } from '@pages/BoardPage';
import { ForgotPasswordPage } from '@pages/ForgotPasswordPage';
import { HomePage } from '@pages/HomePage';
import { LoginPage } from '@pages/LoginPage';
import { ResetPasswordPage } from '@pages/ResetPasswordPage';
import { SignupPage } from '@pages/SignupPage';
import { VerifyEmailPage } from '@pages/VerifyEmailPage';
import { WorkspacesPage } from '@pages/WorkspacesPage';

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
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<WorkspacesPage />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
