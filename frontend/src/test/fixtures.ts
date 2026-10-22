import type { BoardView, TemplateCatalogue, Workspace } from '@lib/boardsApi';

export function sampleBoardView(): BoardView {
  return {
    board: { id: 'b1', workspace_id: 'w1', name: 'Roadmap' },
    role: 'owner',
    look: { background: 'default', accent: 'teal' },
    members: [
      { user_id: 'u-me', username: 'amir' },
      { user_id: 'u-wen', username: 'wen' },
    ],
    lists: [
      {
        id: 'todo',
        name: 'To do',
        wip_limit: null,
        cards: [
          {
            id: 'c1',
            list_id: 'todo',
            title: 'Write the spec',
            has_description: true,
            description_preview: '',
            label_ids: ['urgent'],
            assignee_ids: [],
            due_date: null,
          },
          {
            id: 'c2',
            list_id: 'todo',
            title: 'Design the board',
            has_description: false,
            description_preview: '',
            label_ids: [],
            assignee_ids: [],
            due_date: null,
          },
        ],
      },
      { id: 'done', name: 'Done', wip_limit: null, cards: [] },
    ],
    labels: [
      { id: 'urgent', board_id: 'b1', name: 'Urgent', color: 'red', priority: 'urgent' },
      { id: 'low', board_id: 'b1', name: 'Low', color: 'blue', priority: 'low' },
    ],
  };
}

export function sampleWorkspaces(): Workspace[] {
  return [
    {
      id: 'w1',
      name: 'Design team',
      role: 'owner',
      boards: [
        { id: 'b1', workspace_id: 'w1', name: 'Roadmap' },
        { id: 'b2', workspace_id: 'w1', name: 'Bugs' },
      ],
    },
    { id: 'w2', name: 'Side project', role: 'owner', boards: [] },
  ];
}

export function sampleCatalogue(): TemplateCatalogue {
  return {
    boards: [
      {
        id: 'sprint-planning',
        name: 'Sprint planning',
        description: 'Run a two week sprint from backlog to done.',
        category: 'Engineering',
        labels: [
          { name: 'Urgent', color: 'red', priority: 'urgent' },
          { name: 'Bug', color: 'pink', priority: 'none' },
        ],
        lists: [
          {
            name: 'Backlog',
            cards: [
              { title: 'Rate limit sign up', description: '', labels: ['Bug'] },
              { title: 'Dark mode tokens', description: '', labels: [] },
            ],
          },
          { name: 'Done', cards: [] },
        ],
      },
      {
        id: 'weekly-planner',
        name: 'Weekly planner',
        description: 'Empty your head into an inbox.',
        category: 'Personal',
        labels: [{ name: 'Today', color: 'red', priority: 'urgent' }],
        lists: [{ name: 'Inbox', cards: [] }],
      },
    ],
    workspaces: [
      {
        id: 'student-life',
        name: 'Student life',
        description: 'A board for the group project and one for the week.',
        board_ids: ['sprint-planning', 'weekly-planner'],
      },
    ],
  };
}
