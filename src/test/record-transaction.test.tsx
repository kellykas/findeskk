import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseDialog, type ExpenseFormValues } from "@/components/expenses/ExpenseDialog";
import { FxDialog, type FxTradeValues } from "@/components/forex/FxDialog";
import type { FxRate } from "@/domain/forex";

const branches = [{ id: "b1", code: "KLA", name: "Kampala" }];
const noop = () => {};

const rates: FxRate[] = [
  {
    id: "r1",
    currency: "USD",
    buyRate: "4300.000000",
    sellRate: "4400.000000",
    effectiveFrom: "2026-11-03",
    createdAt: "2026-11-03T00:00:00Z",
  },
];

describe("recording an expense", () => {
  it("submits the amount as bigint minor units", () => {
    const onSave = vi.fn<(values: ExpenseFormValues) => void>();
    render(
      <ExpenseDialog branches={branches} open saving={false} onOpenChange={noop} onSave={onSave} />,
    );

    fireEvent.change(screen.getByLabelText("Amount (UGX)"), { target: { value: "150000" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "October electricity bill" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const values = onSave.mock.calls[0]![0];
    expect(values.amount.minor).toBe(150000n);
    expect(values.category).toBe("utilities");
    expect(values.paidFrom).toBe("cash");
    expect(values.branchId).toBe("b1");
  });

  it("refuses to submit without an amount", () => {
    const onSave = vi.fn();
    render(
      <ExpenseDialog branches={branches} open saving={false} onOpenChange={noop} onSave={onSave} />,
    );

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "October electricity bill" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("applies a suggested category before posting", async () => {
    const onSave = vi.fn<(values: ExpenseFormValues) => void>();
    const suggestCategory = vi.fn().mockResolvedValue({
      category: "transport",
      rationale: "Diesel is a transport cost.",
      source: "ai",
    });

    render(
      <ExpenseDialog
        branches={branches}
        open
        saving={false}
        suggestCategory={suggestCategory}
        onOpenChange={noop}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Diesel for the generator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest category" }));

    await waitFor(() => expect(screen.getByText(/AI suggestion/)).toBeInTheDocument());
    expect(suggestCategory).toHaveBeenCalledWith({
      description: "Diesel for the generator",
      amount: "",
    });

    fireEvent.change(screen.getByLabelText("Amount (UGX)"), { target: { value: "80000" } });
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));

    expect(onSave.mock.calls[0]![0].category).toBe("transport");
  });

  it("asks for a description before suggesting", async () => {
    const suggestCategory = vi.fn();
    render(
      <ExpenseDialog
        branches={branches}
        open
        saving={false}
        suggestCategory={suggestCategory}
        onOpenChange={noop}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Suggest category" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/describe the expense first/i),
    );
    expect(suggestCategory).not.toHaveBeenCalled();
  });
});

describe("recording a forex trade", () => {
  it("prices a buy at the published buy rate", () => {
    const onSave = vi.fn<(values: FxTradeValues) => void>();
    render(
      <FxDialog
        latestRates={rates}
        branches={branches}
        open
        saving={false}
        onOpenChange={noop}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record trade" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const values = onSave.mock.calls[0]![0];
    expect(values.type).toBe("buy");
    expect(values.currency).toBe("USD");
    expect(values.foreignAmount).toBe("1000");
    expect(values.rate).toBe("4300.000000");
    expect(values.costRate).toBe("4300.000000");
    expect(values.branchId).toBe("b1");
  });

  it("shows no margin on a buy, because a buy is priced at cost", () => {
    render(
      <FxDialog
        latestRates={rates}
        branches={branches}
        open
        saving={false}
        onOpenChange={noop}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("UGX paid out")).toBeInTheDocument();
    // A buy shows the same figure as both the UGX paid out and the cost.
    expect(screen.getAllByText("UGX 4,300,000")).toHaveLength(2);
  });
});
