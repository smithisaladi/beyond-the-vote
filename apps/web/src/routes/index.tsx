import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthContext";
import { LandingPage } from "@/components/landing/LandingPage";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/home" });
    }
  }, [user, loading, navigate]);

  if (loading || user) {
    return (
      <div style={{ background: "#F5F0E8", minHeight: "100vh" }} />
    );
  }

  return <LandingPage />;
}
