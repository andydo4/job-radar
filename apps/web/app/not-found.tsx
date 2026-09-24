import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
      <EmptyState title="Nothing here" body="That page or program doesn't exist, or it isn't yours." action={<ButtonLink href="/grad">Back to programs</ButtonLink>} />
    </main>
  );
}
