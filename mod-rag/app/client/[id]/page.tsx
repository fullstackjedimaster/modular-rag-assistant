// app/client/[id]/page.tsx
import ManagementShell from "@/app/components/management/ManagementShell";

export const metadata = {
    title: "Manage Client",
};

export default function ClientPage({ params }: { params: { id: string } }) {
    const id = String(params.id);
    return <ManagementShell mode="edit" clientId={id} />;
}
