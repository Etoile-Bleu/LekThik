import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOAST_LIFETIME_MS, useToastStore } from '@lib/toastStore';

import { Toaster } from './Toaster';

describe('Toaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps errors longer than good news', () => {
    expect(TOAST_LIFETIME_MS.error).toBeGreaterThan(TOAST_LIFETIME_MS.success);
    expect(TOAST_LIFETIME_MS.success).toBeGreaterThanOrEqual(6000);
  });

  it('removes a notification after its time', () => {
    render(<Toaster />);
    act(() => useToastStore.getState().push('success', 'Saved'));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_LIFETIME_MS.success + 100);
    });

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('waits while the pointer is on it, and while it has focus', () => {
    render(<Toaster />);
    act(() => useToastStore.getState().push('error', 'Something broke'));
    const toast = screen.getByText('Something broke').closest('.toast') as HTMLElement;

    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_LIFETIME_MS.error * 3);
    });
    expect(screen.getByText('Something broke')).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_LIFETIME_MS.error + 100);
    });
    expect(screen.queryByText('Something broke')).not.toBeInTheDocument();
  });

  it('can always be dismissed by hand', () => {
    render(<Toaster />);
    act(() => useToastStore.getState().push('info', 'Heads up'));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
  });
});
