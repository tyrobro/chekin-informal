import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExpiredLinkState from './ExpiredLinkState.jsx';

describe('ExpiredLinkState', () => {
  it('renders the correct title', () => {
    render(<ExpiredLinkState />);
    expect(screen.getByText('This link has expired')).toBeInTheDocument();
  });

  it('renders the validity description', () => {
    render(<ExpiredLinkState />);
    expect(
      screen.getByText(/remain valid until 24 hours after the event ends/i)
    ).toBeInTheDocument();
  });

  it('renders Request New Link button always (visible recovery path)', () => {
    render(<ExpiredLinkState />);
    expect(screen.getByRole('button', { name: /request new link/i })).toBeInTheDocument();
  });

  it('renders Request New Link button when onRequestNewLink is provided', () => {
    render(<ExpiredLinkState onRequestNewLink={() => {}} />);
    expect(screen.getByRole('button', { name: /request new link/i })).toBeInTheDocument();
  });

  it('button is enabled when onRequestNewLink is provided', () => {
    render(<ExpiredLinkState onRequestNewLink={() => {}} />);
    expect(screen.getByRole('button', { name: /request new link/i })).not.toBeDisabled();
  });

  it('button is disabled when onRequestNewLink is not provided', () => {
    render(<ExpiredLinkState />);
    expect(screen.getByRole('button', { name: /request new link/i })).toBeDisabled();
  });

  it('calls onRequestNewLink when button is clicked', () => {
    const handler = vi.fn();
    render(<ExpiredLinkState onRequestNewLink={handler} />);
    fireEvent.click(screen.getByRole('button', { name: /request new link/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is a full-screen alert state', () => {
    render(<ExpiredLinkState />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
