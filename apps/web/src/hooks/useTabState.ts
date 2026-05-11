import { useState } from "react";

export function useTabState<T extends string>(opts: {
  paramName?: string;
  defaultValue: T;
  validValues?: T[];
}) {
  const [activeTab, setActiveTab] = useState<T>(opts.defaultValue);
  return { activeTab, setActiveTab };
}
