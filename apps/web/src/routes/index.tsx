import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div style={{ background: "#F5F0E8", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2.5rem", color: "#1C1C1A" }}>Beyond the Ballot</h1>
        <p style={{ color: "#1C1C1A", opacity: 0.6 }}>Political transparency app</p>
      </div>
    </div>
  );
}
