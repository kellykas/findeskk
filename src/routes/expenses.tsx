import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses & Finance — FinDesk" },
      { name: "description", content: "Expenses, approvals, income and profit and loss." },
      { property: "og:title", content: "Expenses & Finance — FinDesk" },
      { property: "og:description", content: "Expenses, approvals, income and profit and loss." },
    ],
  }),
  component: () => <ModulePlaceholder path="/expenses" />,
});
