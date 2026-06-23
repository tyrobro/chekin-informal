import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CameraDeniedState from './CameraDeniedState.jsx';

describe('CameraDeniedState', () => {
  it('renders the camera denied message', () => {
    render(<CameraDeniedState />);
    expect(screen.getByText('Camera access denied.')).toBeInTheDocument();
  });

  it('renders the manual check-in fallback description', () => {
    render(<CameraDeniedState />);
    expect(
      screen.getByText('You can still check guests in manually.')
    ).toBeInTheDocument();
  });

  it('renders the help link', () => {
    render(<CameraDeniedState />);
    expect(
      screen.getByRole('link', { name: /how to re-enable camera/i })
    ).toBeInTheDocument();
  });

  it('renders help link with default URL', () => {
    render(<CameraDeniedState />);
    const link = screen.getByRole('link', { name: /how to re-enable camera/i });
    expect(link).toHaveAttribute('href', 'https://help.explarax.com/camera-permission');
  });

  it('renders help link with injected helpUrl', () => {
    render(<CameraDeniedState helpUrl="https://custom.example.com/camera" />);
    const link = screen.getByRole('link', { name: /how to re-enable camera/i });
    expect(link).toHaveAttribute('href', 'https://custom.example.com/camera');
  });

  it('renders Manual Check-in button when onManualCheckIn is provided', () => {
    render(<CameraDeniedState onManualCheckIn={() => {}} />);
    expect(screen.getByRole('button', { name: /manual check-in/i })).toBeInTheDocument();
  });

  it('calls onManualCheckIn when button is clicked', () => {
    const handler = vi.fn();
    render(<CameraDeniedState onManualCheckIn={handler} />);
    fireEvent.click(screen.getByRole('button', { name: /manual check-in/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the manual button when prop is absent', () => {
    render(<CameraDeniedState />);
    expect(screen.queryByRole('button', { name: /manual check-in/i })).not.toBeInTheDocument();
  });
});
