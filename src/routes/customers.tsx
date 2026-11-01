import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers — FinDesk" },
      { name: "description", content: "Customer records and transaction history." },
      { property: "og:title", content: "Customers — FinDesk" },
      { property: "og:description", content: "Customer records and transaction history." },
    ],
  }),
  component: () => <ModulePlaceholder path="/customers" />,
});
