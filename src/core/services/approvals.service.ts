import type { IDatabase } from "../ports/db.port";
import type { ApprovalRequestRow, ApprovalRequestWithTopic } from "../db/types";
import { requireAuth, isAdmin, getAuthContext } from "../auth/context";
import { NotFoundError, ForbiddenError } from "../errors";

export class ApprovalsService {
  constructor(private db: IDatabase) {}

  /** List all pending approval requests — admin only */
  async listPending(): Promise<ApprovalRequestWithTopic[]> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can view approval requests");
    return this.db.queryAll<ApprovalRequestWithTopic>(`
      SELECT
        ar.*,
        t.title          AS topic_title,
        t.description    AS topic_description,
        t.status         AS topic_status,
        u.name           AS owner_name,
        u.email          AS owner_email,
        COUNT(DISTINCT v.id)  AS version_count,
        COUNT(DISTINCT s.id)  AS sentence_count,
        GROUP_CONCAT(DISTINCT v.language_code) AS language_codes
      FROM topic_approval_requests ar
      JOIN topics t ON t.id = ar.topic_id
      JOIN users u ON u.id = ar.owner_id
      LEFT JOIN topic_language_versions v ON v.topic_id = t.id
      LEFT JOIN sentences s ON s.version_id = v.id
      WHERE ar.status = 'pending'
      GROUP BY ar.id
      ORDER BY ar.created_at ASC
    `);
  }

  /** Approve a pending request — admin only */
  async approve(requestId: string): Promise<ApprovalRequestRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can approve requests");
    const auth = requireAuth();

    const req = await this.db.queryFirst<ApprovalRequestRow>(
      "SELECT * FROM topic_approval_requests WHERE id = ?", requestId
    );
    if (!req) throw new NotFoundError(`Approval request '${requestId}' not found`);
    if (req.status !== "pending") throw new ForbiddenError("Request is no longer pending");

    await this.db.run(
      `UPDATE topic_approval_requests
       SET status = 'approved', reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      auth.id, requestId
    );
    await this.db.run(
      `UPDATE topics SET status = 'published',
       status_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       status_updated_by = ?,
       rejection_note = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      auth.id, req.topic_id
    );
    return (await this.db.queryFirst<ApprovalRequestRow>(
      "SELECT * FROM topic_approval_requests WHERE id = ?", requestId
    ))!;
  }

  /** Reject a pending request — admin only */
  async reject(requestId: string, note: string): Promise<ApprovalRequestRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can reject requests");
    const auth = requireAuth();

    const req = await this.db.queryFirst<ApprovalRequestRow>(
      "SELECT * FROM topic_approval_requests WHERE id = ?", requestId
    );
    if (!req) throw new NotFoundError(`Approval request '${requestId}' not found`);
    if (req.status !== "pending") throw new ForbiddenError("Request is no longer pending");

    const rejectionNote = note.trim() || null;
    await this.db.run(
      `UPDATE topic_approval_requests
       SET status = 'rejected', reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           rejection_note = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      auth.id, rejectionNote, requestId
    );
    await this.db.run(
      `UPDATE topics SET status = 'rejected',
       status_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       status_updated_by = ?,
       rejection_note = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      auth.id, rejectionNote, req.topic_id
    );
    return (await this.db.queryFirst<ApprovalRequestRow>(
      "SELECT * FROM topic_approval_requests WHERE id = ?", requestId
    ))!;
  }

  /** Get the latest approval request for a topic — owner or admin */
  async getForTopic(topicId: string): Promise<ApprovalRequestRow | null> {
    requireAuth();
    const auth = getAuthContext();
    const req = await this.db.queryFirst<ApprovalRequestRow>(
      "SELECT * FROM topic_approval_requests WHERE topic_id = ? ORDER BY created_at DESC LIMIT 1",
      topicId
    );
    if (!req) return null;
    if (!isAdmin() && (!auth.isAnonymous && req.owner_id !== auth.id)) return null;
    return req;
  }
}
