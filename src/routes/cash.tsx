import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/cash")({
  head: () => ({
    meta: [
      { title: "Cash & Float — FinDesk" },
      { name: "description", content: "Manage tills, safes, mobile money float and reconciliation." },
      { property: "og:title", content: "Cash & Float — FinDesk" },
      { property: "og:description", content: "Manage tills, safes, mobile money float and reconciliation." },
    ],
  }),
  component: () => <ModulePlaceholder path="/cash" />,
});
