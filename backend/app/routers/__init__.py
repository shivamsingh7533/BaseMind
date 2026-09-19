from fastapi import APIRouter

from .admin import router as _admin
from .agents import router as _agents
from .billing import router as _billing
from .conversations import router as _conversations
from .dashboard import router as _dashboard
from .documents import router as _documents
from .public import router as _public

router = APIRouter()
router.include_router(_agents)
router.include_router(_billing)
router.include_router(_conversations)
router.include_router(_dashboard)
router.include_router(_documents)
router.include_router(_admin)
router.include_router(_public)

# Re-exports kept for test compatibility (`from app import routers` then `routers.<fn>`).
__all__ = [
    "CHAT_RATE_MAX",
    "_allow_chat",
    "_allow_chat_async",
    "_allow_rate_limited_async",
    "_chat_hits",
    "_persist_document",
    "add_message",
    "billing_cancel",
    "billing_checkout",
    "billing_status",
    "billing_configured",
    "chat",
    "conversation_detail",
    "create_agent",
    "create_conversation",
    "create_document",
    "dashboard",
    "delete_agent",
    "delete_conversation",
    "delete_document",
    "delete_workspace",
    "document_preview",
    "download_document",
    "download_document_url",
    "get_plan",
    "get_public_agent",
    "create_public_conversation",
    "get_public_conversation",
    "public_chat",
    "list_agents",
    "list_conversations",
    "list_documents",
    "mark_announcement_read",
    "op_agents",
    "op_alert",
    "op_announcements",
    "op_announcements_list",
    "op_conversations",
    "op_documents",
    "op_errors",
    "op_grounding",
    "op_tenants",
    "op_trends",
    "op_update_agent",
    "ops_check",
    "ops_status",
    "razorpay_webhook",
    "admin_delete_user",
    "admin_update_user",
    "settings_status",
    "sync_url",
    "update_agent",
    "update_conversation",
    "upload_document",
]

from .admin import (  # noqa: E402
    admin_delete_user,
    admin_update_user,
    delete_workspace,
    mark_announcement_read,
    op_agents,
    op_alert,
    op_announcements,
    op_announcements_list,
    op_conversations,
    op_documents,
    op_errors,
    op_grounding,
    op_tenants,
    op_trends,
    op_update_agent,
    ops_check,
    ops_status,
    settings_status,
)
from .agents import create_agent, delete_agent, list_agents, update_agent  # noqa: E401, E402
from .billing import (  # noqa: E401, E402
    billing_cancel,
    billing_checkout,
    billing_configured,
    billing_status,
    get_plan,
    razorpay_webhook,
)
from .conversations import (  # noqa: E402
    add_message,
    chat,
    conversation_detail,
    create_conversation,
    delete_conversation,
    list_conversations,
    update_conversation,
)
from .dashboard import dashboard  # noqa: E401, E402
from .deps import (  # noqa: E401, E402
    CHAT_RATE_MAX,
    _allow_chat,
    _allow_chat_async,
    _allow_rate_limited_async,
    _chat_hits,
)
from .documents import (  # noqa: E402
    _persist_document,
    create_document,
    delete_document,
    document_preview,
    download_document,
    download_document_url,
    list_documents,
    sync_url,
    upload_document,
)
from .public import (  # noqa: E402
    create_public_conversation,
    get_public_agent,
    get_public_conversation,
    public_chat,
)