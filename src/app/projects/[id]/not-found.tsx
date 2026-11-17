import { ArrowLeft, FolderX } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function ProjectNotFound() {
  return (
    <main className="lou-public-root min-h-screen flex items-center justify-center px-6 py-28 bg-(--bg-canvas) text-(--text-primary)">
      <div className="max-w-lg w-full rounded-(--radius-card) border border-(--border-subtle) bg-(--bg-surface) p-8 md:p-10 shadow-(--shadow-card) text-center">
        <div className="mx-auto w-12 h-12 rounded-full border border-brand/40 bg-(--bg-badge-highlight) flex items-center justify-center text-(--text-accent)">
          <FolderX className="w-5 h-5" aria-hidden="true" />
        </div>

        <h1 className="mt-5 font-display text-3xl sm:text-4xl uppercase tracking-tight text-(--text-primary)">
          Case Study Unavailable
        </h1>

        <p className="mt-3 text-sm text-(--text-secondary) leading-relaxed">
          This system case study either does not exist or is currently unpublished
          in the portfolio archive.
        </p>

        <div className="mt-7 flex justify-center">
          <Button
            href="/#projects"
            variant="primary"
            size="md"
            slideDirection="left"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Selected Systems</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
