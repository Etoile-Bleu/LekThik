import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClocksConfig } from '@lib/boardsApi';

import { ClocksSettings } from './ClocksSettings';

vi.mock('@lib/clocks', async (original) => ({
  ...(await original<typeof import('@lib/clocks')>()),
  viewerZone: () => 'Europe/Paris',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(value: Partial<ClocksConfig> = {}) {
  const onChange = vi.fn();
  render(
    <ClocksSettings
      value={{ size: 'normal', zones: [], place: null, ...value }}
      onChange={onChange}
    />
  );
  return onChange;
}

describe('time zones', () => {
  it('adds a zone from the list, by name or by pressing Enter', () => {
    const onChange = setup({ zones: ['Asia/Tokyo'] });
    const field = screen.getByLabelText('Time zone');

    fireEvent.change(field, { target: { value: 'America/New_York' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenLastCalledWith({ zones: ['Asia/Tokyo', 'America/New_York'] });

    fireEvent.change(field, { target: { value: 'Europe/Paris' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith({ zones: ['Asia/Tokyo', 'Europe/Paris'] });
  });

  it('adds the zone of the person looking', () => {
    const onChange = setup();

    fireEvent.click(screen.getByRole('button', { name: 'My time zone' }));

    expect(onChange).toHaveBeenCalledWith({ zones: ['Europe/Paris'] });
  });

  it('says why a zone cannot be added', () => {
    const onChange = setup({ zones: ['Asia/Tokyo'] });
    const field = screen.getByLabelText('Time zone');

    fireEvent.change(field, { target: { value: 'Mars/Olympus_Mons' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('does not know that time zone');

    fireEvent.change(field, { target: { value: 'Asia/Tokyo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Tokyo is already there.');

    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Type a city');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops at six', () => {
    const zones = [
      'UTC',
      'Asia/Tokyo',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Dubai',
      'Africa/Cairo',
    ];
    const onChange = setup({ zones });

    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Kolkata' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toHaveTextContent('At most 6 time zones.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a zone', () => {
    const onChange = setup({ zones: ['Asia/Tokyo', 'Europe/Paris'] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tokyo' }));

    expect(onChange).toHaveBeenCalledWith({ zones: ['Europe/Paris'] });
  });
});

describe('the place for the weather', () => {
  function answer(body: unknown) {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  }

  it('says who receives the search before anything is sent', () => {
    const fetcher = answer({});
    setup();

    expect(
      screen.getByText(/sends what you type and your IP address to Open-Meteo/)
    ).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('searches, lists the places and keeps the one chosen with a rounded position', async () => {
    const fetcher = answer({
      results: [
        {
          name: 'Nancy',
          latitude: 48.68439,
          longitude: 6.18496,
          admin1: 'Grand Est',
          country: 'France',
        },
      ],
    });
    const onChange = setup();

    fireEvent.change(screen.getByLabelText('Search for a place'), { target: { value: 'Nancy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    fireEvent.click(await screen.findByRole('button', { name: /Nancy.*Grand Est, France/ }));

    expect(String(fetcher.mock.calls[0][0])).toContain('name=Nancy');
    expect(onChange).toHaveBeenCalledWith({
      place: { name: 'Nancy', latitude_centi: 4868, longitude_centi: 618 },
    });
  });

  it('says when nothing is found or the search fails', async () => {
    answer({ results: [] });
    setup();
    fireEvent.change(screen.getByLabelText('Search for a place'), { target: { value: 'Zzzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No place found.')).toBeInTheDocument();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The search could not be done')
    );
  });

  it('asks for two letters and sends nothing for fewer', () => {
    const fetcher = answer({});
    setup();

    fireEvent.change(screen.getByLabelText('Search for a place'), { target: { value: 'N' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least two letters');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('removes the weather', () => {
    const onChange = setup({
      place: { name: 'Nancy', latitude_centi: 4868, longitude_centi: 618 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove the weather' }));

    expect(onChange).toHaveBeenCalledWith({ place: null });
  });
});
