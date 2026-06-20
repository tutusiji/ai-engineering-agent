import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('renders a simple component', () => {
    render(<div data-testid="smoke">ok</div>);
    expect(screen.getByTestId('smoke')).toHaveTextContent('ok');
  });
});
