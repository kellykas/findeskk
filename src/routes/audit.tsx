import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Trail — FinDesk" },
      { name: "description", content: "Immutable record of sensitive FinDesk actions." },
      { property: "og:title", content: "Audit Trail — FinDesk" },
      { property: "og:description", content: "Immutable record of sensitive FinDesk actions." },
    ],
  }),
  component: () => <ModulePlaceholder path="/audit" />,
});
