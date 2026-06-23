import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RevokedLinkState from './RevokedLinkState.jsx';

describe('RevokedLinkState', () => {
  it('renders the correct title', () => {
    render(<RevokedLinkState />);
    expect(screen.getByText('This link has been revoked')).toBeInTheDocument();
  });

  it('renders the correct description', () => {
    render(<RevokedLinkState />);
    expect(
      screen.getByText('Please ask the host to send you a new invitation.')
    ).toBeInTheDocument();
  });

  it('renders the Contact Host button', () => {
    render(<RevokedLinkState />);
    expect(screen.getByRole('button', { name: /contact host/i })).toBeInTheDocument();
  });

  it('calls onContactHost when the button is clicked', () => {
    const onContactHost = vi.fn();
    render(<RevokedLinkState onContactHost={onContactHost} />);
    fireEvent.click(screen.getByRole('button', { name: /contact host/i }));
    expect(onContactHost).toHaveBeenCalledTimes(1);
  });

  it('hides the scanner (is full-screen, role=alert)', () => {
    render(<RevokedLinkState />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
