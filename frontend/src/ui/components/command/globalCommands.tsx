import type { NavigateFunction } from 'react-router-dom';

import type { AssignedCard, Workspace } from '@lib/boardsApi';
import type { Command } from '@lib/commandStore';
import type { Preferences, Theme } from '@lib/prefs';

import {
  CheckCircleIcon,
  ColumnsIcon,
  HelpIcon,
  PaletteIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
} from '../ui/Icons';

interface GlobalContext {
  workspaces: Workspace[];
  myCards: AssignedCard[];
  prefs: Preferences;
  navigate: NavigateFunction;
  updatePrefs: (changes: Partial<Omit<Preferences, 'boards'>>) => void;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  createBoard: (workspaceId: string, name: string) => Promise<{ id: string } | null>;
}

const SETTINGS: Array<{ id: string; title: string; keywords: string[] }> = [
  { id: 'appearance', title: 'Appearance', keywords: ['theme', 'density', 'dark', 'light'] },
  { id: 'card', title: 'Card dialog', keywords: ['layout', 'properties'] },
  { id: 'reading', title: 'Reading', keywords: ['text size', 'font', 'dyslexia', 'spacing'] },
  { id: 'colour', title: 'Colour', keywords: ['color', 'colour blind', 'palette', 'shapes'] },
  { id: 'controls', title: 'Controls and motion', keywords: ['motion', 'focus', 'targets'] },
  { id: 'privacy', title: 'Privacy', keywords: ['gdpr', 'data', 'embeds', 'consent'] },
  { id: 'help', title: 'Keyboard and help', keywords: ['shortcuts', 'keys'] },
];

const THEMES: Array<{ value: Theme; title: string }> = [
  { value: 'light', title: 'Light' },
  { value: 'dark', title: 'Dark' },
  { value: 'contrast', title: 'High contrast' },
  { value: 'system', title: 'Follow my device' },
];

/** What can be done from anywhere in the app. */
export function globalCommands(context: GlobalContext): Command[] {
  const { workspaces, myCards, prefs, navigate } = context;
  const commands: Command[] = [
    {
      id: 'go:workspaces',
      title: 'Go to your workspaces',
      group: 'Go to',
      keywords: ['home', 'dashboard', 'boards'],
      icon: <ColumnsIcon size={16} />,
      run: () => navigate('/dashboard'),
    },
    {
      id: 'go:my-cards',
      title: 'Go to my cards',
      group: 'Go to',
      keywords: ['assigned', 'todo', 'tasks'],
      icon: <CheckCircleIcon size={16} />,
      run: () => navigate('/my-cards'),
    },
    {
      id: 'go:settings',
      title: 'Open settings',
      group: 'Go to',
      keywords: ['preferences', 'options'],
      icon: <SettingsIcon size={16} />,
      run: () => navigate('/settings'),
    },
    ...SETTINGS.map<Command>((section) => ({
      id: `go:settings:${section.id}`,
      title: `Settings: ${section.title}`,
      group: 'Go to',
      keywords: section.keywords,
      icon: <SettingsIcon size={16} />,
      searchOnly: true,
      run: () => navigate(`/settings/${section.id}`),
    })),
    ...THEMES.filter((theme) => theme.value !== prefs.theme).map<Command>((theme) => ({
      id: `theme:${theme.value}`,
      title: `Theme: ${theme.title}`,
      group: 'Appearance',
      keywords: ['appearance', 'mode', 'dark mode', 'light mode'],
      icon: <PaletteIcon size={16} />,
      searchOnly: true,
      run: () => context.updatePrefs({ theme: theme.value }),
    })),
    {
      id: 'motion:toggle',
      title: prefs.motion === 'reduce' ? 'Motion: follow my device' : 'Motion: reduce animations',
      group: 'Appearance',
      keywords: ['animations', 'reduced motion', 'accessibility'],
      icon: <PaletteIcon size={16} />,
      searchOnly: true,
      run: () => context.updatePrefs({ motion: prefs.motion === 'reduce' ? 'system' : 'reduce' }),
    },
    {
      id: 'help:keys',
      title: 'Keyboard shortcuts and help',
      group: 'Go to',
      keywords: ['shortcuts', 'keys', 'how to'],
      icon: <HelpIcon size={16} />,
      searchOnly: true,
      run: () => navigate('/settings/help'),
    },
  ];

  if (workspaces.length > 0) {
    commands.push({
      id: 'create:board',
      title: 'New board…',
      group: 'Create',
      keywords: ['add board', 'create board', 'project'],
      icon: <PlusIcon size={16} />,
      steps: [
        {
          kind: 'choose',
          prompt: 'In which workspace?',
          choices: () =>
            workspaces.map((workspace) => ({
              id: workspace.id,
              title: workspace.name,
              hint: `${workspace.boards.length} board${workspace.boards.length === 1 ? '' : 's'}`,
              icon: <UsersIcon size={16} />,
            })),
        },
        {
          kind: 'text',
          prompt: 'Name of the new board',
          validate: (text) => (text.length > 100 ? 'Use at most 100 characters.' : null),
        },
      ],
      finish: async ([workspaceId, name]) => {
        const board = await context.createBoard(workspaceId, name);
        if (board) {
          context.navigate(`/b/${board.id}`);
          return `Board “${name}” created.`;
        }
        return undefined;
      },
    });
  }

  commands.push({
    id: 'create:workspace',
    title: 'New workspace…',
    group: 'Create',
    keywords: ['add workspace', 'create workspace', 'team'],
    icon: <PlusIcon size={16} />,
    steps: [
      {
        kind: 'text',
        prompt: 'Name of the new workspace',
        validate: (text) => (text.length > 100 ? 'Use at most 100 characters.' : null),
      },
    ],
    finish: async ([name]) => {
      const workspace = await context.createWorkspace(name);
      if (workspace) {
        context.navigate('/dashboard');
        return `Workspace “${name}” created.`;
      }
      return undefined;
    },
  });

  for (const workspace of workspaces) {
    for (const board of workspace.boards) {
      commands.push({
        id: `board:${board.id}`,
        title: board.name,
        group: 'Boards',
        hint: workspace.name,
        keywords: ['open board', 'go to board'],
        icon: <ColumnsIcon size={16} />,
        searchOnly: workspaces.reduce((sum, item) => sum + item.boards.length, 0) > 6,
        run: () => navigate(`/b/${board.id}`),
      });
    }
  }

  for (const card of myCards) {
    commands.push({
      id: `mine:${card.id}`,
      title: card.title,
      group: 'My cards',
      hint: card.due_date ? `due ${card.due_date}` : 'assigned to me',
      keywords: ['task', 'assigned'],
      icon: <CheckCircleIcon size={16} />,
      searchOnly: true,
      run: () => navigate(`/b/${card.board_id}?card=${card.id}`),
    });
  }

  return commands;
}
