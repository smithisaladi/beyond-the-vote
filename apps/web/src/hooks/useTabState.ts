import { useState } from "react";

export function useTabState<T extends string>(opts: {
  defaultValue: T;
}) {
  const [activeTab, setActiveTab] = useState<T>(opts.defaultValue);
  return { activeTab, setActiveTab };
}
