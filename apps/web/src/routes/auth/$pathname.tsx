import { createFileRoute } from "@tanstack/react-router";
import { AuthView } from "@neondatabase/auth-ui";

export const Route = createFileRoute("/auth/$pathname")({
  component: AuthPage,
});

function AuthPage() {
  const { pathname } = Route.useParams();
  return (
    <div style={{
      background: "#F5F0E8",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <AuthView pathname={pathname} />
      </div>
    </div>
  );
}
