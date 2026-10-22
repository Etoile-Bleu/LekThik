CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'admin', 'writer', 'reader')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

CREATE UNIQUE INDEX idx_workspace_members_single_owner
  ON workspace_members(workspace_id) WHERE role = 'owner';

INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
SELECT id, owner_id, 'owner', created_at FROM workspaces;

CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL CHECK (email = lower(email)),
  role VARCHAR(16) NOT NULL CHECK (role IN ('admin', 'writer', 'reader')),
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_workspace_invitations_pending
  ON workspace_invitations(workspace_id, email) WHERE status = 'pending';

CREATE INDEX idx_workspace_invitations_email
  ON workspace_invitations(email) WHERE status = 'pending';
