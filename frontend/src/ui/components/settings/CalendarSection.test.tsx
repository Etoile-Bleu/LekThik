import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/calendarApi', () => ({
  calendarFeedUrl: (token: string) => `https://api.test/api/calendar/${token}.ics`,
  fetchCalendarToken: vi.fn(),
  regenerateCalendarToken: vi.fn(),
  revokeCalendarToken: vi.fn(),
}));

import * as calendarApi from '@lib/calendarApi';
import { useToastStore } from '@lib/toastStore';

import { CalendarSection } from './CalendarSection';

function setup() {
  return render(<CalendarSection />);
}

describe('CalendarSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.setState({ toasts: [] });
    vi.mocked(calendarApi.fetchCalendarToken).mockResolvedValue(null);
  });

  it('starts off and reveals nothing until asked', async () => {
    setup();

    const toggle = await screen.findByRole('switch', { name: /Calendar feed/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Feed address')).not.toBeInTheDocument();
  });

  it('never turns itself on just by being opened', async () => {
    setup();

    await screen.findByRole('switch', { name: /Calendar feed/ });

    expect(calendarApi.fetchCalendarToken).toHaveBeenCalledTimes(1);
    expect(calendarApi.regenerateCalendarToken).not.toHaveBeenCalled();
  });

  it('starts on, with the address shown, for someone who already turned it on', async () => {
    vi.mocked(calendarApi.fetchCalendarToken).mockResolvedValue('a'.repeat(64));
    setup();

    const toggle = await screen.findByRole('switch', { name: /Calendar feed/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Feed address')).toHaveValue(
      `https://api.test/api/calendar/${'a'.repeat(64)}.ics`
    );
  });

  it('turns on with the switch and shows the address', async () => {
    vi.mocked(calendarApi.regenerateCalendarToken).mockResolvedValue('b'.repeat(64));
    setup();
    const toggle = await screen.findByRole('switch', { name: /Calendar feed/ });

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByLabelText('Feed address')).toHaveValue(
      `https://api.test/api/calendar/${'b'.repeat(64)}.ics`
    );
  });

  it('turns off with the switch and hides the address', async () => {
    vi.mocked(calendarApi.fetchCalendarToken).mockResolvedValue('c'.repeat(64));
    vi.mocked(calendarApi.revokeCalendarToken).mockResolvedValue(undefined);
    setup();
    const toggle = await screen.findByRole('switch', { name: /Calendar feed/ });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(calendarApi.revokeCalendarToken).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Feed address')).not.toBeInTheDocument();
  });

  it('copies the address to the clipboard', async () => {
    vi.mocked(calendarApi.fetchCalendarToken).mockResolvedValue('d'.repeat(64));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setup();
    await screen.findByLabelText('Feed address');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`https://api.test/api/calendar/${'d'.repeat(64)}.ics`)
    );
  });

  it('asks before making a new address, since the old one stops working', async () => {
    vi.mocked(calendarApi.fetchCalendarToken).mockResolvedValue('e'.repeat(64));
    vi.mocked(calendarApi.regenerateCalendarToken).mockResolvedValue('f'.repeat(64));
    setup();
    await screen.findByLabelText('Feed address');

    fireEvent.click(screen.getByRole('button', { name: 'New address' }));
    const confirm = screen.getByRole('dialog', { name: 'Make a new address?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Make a new address' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Feed address')).toHaveValue(
        `https://api.test/api/calendar/${'f'.repeat(64)}.ics`
      )
    );
  });
});
