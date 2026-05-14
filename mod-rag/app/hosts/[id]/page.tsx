// app/hosts/[id]/page.tsx
import ManagementShell from "@/app/components/management/ManagementShell";

export const metadata = {
  title: "Manage Host",
};

type HostPageProps = {
  params: {
    id: string;
  };
};

export default function HostPage({ params }: HostPageProps) {
  return (
    <main className="space-y-4 p-4">
      <ManagementShell mode="edit" clientId={params.id} />
    </main>
  );
}