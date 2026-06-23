import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NetworkErrorBanner from './NetworkErrorBanner.jsx';

describe('NetworkErrorBanner', () => {
  it('renders the primary banner text', () => {
    render(<NetworkErrorBanner />);
    expect(
      screen.getByText('ExplaraX Check-in needs internet right now.')
    ).toBeInTheDocument();
  });

  it('renders the secondary offline-mode text', () => {
    render(<NetworkErrorBanner />);
    expect(
      screen.getByText('Offline mode is coming in the next update.')
    ).toBeInTheDocument();
  });

  it('renders the dismiss button', () => {
    render(<NetworkErrorBanner />);
    expect(screen.getByRole('button', { name: /dismiss network error/i })).toBeInTheDocument();
  });

  it('dismisses the banner when the button is clicked', () => {
    render(<NetworkErrorBanner />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss network error/i }));
    expect(
      screen.queryByText('ExplaraX Check-in needs internet right now.')
    ).not.toBeInTheDocument();
  });

  it('calls onDismiss callback when dismissed', () => {
    const onDismiss = vi.fn();
    render(<NetworkErrorBanner onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss network error/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('is non-blocking (does not use role=alert with aria-live=assertive)', () => {
    render(<NetworkErrorBanner />);
    const banner = screen.getByRole('alert');
    // polite = non-blocking; should NOT be assertive
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });
});
