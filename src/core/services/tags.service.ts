import type { IDatabase } from "../ports/db.port";
import type { TagRow } from "../db/types";
import { requireAuth, isAdmin } from "../auth/context";
import { NotFoundError, ForbiddenError, ValidationError } from "../errors";

export class TagsService {
  constructor(private db: IDatabase) {}

  async list(): Promise<TagRow[]> {
    requireAuth();
    return this.db.queryAll<TagRow>(
      "SELECT * FROM tags ORDER BY type ASC, name ASC"
    );
  }

  async create(data: { type?: string; name: string; color?: string }): Promise<TagRow> {
    const auth = requireAuth();
    if (!isAdmin()) throw new ForbiddenError("Only admins can create tags");

    const name = data.name?.trim();
    if (!name) throw new ValidationError("name is required", "name");
    if (name.length > 100) throw new ValidationError("name must be 100 characters or fewer", "name");

    const type = data.type?.trim() ?? "custom";
    const color = data.color?.trim() ?? "#6366f1";

    await this.db.run(
      "INSERT INTO tags (id, type, name, color, created_by) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(), type, name, color, auth.id
    );

    return (await this.db.queryFirst<TagRow>(
      "SELECT * FROM tags WHERE type = ? AND name = ?", type, name
    ))!;
  }

  async update(id: string, data: { name?: string; color?: string; type?: string }): Promise<TagRow> {
    requireAuth();
    if (!isAdmin()) throw new ForbiddenError("Only admins can update tags");

    const tag = await this.db.queryFirst<TagRow>(
      "SELECT * FROM tags WHERE id = ?", id
    );
    if (!tag) throw new NotFoundError(`Tag '${id}' not found`);

    const name = data.name !== undefined ? data.name.trim() : tag.name;
    if (data.name !== undefined && !name) throw new ValidationError("name cannot be empty", "name");

    const color = data.color !== undefined ? data.color.trim() : tag.color;
    const type  = data.type  !== undefined ? data.type.trim()  : tag.type;

    await this.db.run(
      "UPDATE tags SET name = ?, color = ?, type = ? WHERE id = ?",
      name, color, type, id
    );

    return (await this.db.queryFirst<TagRow>("SELECT * FROM tags WHERE id = ?", id))!;
  }

  async delete(id: string): Promise<void> {
    requireAuth();
    if (!isAdmin()) throw new ForbiddenError("Only admins can delete tags");

    const tag = await this.db.queryFirst<TagRow>("SELECT id FROM tags WHERE id = ?", id);
    if (!tag) throw new NotFoundError(`Tag '${id}' not found`);

    await this.db.run("DELETE FROM tags WHERE id = ?", id);
  }
}
