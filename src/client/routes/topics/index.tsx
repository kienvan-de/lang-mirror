import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../lib/api";
import { TopicCard, TopicCardSkeleton } from "../../components/topic/TopicCard";
import { CreateTopicModal } from "../../components/topic/CreateTopicModal";

export function TopicsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: topics, isLoading, isError } = useQuery({
    queryKey: ["topics"],
    queryFn: api.getTopics,
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Topics</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {topics ? `${topics.length} topic${topics.length !== 1 ? "s" : ""}` : "Your language practice lessons"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors shadow-sm"
        >
          <span className="text-base leading-none">+</span> New Topic
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <TopicCardSkeleton key={i} />)}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">Failed to load topics</p>
          <p className="text-sm text-red-500 dark:text-red-500 mt-1">Check your connection and refresh</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && topics?.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-4">🪞</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">No topics yet</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Import a lesson or create your first topic to get started.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              Create Topic
            </button>
            <Link
              to="/import"
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Import Lesson
            </Link>
          </div>
        </div>
      )}

      {/* Topic grid */}
      {!isLoading && !isError && topics && topics.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && <CreateTopicModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
