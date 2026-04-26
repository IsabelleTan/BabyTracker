export function BottleFeedForm({
  amountMl,
  setAmountMl,
}: {
  amountMl: string
  setAmountMl: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="amount-ml" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount (ml)</label>
      <input
        id="amount-ml"
        type="number"
        min="0"
        placeholder="—"
        value={amountMl}
        onChange={(e) => setAmountMl(e.target.value)}
        className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
