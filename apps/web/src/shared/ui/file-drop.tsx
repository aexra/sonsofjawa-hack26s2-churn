import { File as FileIcon, Upload, X } from 'lucide-react';
import { useId, useState, type ChangeEvent, type DragEvent } from 'react';

import { cn } from '@/shared/lib/cn';

import { Button } from './button';

interface FileDropProps {
  accept: string;
  title: string;
  hint?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

export function FileDrop({ accept, title, hint, multiple = false, onFiles }: FileDropProps) {
  const id = useId();
  const [over, setOver] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    const files = [...event.dataTransfer.files];
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length > 0) onFiles(files);
    event.target.value = '';
  };

  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed px-6 py-8 text-center transition-colors duration-120 ease-out has-focus-visible:shadow-focus hover:border-accent hover:bg-accent-soft hover:text-accent',
        over
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line-strong bg-surface text-ink-muted',
      )}
    >
      <Upload aria-hidden="true" className="size-6" />
      <span className="text-body-strong text-ink">{title}</span>
      {hint && <span className="text-caption text-ink-muted">{hint}</span>}
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="sr-only"
      />
    </label>
  );
}

interface FileCardProps {
  name: string;
  meta: string;
  clearLabel: string;
  onClear: () => void;
}

export function FileCard({ name, meta, clearLabel, onClear }: FileCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <FileIcon aria-hidden="true" className="size-4.5 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-data">{name}</div>
        <div className="text-caption text-ink-muted">{meta}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X aria-hidden="true" className="size-4" />
        {clearLabel}
      </Button>
    </div>
  );
}
