import type { Icon } from "@phosphor-icons/react";
import {
  BugIcon,
  CodeIcon,
  FlaskIcon,
  LightbulbIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Suggestion {
  title: string;
  description: string;
  prompt: string;
  icon: Icon;
}

export const ALL_SUGGESTIONS: Suggestion[] = [
  {
    title: "Fix a small todo",
    description: "Search for a todo comment and implement it",
    prompt:
      "Search the codebase for TODO comments, select one that seems straightforward to implement, and complete the task.",
    icon: BugIcon,
  },
  {
    title: "Remove dead code",
    description: "Clean up unused functions and imports",
    prompt:
      "Identify and remove unused functions, variables, imports, or files that are no longer referenced in the codebase.",
    icon: CodeIcon,
  },
  {
    title: "Add missing tests",
    description: "Write tests for uncovered functionality",
    prompt:
      "Identify functions or modules that lack test coverage and write tests for them.",
    icon: FlaskIcon,
  },
  {
    title: "Improve error handling",
    description: "Add robust error handling where missing",
    prompt:
      "Find areas of the codebase that lack proper error handling and implement appropriate error catching and messaging.",
    icon: MagnifyingGlassIcon,
  },
  {
    title: "Consolidate duplicate logic",
    description: "Extract repeated code into reusable functions",
    prompt:
      "Scan for code duplication and refactor repeated logic into shared utility functions or modules.",
    icon: SparkleIcon,
  },
  {
    title: "Update inline documentation",
    description: "Add or improve code comments and docstrings",
    prompt:
      "Review the codebase and add missing documentation, improve unclear comments, and ensure complex logic is well-explained.",
    icon: PencilIcon,
  },
  {
    title: "Optimize slow operations",
    description: "Improve performance of inefficient code",
    prompt:
      "Identify performance bottlenecks such as inefficient loops, heavy operations, or resource-intensive processes and optimize them.",
    icon: LightbulbIcon,
  },
  {
    title: "Standardize naming conventions",
    description: "Make variable and function names consistent",
    prompt:
      "Review naming patterns across the codebase and update inconsistent variable, function, or file names to follow a unified convention.",
    icon: ListChecksIcon,
  },
];

const SUGGESTIONS_TO_SHOW = 3;

interface SuggestedTasksStore {
  currentTitles: string[];
  usageCounts: Record<string, number>;
  rotateSuggestions: () => void;
  incrementUsage: (title: string) => void;
  getSuggestions: () => Suggestion[];
}

export const useSuggestedTasksStore = create<SuggestedTasksStore>()(
  persist(
    (set, get) => ({
      currentTitles: ALL_SUGGESTIONS.slice(0, SUGGESTIONS_TO_SHOW).map(
        (s) => s.title,
      ),
      usageCounts: {},

      getSuggestions: () => {
        const { currentTitles } = get();
        return currentTitles
          .map((title) => ALL_SUGGESTIONS.find((s) => s.title === title))
          .filter((s): s is Suggestion => s !== undefined);
      },

      rotateSuggestions: () => {
        const { currentTitles } = get();
        const currentSet = new Set(currentTitles);
        const available = ALL_SUGGESTIONS.filter(
          (s) => !currentSet.has(s.title),
        );

        if (available.length === 0) {
          set({ currentTitles: [...currentTitles.slice(1), currentTitles[0]] });
          return;
        }

        const randomIndex = Math.floor(Math.random() * available.length);
        const newTitle = available[randomIndex].title;

        set({ currentTitles: [...currentTitles.slice(1), newTitle] });
      },

      incrementUsage: (title: string) => {
        const { usageCounts } = get();
        const updated = {
          ...usageCounts,
          [title]: (usageCounts[title] || 0) + 1,
        };

        const sorted = ALL_SUGGESTIONS.slice().sort((a, b) => {
          const countA = updated[a.title] || 0;
          const countB = updated[b.title] || 0;
          return countB - countA;
        });

        set({
          usageCounts: updated,
          currentTitles: sorted
            .slice(0, SUGGESTIONS_TO_SHOW)
            .map((s) => s.title),
        });
      },
    }),
    {
      name: "suggested-tasks-storage",
    },
  ),
);
