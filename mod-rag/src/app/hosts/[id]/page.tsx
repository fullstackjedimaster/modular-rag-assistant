// app/hosts/[id]/page.tsx
import ManagementShell from "@/src/components/management/ManagementShell";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function HostPage({ params }: PageProps) {
  const { id } = await params;
  return <ManagementShell mode="edit" clientId={id} />;
}

