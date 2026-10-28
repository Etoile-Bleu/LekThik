import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleBoardView } from '../../../test/fixtures';

vi.mock('@lib/fieldsApi', () => ({
  createField: vi.fn(),
  updateField: vi.fn(),
  deleteField: vi.fn(),
  addOption: vi.fn(),
  updateOption: vi.fn(),
  deleteOption: vi.fn(),
  setFieldValue: vi.fn(),
}));

import type { Field, FieldValue } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import * as fieldsApi from '@lib/fieldsApi';

import { CardFields } from './CardFields';

const fields: Field[] = [
  {
    id: 'f-text',
    board_id: 'b1',
    name: 'Client',
    kind: 'text',
    position: 0,
    show_on_card: false,
    options: [],
  },
  {
    id: 'f-num',
    board_id: 'b1',
    name: 'Estimate',
    kind: 'number',
    position: 1,
    show_on_card: false,
    options: [],
  },
  {
    id: 'f-sel',
    board_id: 'b1',
    name: 'Size',
    kind: 'select',
    position: 2,
    show_on_card: false,
    options: [
      { id: 'o-s', name: 'Small', color: 'green' },
      { id: 'o-l', name: 'Large', color: 'red' },
    ],
  },
  {
    id: 'f-box',
    board_id: 'b1',
    name: 'Reviewed',
    kind: 'checkbox',
    position: 3,
    show_on_card: false,
    options: [],
  },
];

function setup(values: Array<[string, FieldValue]> = [], editable = true) {
  useBoardStore.setState({
    view: {
      ...sampleBoardView(),
      fields,
      field_values: values.map(([field_id, value]) => ({ card_id: 'c1', field_id, value })),
    },
    status: 'ready',
    freshIds: [],
  });
  render(
    <CardFields
      cardId="c1"
      fields={fields}
      values={new Map(values)}
      editable={editable}
      startIndex={0}
    />
  );
}

describe('CardFields', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('saves a text value when the field loses focus', async () => {
    vi.mocked(fieldsApi.setFieldValue).mockResolvedValueOnce('Acme');
    setup();

    const input = screen.getByRole('textbox', { name: 'Client' });
    fireEvent.change(input, { target: { value: ' Acme ' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(fieldsApi.setFieldValue).toHaveBeenCalledWith('c1', 'f-text', 'Acme')
    );
  });

  it('does not save a text value that did not change', () => {
    setup([['f-text', 'Acme']]);

    fireEvent.blur(screen.getByRole('textbox', { name: 'Client' }));

    expect(fieldsApi.setFieldValue).not.toHaveBeenCalled();
  });

  it('refuses a number that is not one and keeps the request back', () => {
    setup();

    const input = screen.getByRole('textbox', { name: 'Estimate' });
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(fieldsApi.setFieldValue).not.toHaveBeenCalled();
  });

  it('saves a number as an exact decimal string', async () => {
    vi.mocked(fieldsApi.setFieldValue).mockResolvedValueOnce('3.5');
    setup();

    const input = screen.getByRole('textbox', { name: 'Estimate' });
    fireEvent.change(input, { target: { value: '3,5' } });
    fireEvent.blur(input);

    await waitFor(() => expect(fieldsApi.setFieldValue).toHaveBeenCalledWith('c1', 'f-num', '3.5'));
  });

  it('picks an option of a choice field and clears it', async () => {
    vi.mocked(fieldsApi.setFieldValue).mockResolvedValueOnce('o-l').mockResolvedValueOnce(null);
    setup();

    fireEvent.change(screen.getByRole('combobox', { name: 'Size' }), { target: { value: 'o-l' } });
    await waitFor(() => expect(fieldsApi.setFieldValue).toHaveBeenCalledWith('c1', 'f-sel', 'o-l'));

    fireEvent.change(screen.getByRole('combobox', { name: 'Size' }), { target: { value: '' } });
    await waitFor(() =>
      expect(fieldsApi.setFieldValue).toHaveBeenLastCalledWith('c1', 'f-sel', null)
    );
  });

  it('rolls the value back and keeps the old one when the save fails', async () => {
    vi.mocked(fieldsApi.setFieldValue).mockRejectedValueOnce(new Error('boom'));
    setup([['f-sel', 'o-s']]);

    fireEvent.change(screen.getByRole('combobox', { name: 'Size' }), { target: { value: 'o-l' } });

    await waitFor(() =>
      expect(useBoardStore.getState().view?.field_values).toEqual([
        { card_id: 'c1', field_id: 'f-sel', value: 'o-s' },
      ])
    );
  });

  it('shows the values as plain text for someone who cannot edit', () => {
    setup(
      [
        ['f-text', 'Acme'],
        ['f-sel', 'o-s'],
      ],
      false
    );

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Small')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Client' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Empty').length).toBeGreaterThan(0);
  });
});
