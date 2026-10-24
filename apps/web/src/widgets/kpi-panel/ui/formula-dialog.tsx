import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';

interface FormulaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  horizonDays: number;
}

export function FormulaDialog({ open, onOpenChange, horizonDays }: FormulaDialogProps) {
  const text = ru.overview.kpi;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={text.formulaTitle}
      actions={<Button onClick={() => onOpenChange(false)}>{text.close}</Button>}
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-ink">{text.formulaText(horizonDays)}</p>
        <p className="m-0 font-mono text-data text-ink-muted">{text.formula(horizonDays)}</p>
      </div>
    </Dialog>
  );
}
