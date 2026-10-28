import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import type { Field } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import * as fieldsApi from '@lib/fieldsApi';

import { FieldsDialog } from './FieldsDialog';

const size: Field = {
  id: 'f-size',
  board_id: 'b1',
  name: 'Size',
  kind: 'select',
  position: 0,
  show_on_card: false,
  options: [
    { id: 'o-s', name: 'Small', color: 'green' },
    { id: 'o-l', name: 'Large', color: 'red' },
  ],
};

const estimate: Field = {
  id: 'f-est',
  board_id: 'b1',
  name: 'Estimate',
  kind: 'number',
  position: 1,
  show_on_card: true,
  options: [],
};

function setup() {
  render(<FieldsDialog open onClose={() => undefined} />);
  return screen.getByRole('dialog', { name: 'Fields' });
}

describe('FieldsDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useBoardStore.setState({
      view: {
        ...sampleBoardView(),
        fields: [size, estimate],
        field_values: [{ card_id: 'c1', field_id: 'f-est', value: '3' }],
      },
      status: 'ready',
      freshIds: [],
    });
  });

  it('lists the fields with their type in words', () => {
    const dialog = setup();

    expect(within(dialog).getByText('Size')).toBeInTheDocument();
    expect(within(dialog).getByText('Estimate')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Choice', { selector: '.fields-dialog__kind' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Number', { selector: '.fields-dialog__kind' })
    ).toBeInTheDocument();
  });

  it('requires a name before a field can be added', () => {
    const dialog = setup();

    expect(within(dialog).getByRole('button', { name: 'Add the field' })).toBeDisabled();
  });

  it('adds a field of the chosen type', async () => {
    const created: Field = {
      ...estimate,
      id: 'f-due',
      name: 'Go live',
      kind: 'date',
      position: 2,
      show_on_card: false,
    };
    vi.mocked(fieldsApi.createField).mockResolvedValueOnce(created);
    const dialog = setup();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: ' Go live ' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Date/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add the field' }));

    await waitFor(() =>
      expect(fieldsApi.createField).toHaveBeenCalledWith('b1', {
        name: 'Go live',
        kind: 'date',
        options: undefined,
        show_on_card: false,
      })
    );
    expect(await within(dialog).findByText('Go live')).toBeInTheDocument();
  });

  it('starts a choice field with the options typed one per line', async () => {
    vi.mocked(fieldsApi.createField).mockResolvedValueOnce({
      ...size,
      id: 'f-env',
      name: 'Env',
      options: [],
    });
    const dialog = setup();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Env' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Choice/ }));
    fireEvent.change(within(dialog).getByLabelText('Choices (optional)'), {
      target: { value: 'Staging\nProduction, ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add the field' }));

    await waitFor(() => expect(fieldsApi.createField).toHaveBeenCalled());
    const [, input] = vi.mocked(fieldsApi.createField).mock.calls[0];
    expect(input.options?.map((option) => option.name)).toEqual(['Staging', 'Production']);
  });

  it('adds a choice to a choice field', async () => {
    vi.mocked(fieldsApi.addOption).mockResolvedValueOnce({
      ...size,
      options: [...size.options, { id: 'o-m', name: 'Medium', color: 'blue' }],
    });
    const dialog = setup();

    fireEvent.change(within(dialog).getByLabelText('New choice for Size'), {
      target: { value: 'Medium' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(fieldsApi.addOption).toHaveBeenCalledWith('b1', 'f-size', {
        name: 'Medium',
        color: 'blue',
      })
    );
    expect(await within(dialog).findByText('Medium')).toBeInTheDocument();
  });

  it('asks before deleting a field and says how many values go with it', async () => {
    vi.mocked(fieldsApi.deleteField).mockResolvedValueOnce(undefined);
    const dialog = setup();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete field Estimate' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this field?' });
    expect(within(confirm).getByText(/1 value already filled in/)).toBeInTheDocument();
    expect(fieldsApi.deleteField).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete field' }));

    await waitFor(() => expect(fieldsApi.deleteField).toHaveBeenCalledWith('b1', 'f-est'));
    await waitFor(() => expect(within(dialog).queryByText('Estimate')).not.toBeInTheDocument());
    expect(useBoardStore.getState().view?.field_values).toEqual([]);
  });

  it('turns a field on or off for the card face', async () => {
    vi.mocked(fieldsApi.updateField).mockResolvedValueOnce({ ...size, show_on_card: true });
    const dialog = setup();

    fireEvent.click(within(dialog).getAllByRole('switch', { name: /Show on the card/ })[0]);

    await waitFor(() =>
      expect(fieldsApi.updateField).toHaveBeenCalledWith('b1', 'f-size', { show_on_card: true })
    );
  });
});
