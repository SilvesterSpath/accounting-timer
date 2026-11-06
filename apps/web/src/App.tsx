import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppRouter } from "./platform/router";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SmokePage } from "./pages/SmokePage";
import { WorkPage } from "./pages/WorkPage";

export function App() {
  return (
    <AppRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/smoke" element={<SmokePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<WorkPage />} />
        </Routes>
      </AuthProvider>
    </AppRouter>
  );
}
