import logoBlack from '@/shared/assets/brand/aeza-logo-black.svg';
import logoWhite from '@/shared/assets/brand/aeza-logo-white.svg';
import markBlack from '@/shared/assets/brand/aeza-mark-black.svg';
import markWhite from '@/shared/assets/brand/aeza-mark-white.svg';
import { cn } from '@/shared/lib/cn';

const sources = {
  full: { black: logoBlack, white: logoWhite },
  mark: { black: markBlack, white: markWhite },
};

interface BrandLogoProps {
  variant?: 'full' | 'mark';
  size?: number;
  className?: string;
}

export function BrandLogo({ variant = 'full', size = 26, className }: BrandLogoProps) {
  const { black, white } = sources[variant];
  return (
    <span role="img" aria-label="aéza" className={cn('inline-flex flex-none', className)}>
      <img
        src={black}
        alt=""
        aria-hidden="true"
        style={{ height: size }}
        className="brand-logo-black w-auto"
      />
      <img
        src={white}
        alt=""
        aria-hidden="true"
        style={{ height: size }}
        className="brand-logo-white w-auto"
      />
    </span>
  );
}
