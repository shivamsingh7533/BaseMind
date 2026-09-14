"""baseline schema from models.metadata"""

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402
import sqlalchemy as sa  # noqa: E402
from pgvector.sqlalchemy import Vector  # noqa: E402


def upgrade() -> None:
    op.execute(sa.text('''CREATE TABLE announcements (
	id TEXT NOT NULL, 
	title TEXT NOT NULL, 
	body TEXT NOT NULL, 
	severity TEXT NOT NULL, 
	created_by TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
)'''))
    op.execute(sa.text('''CREATE TABLE event_logs (
	id TEXT NOT NULL, 
	user_id TEXT, 
	event_type TEXT NOT NULL, 
	severity TEXT NOT NULL, 
	detail TEXT NOT NULL, 
	ref_id TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
)'''))
    op.execute(sa.text('''CREATE TABLE users (
	id TEXT NOT NULL, 
	clerk_id TEXT NOT NULL, 
	email TEXT, 
	name TEXT, 
	platform_status TEXT DEFAULT 'active', 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
)'''))
    op.execute(sa.text('''CREATE TABLE agents (
	id TEXT NOT NULL, 
	user_id TEXT NOT NULL, 
	name TEXT NOT NULL, 
	url TEXT NOT NULL, 
	instructions TEXT DEFAULT '', 
	color TEXT DEFAULT '#0d9488', 
	status TEXT NOT NULL, 
	train_progress INTEGER, 
	queries_24h INTEGER NOT NULL, 
	avg_latency_ms INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)'''))
    op.execute(sa.text('''CREATE TABLE announcement_reads (
	id TEXT NOT NULL, 
	announcement_id TEXT NOT NULL, 
	user_id TEXT NOT NULL, 
	read_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(announcement_id) REFERENCES announcements (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)'''))
    op.execute(sa.text('''CREATE TABLE subscriptions (
	id TEXT NOT NULL, 
	user_id TEXT NOT NULL, 
	plan TEXT NOT NULL, 
	status TEXT NOT NULL, 
	stripe_customer_id TEXT, 
	current_period_end TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)'''))
    op.execute(sa.text('''CREATE TABLE conversations (
	id TEXT NOT NULL, 
	user_id TEXT NOT NULL, 
	agent_id TEXT, 
	visitor TEXT NOT NULL, 
	status TEXT NOT NULL, 
	preview TEXT NOT NULL, 
	duration_seconds INTEGER NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(agent_id) REFERENCES agents (id) ON DELETE SET NULL
)'''))
    op.execute(sa.text('''CREATE TABLE documents (
	id TEXT NOT NULL, 
	user_id TEXT NOT NULL, 
	agent_id TEXT, 
	name TEXT NOT NULL, 
	type TEXT NOT NULL, 
	detail TEXT NOT NULL, 
	status TEXT NOT NULL, 
	storage_key TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(agent_id) REFERENCES agents (id) ON DELETE SET NULL
)'''))
    op.execute(sa.text('''CREATE TABLE document_chunks (
	id TEXT NOT NULL, 
	document_id TEXT NOT NULL, 
	user_id TEXT NOT NULL, 
	agent_id TEXT, 
	content TEXT NOT NULL, 
	chunk_index INTEGER NOT NULL, 
	embedding VECTOR(768) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(agent_id) REFERENCES agents (id) ON DELETE CASCADE
)'''))
    op.execute(sa.text('''CREATE TABLE messages (
	id TEXT NOT NULL, 
	conversation_id TEXT NOT NULL, 
	role TEXT NOT NULL, 
	content TEXT NOT NULL, 
	sources TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
)'''))
    op.execute(sa.text('''CREATE INDEX ix_event_logs_user_id ON event_logs (user_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_event_logs_event_type ON event_logs (event_type)'''))
    op.execute(sa.text('''CREATE UNIQUE INDEX ix_users_clerk_id ON users (clerk_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_agents_user_id ON agents (user_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_announcement_reads_announcement_id ON announcement_reads (announcement_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_announcement_reads_user_id ON announcement_reads (user_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_conversations_user_id ON conversations (user_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_documents_user_id ON documents (user_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_document_chunks_user_id ON document_chunks (user_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_document_chunks_document_id ON document_chunks (document_id)'''))
    op.execute(sa.text('''CREATE INDEX ix_messages_conversation_id ON messages (conversation_id)'''))


def downgrade() -> None:
    op.execute(sa.text('''DROP TABLE IF EXISTS messages CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS document_chunks CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS documents CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS conversations CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS subscriptions CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS announcement_reads CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS agents CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS users CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS event_logs CASCADE'''))
    op.execute(sa.text('''DROP TABLE IF EXISTS announcements CASCADE'''))
