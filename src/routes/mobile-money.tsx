import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/mobile-money")({
  head: () => ({
    meta: [
      { title: "Mobile Money — FinDesk" },
      { name: "description", content: "Record MTN and Airtel agency deposits and withdrawals." },
      { property: "og:title", content: "Mobile Money — FinDesk" },
      { property: "og:description", content: "Record MTN and Airtel agency deposits and withdrawals." },
    ],
  }),
  component: () => <ModulePlaceholder path="/mobile-money" />,
});
