import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { activityResponse } from "@/test/fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

import { ActivityFeed } from "./ActivityFeed";

const items = activityResponse.items;

describe("ActivityFeed", () => {
  it("renders all activity items by default", () => {
    render(<ActivityFeed activityFeed={items} loading={false} isNew={() => false} />);
    expect(screen.getByText(/voted Yea/i)).toBeInTheDocument();
    expect(screen.getByText(/Passed House/i)).toBeInTheDocument();
  });

  it("filters to votes only", async () => {
    render(<ActivityFeed activityFeed={items} loading={false} isNew={() => false} />);
    await userEvent.click(screen.getByRole("button", { name: "Votes" }));
    expect(screen.getByText(/voted Yea/i)).toBeInTheDocument();
    expect(screen.queryByText(/Passed House/i)).not.toBeInTheDocument();
  });

  it("filters to bills only", async () => {
    render(<ActivityFeed activityFeed={items} loading={false} isNew={() => false} />);
    await userEvent.click(screen.getByRole("button", { name: "Bills" }));
    expect(screen.getByText(/Passed House/i)).toBeInTheDocument();
    expect(screen.queryByText(/voted Yea/i)).not.toBeInTheDocument();
  });

  it("shows skeleton while loading", () => {
    const { container } = render(
      <ActivityFeed activityFeed={[]} loading={true} isNew={() => false} />
    );
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
