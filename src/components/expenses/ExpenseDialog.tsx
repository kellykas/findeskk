import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/shared/FormError";
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
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ACCOUNTS,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_SOURCES,
  PAYMENT_SOURCE_LABELS,
  expenseSchema,
  parseExpenseAmount,
  type ExpenseCategory,
  type PaymentSource,
} from "@/domain/expenses";
import { todayUtcDate } from "@/domain/date";
import type { CategorySuggestion } from "@/domain/expenseCategory";

export interface ExpenseFormValues {
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: Money;
  paidFrom: PaymentSource;
  branchId: string;
  reference: string;
  notes: string;
}

interface BranchOption {
  id: string;
  code: string;
  name: string;
}

export function ExpenseDialog({
  branches,
  open,
  saving,
  suggestCategory,
  onOpenChange,
  onSave,
}: {
  branches: BranchOption[];
  open: boolean;
  saving: boolean;
  /** Optional: asks a model (with a rules fallback) which category fits. */
  suggestCategory?: (input: { description: string; amount: string }) => Promise<CategorySuggestion>;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ExpenseFormValues) => void;
}) {
  const [expenseDate, setExpenseDate] = useState(todayUtcDate());
  const [category, setCategory] = useState<ExpenseCategory>("utilities");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidFrom, setPaidFrom] = useState<PaymentSource>("cash");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Branches arrive after this dialog mounts, so select the only branch once it
  // is known instead of leaving the form with no branch and a failing submit.
  useEffect(() => {
    const first = branches[0];
    if (!branchId && first) setBranchId(first.id);
  }, [branches, branchId]);

  async function handleSuggest() {
    if (!suggestCategory) return;
    if (description.trim().length < 4) {
      setError("Describe the expense first, then ask for a category.");
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const next = await suggestCategory({ description: description.trim(), amount });
      setSuggestion(next);
      setCategory(next.category);
    } catch (suggestError) {
      setError(
        suggestError instanceof Error
          ? suggestError.message
          : "Could not suggest a category. Pick one manually.",
      );
    } finally {
      setSuggesting(false);
    }
  }

  const preview = parseExpenseAmount(amount);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = expenseSchema.safeParse({
      expenseDate,
      category,
      description,
      amount,
      paidFrom,
      branchId,
      reference,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    const parsedAmount = parseExpenseAmount(parsed.data.amount);
    if (!parsedAmount) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setError(null);
    onSave({
      expenseDate: parsed.data.expenseDate,
      category: parsed.data.category,
      description: parsed.data.description,
      amount: parsedAmount,
      paidFrom: parsed.data.paidFrom,
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
            <DialogTitle>Record expense</DialogTitle>
            <DialogDescription>
              The expense is posted immediately: the category account is debited and{" "}
              {PAYMENT_SOURCE_LABELS[paidFrom].toLowerCase()} is credited.
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as ExpenseCategory)}
              >
                <SelectTrigger aria-label="Expense category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {EXPENSE_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Account {EXPENSE_CATEGORY_ACCOUNTS[category]}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Amount (UGX)</Label>
              <Input
                id="expense-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="150000"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-description">Description</Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              placeholder="October electricity bill"
              required
            />
          </div>

          {suggestCategory && (
            <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Not sure which account this belongs in?
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSuggest()}
                  disabled={suggesting}
                >
                  {suggesting ? "Thinking…" : "Suggest category"}
                </Button>
              </div>
              {suggestion && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {suggestion.source === "ai" ? "AI suggestion" : "Rules suggestion"}:{" "}
                    {EXPENSE_CATEGORY_LABELS[suggestion.category]}
                  </span>{" "}
                  — {suggestion.rationale} Applied as a starting point; change it if it is wrong.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Paid from</Label>
              <Select
                value={paidFrom}
                onValueChange={(value) => setPaidFrom(value as PaymentSource)}
              >
                <SelectTrigger aria-label="Paid from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_SOURCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {PAYMENT_SOURCE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label="Branch">
                  <SelectValue placeholder="Select a branch" />
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-date">Expense date</Label>
              <Input
                id="expense-date"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                max={todayUtcDate()}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-reference">Reference</Label>
              <Input
                id="expense-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={40}
                placeholder="Receipt or voucher"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-notes">Notes</Label>
            <Textarea
              id="expense-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional"
            />
          </div>

          {preview && (
            <div className="flex justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Posted amount</span>
              <span className="tabular font-medium">{formatMoney(preview)}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !preview || branches.length === 0}>
              {saving ? "Recording…" : "Record expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
