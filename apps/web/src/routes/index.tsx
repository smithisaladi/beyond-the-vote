import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div>
      <h1>Beyond the Ballot</h1>
      <p>Political transparency app</p>
    </div>
  ),
});
