import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NoSearchResults from './NoSearchResults.jsx';

describe('NoSearchResults', () => {
  it('renders the query inside the title when provided', () => {
    render(<NoSearchResults query="Priyaa" />);
    expect(screen.getByText(/couldn't find/i)).toBeInTheDocument();
    expect(screen.getByText(/"Priyaa"/)).toBeInTheDocument();
  });

  it('renders a fallback title when no query is given', () => {
    render(<NoSearchResults query="" />);
    expect(screen.getByText(/couldn't find that guest/i)).toBeInTheDocument();
  });

  it('renders the helper description with escalate instruction', () => {
    render(<NoSearchResults query="Test" />);
    expect(
      screen.getByText(/try a different spelling, or escalate to the host/i)
    ).toBeInTheDocument();
  });

  it('is announced as a status region', () => {
    render(<NoSearchResults query="Test" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not render as a full-screen overlay (no role=alert)', () => {
    render(<NoSearchResults query="Test" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
