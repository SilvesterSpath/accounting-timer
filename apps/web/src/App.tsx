import { Route, Routes } from "react-router-dom";
import { AppRouter } from "./platform/router";
import { HomePage } from "./pages/HomePage";
import { SmokePage } from "./pages/SmokePage";

export function App() {
  return (
    <AppRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/smoke" element={<SmokePage />} />
      </Routes>
    </AppRouter>
  );
}
