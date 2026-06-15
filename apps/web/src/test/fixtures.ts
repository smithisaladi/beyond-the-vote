export const billsResponse = {
  bills: [
    {
      id: "hr1-118", number: "H.R. 1", title: "Clean Water Restoration Act",
      sponsor: "Jane Doe", party: "Democrat", status: "Active",
      topics: ["environment"], lastAction: "2023-04-01", summary: "Protects water.",
    },
  ],
  pagination: { total: 1, limit: 20, offset: 0 },
};

export const emptyBillsResponse = {
  bills: [],
  pagination: { total: 0, limit: 20, offset: 0 },
};

export const activityResponse = {
  items: [
    {
      id: "vote-v1-L000001", politician: "Jane Doe", action: "voted Yea",
      subject: "Clean Water Act", date: "Mar 10, 2023", timestamp: 1678406400000,
      href: "/bills/hr1-118", isAlert: false,
    },
    {
      id: "action-7", politician: null, action: "Passed House",
      subject: "H.R. 1 — Clean Water Act", date: "Mar 15, 2023", timestamp: 1678838400000,
      href: "/bills/hr1-118", isAlert: true,
    },
  ],
  lastSeenAt: null,
};
