import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NoActiveEventsState from './NoActiveEventsState.jsx';

describe('NoActiveEventsState', () => {
  it('renders the correct title', () => {
    render(<NoActiveEventsState />);
    expect(screen.getByText('No active events yet')).toBeInTheDocument();
  });

  it('renders the correct description', () => {
    render(<NoActiveEventsState />);
    expect(
      screen.getByText("You don't have any active events available for check-in.")
    ).toBeInTheDocument();
  });

  it('renders the CTA link with default URL', () => {
    render(<NoActiveEventsState />);
    const link = screen.getByRole('link', { name: /how to set up an event/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://help.explarax.com/set-up-event');
  });

  it('renders the CTA link with an injected helpUrl prop', () => {
    render(<NoActiveEventsState helpUrl="https://example.com/help" />);
    const link = screen.getByRole('link', { name: /how to set up an event/i });
    expect(link).toHaveAttribute('href', 'https://example.com/help');
  });

  it('opens the link in a new tab', () => {
    render(<NoActiveEventsState />);
    const link = screen.getByRole('link', { name: /how to set up an event/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('is visually present in the document', () => {
    const { container } = render(<NoActiveEventsState />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
