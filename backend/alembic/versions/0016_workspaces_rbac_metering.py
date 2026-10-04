"""Add Multi-Seat Workspaces, Granular RBAC, and Resource Workspace Links

Revision ID: 0016_workspaces_rbac_metering
Revises: 0015_omnichannel_messaging
Create Date: 2026-10-04
"""

revision = "0016_workspaces_rbac_metering"
down_revision = "0015_omnichannel_messaging"
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402


def upgrade() -> None:
    # 1. Create workspaces table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_workspaces_owner_id ON workspaces(owner_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_workspaces_slug ON workspaces(slug)")

    # 2. Create workspace_members table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_members (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'operator',
            status TEXT NOT NULL DEFAULT 'active',
            invited_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_workspace_members_workspace_id ON workspace_members(workspace_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_workspace_members_user_id ON workspace_members(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_workspace_members_email ON workspace_members(email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_workspace_members_role ON workspace_members(role)")

    # 3. Add workspace_id columns to agents, documents, conversations
    op.execute("ALTER TABLE agents ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_agents_workspace_id ON agents(workspace_id)")

    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_workspace_id ON documents(workspace_id)")

    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_conversations_workspace_id ON conversations(workspace_id)")

    # 4. Bootstrap default personal workspace for every existing user
    op.execute(
        """
        INSERT INTO workspaces (id, name, slug, owner_id)
        SELECT
            'ws_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
            COALESCE(name, 'My Workspace') || '''s Team',
            'ws-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10),
            id
        FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id)
        ON CONFLICT DO NOTHING;
        """
    )

    op.execute(
        """
        INSERT INTO workspace_members (id, workspace_id, user_id, email, role, status)
        SELECT
            'wm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
            w.id,
            w.owner_id,
            COALESCE(u.email, 'user@example.com'),
            'owner',
            'active'
        FROM workspaces w
        JOIN users u ON u.id = w.owner_id
        WHERE NOT EXISTS (
            SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = w.owner_id
        )
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_conversations_workspace_id")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS workspace_id")

    op.execute("DROP INDEX IF EXISTS ix_documents_workspace_id")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS workspace_id")

    op.execute("DROP INDEX IF EXISTS ix_agents_workspace_id")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS workspace_id")

    op.execute("DROP TABLE IF EXISTS workspace_members")
    op.execute("DROP TABLE IF EXISTS workspaces")
