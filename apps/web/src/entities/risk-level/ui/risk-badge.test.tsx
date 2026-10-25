import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RiskBadge } from './risk-badge';

describe('RiskBadge', () => {
  it.each([
    ['high', 'высокий'],
    ['medium', 'средний'],
    ['low', 'низкий'],
    ['none', 'нет оценки'],
    ['pending', 'расчёт…'],
  ] as const)('renders the %s level as text, not only as color', (level, text) => {
    render(<RiskBadge level={level} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows the score with two decimals', () => {
    render(<RiskBadge level="high" score={77.96} />);
    expect(screen.getByText('77,96')).toBeInTheDocument();
  });

  it('shows a dash for a missing score', () => {
    render(<RiskBadge level="none" score={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
