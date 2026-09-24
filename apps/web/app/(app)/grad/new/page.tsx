import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { createProgram } from "../actions";
import { ProgramForm } from "../program-form";

export const metadata: Metadata = { title: "Add program" };

export default function NewProgramPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader eyebrow="Grad programs" title="Add a program" description="Only school and program are required. You can fill in the rest later." />
      <ProgramForm action={createProgram} submitLabel="Save program" />
    </div>
  );
}
