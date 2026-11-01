import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export const Route = createFileRoute("/forex")({
  head: () => ({
    meta: [
      { title: "Forex Bureau — FinDesk" },
      { name: "description", content: "Buy and sell foreign currency and manage exchange rates." },
      { property: "og:title", content: "Forex Bureau — FinDesk" },
      { property: "og:description", content: "Buy and sell foreign currency and manage exchange rates." },
    ],
  }),
  component: () => <ModulePlaceholder path="/forex" />,
});
