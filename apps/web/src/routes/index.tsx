import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthContext";
import DashboardPage from "@/components/dashboard/DashboardPage";
import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ background: "#F5F0E8", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#1C1C1A", opacity: 0.5 }}>Loading...</p>
      </div>
    );
  }

  return user ? <DashboardPage /> : <LandingPage />;
}
