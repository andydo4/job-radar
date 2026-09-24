import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getProgram } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { updateProgram } from "../actions";
import { ProgramForm } from "../program-form";
import { DeleteButton } from "../row-controls";

export const metadata: Metadata = { title: "Edit program" };

export default async function EditProgramPage(props: PageProps<"/grad/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase } = await requireUser();
  const program = await getProgram(supabase, id);
  if (!program) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader eyebrow={program.school} title={program.program} description="Edit anything below and save." />
      <ProgramForm action={updateProgram.bind(null, program.id)} program={program} submitLabel="Save changes" />
      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-mono text-sm font-medium text-heading">Remove this program</h2>
        <p className="font-mono text-xs text-subtle">This deletes it for good.</p>
        <DeleteButton id={program.id} />
      </section>
    </div>
  );
}
