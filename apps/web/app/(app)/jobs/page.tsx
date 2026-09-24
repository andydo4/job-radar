import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Jobs" title="New since your last visit" description="The job feed arrives in Phase 2." />
      <EmptyState
        title="The job feed is on its way"
        body="The poller is already checking company career pages every 10 minutes. Next, it'll save jobs to the database so they show up here with filters, grouped listings and Save / Hide buttons."
      />
    </div>
  );
}
