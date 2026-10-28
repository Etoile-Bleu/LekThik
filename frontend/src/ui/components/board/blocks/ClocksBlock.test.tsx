import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BoardList } from '@lib/boardsApi';
import { useEmbedConsent } from '@lib/embedConsent';
import { clearWeatherCache } from '@lib/weather';

import { ClocksBlock } from './ClocksBlock';

vi.mock('@lib/clocks', async (original) => ({
  ...(await original<typeof import('@lib/clocks')>()),
  viewerZone: () => 'Europe/Paris',
}));

function block(config: Record<string, unknown>): BoardList {
  return {
    id: 'clk',
    name: 'Team time',
    wip_limit: null,
    kind: 'clocks',
    config: { size: 'normal', zones: [], place: null, ...config },
    cards: [],
  };
}

const forecast = {
  current: { temperature_2m: 16.4, weather_code: 80, is_day: 1 },
  daily: { temperature_2m_max: [16.5], temperature_2m_min: [10.6] },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-15T12:20:00Z'));
  useEmbedConsent.setState({ allowed: {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearWeatherCache();
});

describe('ClocksBlock', () => {
  it('invites a writer to add time zones, and a reader to nothing', () => {
    const onSetup = vi.fn();
    const { unmount } = render(<ClocksBlock block={block({})} editable onSetup={onSetup} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add time zones' }));
    expect(onSetup).toHaveBeenCalledWith('clk');
    unmount();

    render(<ClocksBlock block={block({})} editable={false} onSetup={onSetup} />);
    expect(screen.getByText('No place yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add time zones' })).toBeNull();
  });

  it('shows you first, then each zone, read out as one sentence each', () => {
    render(
      <ClocksBlock
        block={block({ zones: ['Asia/Tokyo', 'America/New_York'] })}
        editable
        onSetup={vi.fn()}
      />
    );

    expect(screen.getByText(/^Paris: .*, UTC\+1, daytime\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Tokyo: .*, UTC\+9, night\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^New York: .*, UTC-5, daytime\.$/)).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('says when everyone is at work, in the hours of the person looking', () => {
    render(
      <ClocksBlock block={block({ zones: ['America/New_York'] })} editable onSetup={vi.fn()} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Everyone is at work from 15:00 to 18:00 your time.'
    );
    expect(document.querySelectorAll('.clocks-block__cell')).toHaveLength(24);
    expect(document.querySelectorAll('.clocks-block__cell[data-level="all"]')).toHaveLength(3);
  });

  it('says when no hour is shared', () => {
    render(
      <ClocksBlock block={block({ zones: ['America/Los_Angeles'] })} editable onSetup={vi.fn()} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'No hour is inside 09:00 to 18:00 for everyone.'
    );
  });

  it('names a zone the browser does not know instead of breaking', () => {
    render(
      <ClocksBlock
        block={block({ zones: ['Europe/Paris', 'Mars/Olympus_Mons'] })}
        editable
        onSetup={vi.fn()}
      />
    );

    expect(screen.getByText(/Olympus Mons: this browser does not know/)).toBeInTheDocument();
    expect(screen.getByText(/^Paris: /)).toBeInTheDocument();
  });
});

describe('the weather of a clocks block', () => {
  const place = { name: 'Nancy', latitude_centi: 4868, longitude_centi: 618 };

  it('asks nothing of Open-Meteo until the button is pressed, and says who receives what', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => forecast });
    vi.stubGlobal('fetch', fetcher);
    render(
      <ClocksBlock block={block({ zones: ['Asia/Tokyo'], place })} editable onSetup={vi.fn()} />
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(
      screen.getByText(/will receive your IP address and the position 48.68, 6.18/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show the weather' }));

    await waitFor(() => expect(screen.getByText('Light showers')).toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('latitude=48.68&longitude=6.18');
    expect(screen.getByText(/High 17° · Low 11°/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Weather data by Open-Meteo.com/ })).toHaveAttribute(
      'href',
      'https://open-meteo.com/en/license'
    );
    expect(useEmbedConsent.getState().allowed.open_meteo).not.toBe(true);
  });

  it('remembers the choice on this device only when asked to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => forecast })
    );
    render(<ClocksBlock block={block({ place })} editable onSetup={vi.fn()} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Remember for Open-Meteo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show the weather' }));

    await waitFor(() => expect(screen.getByText('Light showers')).toBeInTheDocument());
    expect(useEmbedConsent.getState().allowed.open_meteo).toBe(true);
  });

  it('loads at once for someone who chose to remember', async () => {
    useEmbedConsent.setState({ allowed: { open_meteo: true } });
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => forecast });
    vi.stubGlobal('fetch', fetcher);

    render(<ClocksBlock block={block({ place })} editable onSetup={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Light showers')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Show the weather' })).toBeNull();
  });

  it('says so when the weather cannot be loaded', async () => {
    useEmbedConsent.setState({ allowed: { open_meteo: true } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<ClocksBlock block={block({ place })} editable onSetup={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The weather in Nancy could not be loaded.'
    );
  });

  it('keeps the clocks running while the weather waits', () => {
    render(
      <ClocksBlock block={block({ zones: ['Asia/Tokyo'], place })} editable onSetup={vi.fn()} />
    );

    act(() => {
      vi.setSystemTime(new Date('2026-01-15T12:21:00Z'));
    });

    expect(screen.getByText(/^Tokyo: /)).toBeInTheDocument();
  });
});
