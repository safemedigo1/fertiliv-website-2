import { useParams } from "wouter";
import { UnifiedInboxWorkspace } from "./UnifiedInboxPage";

export default function UnifiedConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const conversationId = Number(id);
  return <UnifiedInboxWorkspace initialConversationId={Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null} />;
}
