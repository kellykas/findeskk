import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "Employees — FinDesk" },
      { name: "description", content: "Staff profiles, roles and branch assignments." },
      { property: "og:title", content: "Employees — FinDesk" },
      { property: "og:description", content: "Staff profiles, roles and branch assignments." },
    ],
  }),
  component: () => <ModulePlaceholder path="/employees" />,
});
