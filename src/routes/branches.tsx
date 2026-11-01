import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/branches")({
  head: () => ({
    meta: [
      { title: "Branches — FinDesk" },
      { name: "description", content: "Branch profiles, accounts and performance." },
      { property: "og:title", content: "Branches — FinDesk" },
      { property: "og:description", content: "Branch profiles, accounts and performance." },
    ],
  }),
  component: () => <ModulePlaceholder path="/branches" />,
});
