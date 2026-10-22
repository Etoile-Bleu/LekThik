import type { Role } from '@lib/boardsApi';
import { ROLE_LABEL } from '@lib/roles';

import './RoleBadge.css';

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="role-badge" data-role={role}>
      {ROLE_LABEL[role]}
    </span>
  );
}
