/**
 * Adds per-version title and description to all lesson JSON files.
 * Each version gets a translated title/description in its own language.
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const LESSONS_DIR = join(import.meta.dir, "../lessons");

// Translations for each lesson's title and description per language
const VERSION_META: Record<string, Record<string, { title: string; description: string }>> = {
  "day-01-the-workspace.json": {
    en: { title: "The Workspace", description: "Week 1: Daily Life & Habits" },
    de: { title: "Der Arbeitsplatz", description: "Woche 1: Alltag & Gewohnheiten" },
    ja: { title: "職場環境", description: "第1週：日常生活と習慣" },
    vi: { title: "Nơi Làm Việc", description: "Tuần 1: Đời Sống & Thói Quen Hằng Ngày" },
  },
  "day-02-ordering-at-a-caf.json": {
    en: { title: "Ordering at a Café", description: "Week 1: Daily Life & Habits" },
    de: { title: "Im Café bestellen", description: "Woche 1: Alltag & Gewohnheiten" },
    ja: { title: "カフェで注文する", description: "第1週：日常生活と習慣" },
    vi: { title: "Gọi Đồ Ở Quán Cà Phê", description: "Tuần 1: Đời Sống & Thói Quen Hằng Ngày" },
  },
  "day-03-a-technical-bug.json": {
    en: { title: "A Technical Bug", description: "Week 1: Daily Life & Habits" },
    de: { title: "Ein technischer Fehler", description: "Woche 1: Alltag & Gewohnheiten" },
    ja: { title: "技術的なバグ", description: "第1週：日常生活と習慣" },
    vi: { title: "Một Lỗi Kỹ Thuật", description: "Tuần 1: Đời Sống & Thói Quen Hằng Ngày" },
  },
  "day-04-public-transport.json": {
    en: { title: "Public Transport", description: "Week 1: Daily Life & Habits" },
    de: { title: "Öffentliche Verkehrsmittel", description: "Woche 1: Alltag & Gewohnheiten" },
    ja: { title: "公共交通機関", description: "第1週：日常生活と習慣" },
    vi: { title: "Phương Tiện Công Cộng", description: "Tuần 1: Đời Sống & Thói Quen Hằng Ngày" },
  },
  "day-05-grocery-shopping.json": {
    en: { title: "Grocery Shopping", description: "Week 1: Daily Life & Habits" },
    de: { title: "Lebensmitteleinkauf", description: "Woche 1: Alltag & Gewohnheiten" },
    ja: { title: "食料品の買い物", description: "第1週：日常生活と習慣" },
    vi: { title: "Mua Sắm Tạp Hóa", description: "Tuần 1: Đời Sống & Thói Quen Hằng Ngày" },
  },
  "day-06-weekend-plans.json": {
    en: { title: "Weekend Plans", description: "Week 2: Work & Tech" },
    de: { title: "Wochenenspläne", description: "Woche 2: Arbeit & Technik" },
    ja: { title: "週末の計画", description: "第2週：仕事とテクノロジー" },
    vi: { title: "Kế Hoạch Cuối Tuần", description: "Tuần 2: Công Việc & Công Nghệ" },
  },
  "day-07-language-learning-journey.json": {
    en: { title: "Language Learning Journey", description: "Week 2: Work & Tech" },
    de: { title: "Der Sprachenlernweg", description: "Woche 2: Arbeit & Technik" },
    ja: { title: "語学学習の旅", description: "第2週：仕事とテクノロジー" },
    vi: { title: "Hành Trình Học Ngôn Ngữ", description: "Tuần 2: Công Việc & Công Nghệ" },
  },
  "day-08-the-daily-stand-up.json": {
    en: { title: "The Daily Stand-up", description: "Week 2: Work & Tech" },
    de: { title: "Das tägliche Stand-up", description: "Woche 2: Arbeit & Technik" },
    ja: { title: "デイリースタンドアップ", description: "第2週：仕事とテクノロジー" },
    vi: { title: "Họp Đứng Hằng Ngày", description: "Tuần 2: Công Việc & Công Nghệ" },
  },
  "day-09-code-review-feedback.json": {
    en: { title: "Code Review Feedback", description: "Week 3: Advanced Work Scenarios" },
    de: { title: "Code-Review-Feedback", description: "Woche 3: Fortgeschrittene Arbeitsszenarien" },
    ja: { title: "コードレビューのフィードバック", description: "第3週：高度な業務シナリオ" },
    vi: { title: "Phản Hồi Đánh Giá Code", description: "Tuần 3: Tình Huống Công Việc Nâng Cao" },
  },
  "day-10-troubleshooting-an-api.json": {
    en: { title: "Troubleshooting an API", description: "Week 3: Advanced Work Scenarios" },
    de: { title: "API-Fehlersuche", description: "Woche 3: Fortgeschrittene Arbeitsszenarien" },
    ja: { title: "APIのトラブルシューティング", description: "第3週：高度な業務シナリオ" },
    vi: { title: "Xử Lý Sự Cố API", description: "Tuần 3: Tình Huống Công Việc Nâng Cao" },
  },
  "day-11-deployment-to-production.json": {
    en: { title: "Deployment to Production", description: "Week 3: Advanced Work Scenarios" },
    de: { title: "Deployment in die Produktion", description: "Woche 3: Fortgeschrittene Arbeitsszenarien" },
    ja: { title: "本番環境へのデプロイ", description: "第3週：高度な業務シナリオ" },
    vi: { title: "Triển Khai Lên Môi Trường Production", description: "Tuần 3: Tình Huống Công Việc Nâng Cao" },
  },
  "day-12-refactoring-legacy-code.json": {
    en: { title: "Refactoring Legacy Code", description: "Week 4: Collaboration & Growth" },
    de: { title: "Legacy-Code refaktorieren", description: "Woche 4: Zusammenarbeit & Wachstum" },
    ja: { title: "レガシーコードのリファクタリング", description: "第4週：協働と成長" },
    vi: { title: "Cải Tổ Code Cũ", description: "Tuần 4: Cộng Tác & Phát Triển" },
  },
  "day-13-documentation-and-specs.json": {
    en: { title: "Documentation and Specs", description: "Week 4: Collaboration & Growth" },
    de: { title: "Dokumentation und Spezifikationen", description: "Woche 4: Zusammenarbeit & Wachstum" },
    ja: { title: "ドキュメントと仕様", description: "第4週：協働と成長" },
    vi: { title: "Tài Liệu & Đặc Tả Kỹ Thuật", description: "Tuần 4: Cộng Tác & Phát Triển" },
  },
  "day-14-team-collaboration.json": {
    en: { title: "Team Collaboration", description: "Week 4: Collaboration & Growth" },
    de: { title: "Teamzusammenarbeit", description: "Woche 4: Zusammenarbeit & Wachstum" },
    ja: { title: "チームコラボレーション", description: "第4週：協働と成長" },
    vi: { title: "Cộng Tác Nhóm", description: "Tuần 4: Cộng Tác & Phát Triển" },
  },
};

const files = readdirSync(LESSONS_DIR).filter((f) => f.endsWith(".json"));

for (const file of files) {
  const meta = VERSION_META[file];
  if (!meta) {
    console.warn(`No version meta defined for ${file} — skipping`);
    continue;
  }

  const filePath = join(LESSONS_DIR, file);
  const lesson = JSON.parse(readFileSync(filePath, "utf-8")) as {
    title: string;
    description?: string;
    versions: Array<{ language: string; [key: string]: unknown }>;
  };

  let changed = false;
  for (const version of lesson.versions) {
    const langMeta = meta[version.language];
    if (langMeta && (!version["title"] || !version["description"])) {
      // Insert title and description right after "language" key
      const { language, ...rest } = version;
      Object.keys(version).forEach((k) => delete (version as Record<string, unknown>)[k]);
      (version as Record<string, unknown>)["language"] = language;
      (version as Record<string, unknown>)["title"] = langMeta.title;
      (version as Record<string, unknown>)["description"] = langMeta.description;
      Object.assign(version, rest);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(filePath, JSON.stringify(lesson, null, 2) + "\n", "utf-8");
    console.log(`✓ Updated ${file}`);
  } else {
    console.log(`  Skipped ${file} (already has titles)`);
  }
}

console.log("Done.");
