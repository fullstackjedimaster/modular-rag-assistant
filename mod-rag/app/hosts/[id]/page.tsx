// app/hosts/[id]/page.tsx
import ManagementShell from "@/app/components/management/ManagementShell";

export const metadata = {
    title: "Manage Client",
};

export default async function HostPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const clientId = Number(id);

    return (
        <main className="p-4 space-y-4">
            <ManagementShell mode="edit" clientId={Number.isFinite(clientId) ? clientId : undefined} />
        </main>
    );
}
