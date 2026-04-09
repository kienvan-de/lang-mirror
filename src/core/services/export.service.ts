import type { IDatabase } from "../ports/db.port";
import type { TopicRow, VersionRow, SentenceRow } from "../db/types";
import { NotFoundError } from "../errors";

export interface ExportedSentence {
  text: string;
  notes?: Record<string, string>;
}

export interface ExportedVersion {
  language: string;
  title?: string;
  description?: string;
  voice_name?: string;
  speed?: number;
  pitch?: number;
  sentences: ExportedSentence[];
}

export interface ExportedTopic {
  title: string;
  description?: string;
  versions: ExportedVersion[];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "topic";
}

export class ExportService {
  constructor(private db: IDatabase) {}

  private async buildPayload(topic: TopicRow): Promise<ExportedTopic> {
    const versions = await this.db.queryAll<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC",
      topic.id
    );

    const exportedVersions: ExportedVersion[] = await Promise.all(
      versions.map(async v => {
        const sentences = await this.db.queryAll<Pick<SentenceRow, "text" | "notes">>(
          "SELECT text, notes FROM sentences WHERE version_id = ? ORDER BY position ASC",
          v.id
        );

        const exported: ExportedVersion = { language: v.language_code, sentences: [] };
        if (v.title)       exported.title = v.title;
        if (v.description) exported.description = v.description;
        if (v.voice_name)  exported.voice_name = v.voice_name;
        if (v.speed !== null)  exported.speed = v.speed;
        if (v.pitch !== null)  exported.pitch = v.pitch;

        exported.sentences = sentences.map(s => {
          const out: ExportedSentence = { text: s.text };
          if (s.notes) {
            try { out.notes = JSON.parse(s.notes) as Record<string, string>; }
            catch { /* skip malformed notes */ }
          }
          return out;
        });

        return exported;
      })
    );

    const payload: ExportedTopic = { title: topic.title, versions: [] };
    if (topic.description) payload.description = topic.description;
    payload.versions = exportedVersions;
    return payload;
  }

  async exportTopic(topicId: string): Promise<{ payload: ExportedTopic; filename: string }> {
    const topic = await this.db.queryFirst<TopicRow>(
      "SELECT * FROM topics WHERE id = ?", topicId
    );
    if (!topic) throw new NotFoundError(`Topic '${topicId}' not found`);

    const payload = await this.buildPayload(topic);
    return { payload, filename: `${slugify(topic.title)}.json` };
  }

  async exportAll(): Promise<Record<string, ExportedTopic>> {
    const topics = await this.db.queryAll<TopicRow>(
      "SELECT * FROM topics ORDER BY updated_at DESC"
    );

    const bundle: Record<string, ExportedTopic> = {};
    for (const topic of topics) {
      const payload = await this.buildPayload(topic);
      bundle[`${slugify(topic.title)}.json`] = payload;
    }
    return bundle;
  }
}
