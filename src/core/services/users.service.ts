import type { IDatabase } from "../ports/db.port";
import type { UserRow, AdminUserRow } from "../db/types";
import { requireAuth, isAdmin, getAuthContext } from "../auth/context";
import { NotFoundError, ForbiddenError } from "../errors";
import { SYSTEM_USER_ID } from "../db/schema";

export class UsersService {
  constructor(private db: IDatabase) {}

  /** Count active (non-deactivated) users, excluding the system user.
   *  Used by the registration guard to check if new sign-ups should be allowed. */
  async countActiveUsers(): Promise<number> {
    const row = await this.db.queryFirst<{ count: number }>(
      "SELECT COUNT(*) as count FROM users WHERE is_active = 1 AND id != ?",
      SYSTEM_USER_ID,
    );
    return row?.count ?? 0;
  }

  /** Get the currently logged-in user's profile */
  async getMe(): Promise<UserRow> {
    const auth = requireAuth();
    const user = await this.db.queryFirst<UserRow>(
      "SELECT * FROM users WHERE id = ?", auth.id
    );
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  /** List all users — admin only, excludes system user */
  async listUsers(): Promise<AdminUserRow[]> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can list users");
    return this.db.queryAll<AdminUserRow>(`
      SELECT
        u.*,
        MAX(pa.attempted_at)         AS last_active_at,
        COUNT(DISTINCT t.id)         AS topic_count,
        COUNT(DISTINCT pa.id)        AS attempt_count
      FROM users u
      LEFT JOIN practice_attempts pa ON pa.owner_id = u.id
      LEFT JOIN topics t ON t.owner_id = u.id
      WHERE u.id != ?
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `, SYSTEM_USER_ID);
  }

  /** Get a user by internal ID — admin only */
  async getUserById(id: string): Promise<UserRow> {
    if (!isAdmin()) throw new ForbiddenError();
    const user = await this.db.queryFirst<UserRow>(
      "SELECT * FROM users WHERE id = ?", id
    );
    if (!user) throw new NotFoundError(`User '${id}' not found`);
    return user;
  }

  /** Update a user's role — admin only, cannot demote self, cannot touch system user */
  async updateRole(id: string, role: "user" | "admin"): Promise<UserRow> {
    if (!isAdmin()) throw new ForbiddenError();
    if (id === SYSTEM_USER_ID) {
      throw new ForbiddenError("Cannot change the system user's role");
    }
    const auth = requireAuth();
    if (id === auth.id && role !== "admin") {
      throw new ForbiddenError("Cannot demote yourself");
    }

    const user = await this.db.queryFirst<UserRow>(
      "SELECT * FROM users WHERE id = ?", id
    );
    if (!user) throw new NotFoundError(`User '${id}' not found`);

    await this.db.run(
      "UPDATE users SET role = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      role, id
    );

    return (await this.db.queryFirst<UserRow>(
      "SELECT * FROM users WHERE id = ?", id
    ))!;
  }

  /** Delete a user — admin only, cannot delete self, cannot delete system user */
  async deactivateUser(id: string, reason: string): Promise<UserRow> {
    if (!isAdmin()) throw new ForbiddenError();
    if (id === SYSTEM_USER_ID) throw new ForbiddenError("Cannot deactivate the system user");
    const auth = requireAuth();
    if (id === auth.id) throw new ForbiddenError("Cannot deactivate yourself");

    const user = await this.db.queryFirst<UserRow>("SELECT * FROM users WHERE id = ?", id);
    if (!user) throw new NotFoundError(`User '${id}' not found`);

    await this.db.run(
      `UPDATE users SET
        is_active = 0,
        deactivated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        deactivated_by = ?,
        deactivation_reason = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      auth.id, reason.trim() || null, id
    );
    return (await this.db.queryFirst<UserRow>("SELECT * FROM users WHERE id = ?", id))!;
  }

  async activateUser(id: string): Promise<UserRow> {
    if (!isAdmin()) throw new ForbiddenError();
    const user = await this.db.queryFirst<UserRow>("SELECT * FROM users WHERE id = ?", id);
    if (!user) throw new NotFoundError(`User '${id}' not found`);

    await this.db.run(
      `UPDATE users SET
        is_active = 1,
        deactivated_at = NULL,
        deactivated_by = NULL,
        deactivation_reason = NULL,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`, id
    );
    return (await this.db.queryFirst<UserRow>("SELECT * FROM users WHERE id = ?", id))!;
  }

  async deleteUser(id: string): Promise<void> {
    if (!isAdmin()) throw new ForbiddenError();
    if (id === SYSTEM_USER_ID) {
      throw new ForbiddenError("Cannot delete the system user");
    }
    const auth = requireAuth();
    if (id === auth.id) throw new ForbiddenError("Cannot delete yourself via admin endpoint — use DELETE /api/users/me");

    const user = await this.db.queryFirst(
      "SELECT id FROM users WHERE id = ?", id
    );
    if (!user) throw new NotFoundError(`User '${id}' not found`);
    await this.db.run("DELETE FROM users WHERE id = ?", id);
  }

  /**
   * Self-service account deletion — any authenticated user can delete their own account.
   * Cascades via FK: topics, sentences, practice_attempts, settings, paths all deleted.
   * Session deletion must be handled by the caller (route layer) after this returns.
   */
  async deleteMe(): Promise<void> {
    const auth = requireAuth();
    if (auth.id === SYSTEM_USER_ID) {
      throw new ForbiddenError("Cannot delete the system user");
    }
    await this.db.run("DELETE FROM users WHERE id = ?", auth.id);
  }
}
