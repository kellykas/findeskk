import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — FinDesk" },
      { name: "description", content: "Ledger-reconciled operational and financial reports." },
      { property: "og:title", content: "Reports — FinDesk" },
      { property: "og:description", content: "Ledger-reconciled operational and financial reports." },
    ],
  }),
  component: () => <ModulePlaceholder path="/reports" />,
});
