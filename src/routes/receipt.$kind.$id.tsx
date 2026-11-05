import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ReceiptSheet as FxSheet } from "@/components/forex/FxReceiptDialog";
import { ReceiptSheet as MomoSheet } from "@/components/mobile-money/MomoReceiptDialog";
import { useReceiptPaper } from "@/hooks/use-receipt-paper";
import { getPublicReceipt } from "@/services/public-receipt.service";
import { t } from "@/domain/i18n";

export const Route = createFileRoute("/receipt/$kind/$id")({
  head: () => ({
    meta: [{ title: "Receipt — FinDesk" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicReceiptPage,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function PublicReceiptPage() {
  const { kind, id } = Route.useParams();
  const validKind = kind === "fx" || kind === "momo";
  const validId = UUID.test(id);
  const query = useQuery({
    queryKey: ["public-receipt", kind, id],
    queryFn: () => getPublicReceipt(kind as "fx" | "momo", id),
    enabled: validKind && validId,
    retry: false,
  });
  const page = query.data;
  // Printed on the company's default paper; the reader cannot change the printer here.
  const { paper } = useReceiptPaper(page?.settings.receiptFormat ?? "80mm");

  if (!validKind || !validId || (!query.isPending && !page)) {
    return <Notice text={t("This receipt could not be found.")} />;
  }
  if (query.isPending) return <Notice text={t("Loading receipt…")} />;
  if (query.isError) return <Notice text={t("This receipt could not be loaded.")} />;

  const receipt = page!.receipt;
  return (
    <div className="flex min-h-screen justify-center bg-white p-4">
      {receipt.kind === "fx" ? (
        <FxSheet
          trade={receipt.record}
          settings={page!.settings}
          branchName={receipt.branchName}
          servedBy={receipt.servedBy || "—"}
          paper={paper}
        />
      ) : (
        <MomoSheet
          receipt={receipt.record}
          settings={page!.settings}
          branchName={receipt.branchName}
          servedBy={receipt.servedBy || "—"}
          networkName={receipt.networkName}
          paper={paper}
        />
      )}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
