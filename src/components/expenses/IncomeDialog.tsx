import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, type Money } from "@/domain/money";
import {
  INCOME_CATEGORIES,
  INCOME_CATEGORY_ACCOUNTS,
  INCOME_CATEGORY_LABELS,
  INCOME_RECEIPT_SOURCES,
  INCOME_RECEIPT_SOURCE_LABELS,
  incomeSchema,
  parseIncomeAmount,
  type IncomeCategory,
  type IncomeReceiptSource,
} from "@/domain/income";
import { todayUtcDate } from "@/domain/date";

export interface IncomeFormValues {
  incomeDate: string;
  category: IncomeCategory;
  description: string;
  amount: Money;
  receivedInto: IncomeReceiptSource;
  branchId: string;
  reference: string;
  notes: string;
}

interface BranchOption {
  id: string;
  code: string;
  name: string;
}

export function IncomeDialog({
  branches,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  branches: BranchOption[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: IncomeFormValues) => void;
}) {
  const [incomeDate, setIncomeDate] = useState(todayUtcDate());
  const [category, setCategory] = useState<IncomeCategory>("service_charges");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedInto, setReceivedInto] = useState<IncomeReceiptSource>("cash");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const preview = parseIncomeAmount(amount);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = incomeSchema.safeParse({
      incomeDate,
      category,
      description,
      amount,
      receivedInto,
      branchId,
      reference,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    const parsedAmount = parseIncomeAmount(parsed.data.amount);
    if (!parsedAmount) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setError(null);
    onSave({
      incomeDate: parsed.data.incomeDate,
      category: parsed.data.category,
      description: parsed.data.description,
      amount: parsedAmount,
      receivedInto: parsed.data.receivedInto,
      branchId: parsed.data.branchId,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record income</DialogTitle>
            <DialogDescription>
              The income is posted immediately: {INCOME_RECEIPT_SOURCE_LABELS[receivedInto].toLowerCase()} is debited and
              the income account is credited.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as IncomeCategory)}
              >
                <SelectTrigger aria-label="Income category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {INCOME_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Account {INCOME_CATEGORY_ACCOUNTS[category]}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="income-amount">Amount (UGX)</Label>
              <Input
                id="income-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="50000"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="income-description">Description</Label>
            <Input
              id="income-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              placeholder="Service fee collected"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Received into</Label>
              <Select
                value={receivedInto}
                onValueChange={(value) => setReceivedInto(value as IncomeReceiptSource)}
              >
                <SelectTrigger aria-label="Received into">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_RECEIPT_SOURCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {INCOME_RECEIPT_SOURCE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label="Branch">
                  <SelectValue placeholder="Choose a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.code} · {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="income-date">Date</Label>
              <Input
                id="income-date"
                type="date"
                value={incomeDate}
                onChange={(event) => setIncomeDate(event.target.value)}
                max={todayUtcDate()}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="income-reference">Reference</Label>
              <Input
                id="income-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={40}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="income-notes">Notes</Label>
            <Textarea
              id="income-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {preview ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount to post</span>
                <span className="tabular font-medium">{formatMoney(preview)}</span>
              </div>
            ) : (
              <p className="text-muted-foreground">Enter an amount to preview the posting.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !preview || branches.length === 0}>
              {saving ? "Recording…" : "Record income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
