import { Slider as SliderPrimitive } from 'radix-ui';

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
}

export function Slider({ value, onValueChange, min, max, label, disabled }: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={[Number.isFinite(value) ? value : min]}
      onValueChange={([next]) => {
        if (next !== undefined) onValueChange(next);
      }}
      min={min}
      max={max}
      step={1}
      disabled={disabled}
      className="relative flex h-6 min-w-0 touch-none items-center select-none data-[disabled]:opacity-60"
    >
      <SliderPrimitive.Track className="relative h-1.5 grow rounded-full bg-surface-sunken">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block size-4.5 cursor-pointer rounded-full border-3 border-accent bg-surface shadow-pop transition-colors duration-120 ease-out disabled:cursor-not-allowed"
      />
    </SliderPrimitive.Root>
  );
}
