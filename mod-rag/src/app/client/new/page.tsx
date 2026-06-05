// app/hosts/new/page.tsx
import ManagementShell from "@/src/components/management/ManagementShell";

export const metadata = {
    title: "Configure New Client",
};

export default function NewHostPage() {
    return (
        <main className="p-4 space-y-4">
            <ManagementShell mode="create" clientId={"new"}/>
        </main>
    );
}
