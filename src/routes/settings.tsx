import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — FinDesk" },
      { name: "description", content: "Company profile, currencies and permissions." },
      { property: "og:title", content: "Settings — FinDesk" },
      { property: "og:description", content: "Company profile, currencies and permissions." },
    ],
  }),
  component: () => <ModulePlaceholder path="/settings" />,
});
