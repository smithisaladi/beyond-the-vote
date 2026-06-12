import { createFileRoute } from "@tanstack/react-router";
import { AuthView } from "@neondatabase/auth-ui";

export const Route = createFileRoute("/auth/$pathname")({
  component: AuthPage,
});

function AuthPage() {
  const { pathname } = Route.useParams();
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-[400px]">
        <AuthView pathname={pathname} />
      </div>
    </div>
  );
}
