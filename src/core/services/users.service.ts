import type { IDatabase } from "../ports/db.port";
import type { UserRow } from "../db/types";
import { requireAuth, isAdmin, getAuthContext } from "../auth/context";
import { NotFoundError, ForbiddenError } from "../errors";
import { SYSTEM_USER_ID } from "../db/schema";

export class UsersService {
  constructor(private db: IDatabase) {}

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
  async listUsers(): Promise<UserRow[]> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can list users");
    return this.db.queryAll<UserRow>(
      "SELECT * FROM users WHERE id != ? ORDER BY created_at ASC",
      SYSTEM_USER_ID
    );
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
  async deleteUser(id: string): Promise<void> {
    if (!isAdmin()) throw new ForbiddenError();
    if (id === SYSTEM_USER_ID) {
      throw new ForbiddenError("Cannot delete the system user");
    }
    const auth = requireAuth();
    if (id === auth.id) throw new ForbiddenError("Cannot delete yourself");

    const user = await this.db.queryFirst(
      "SELECT id FROM users WHERE id = ?", id
    );
    if (!user) throw new NotFoundError(`User '${id}' not found`);
    await this.db.run("DELETE FROM users WHERE id = ?", id);
  }
}
