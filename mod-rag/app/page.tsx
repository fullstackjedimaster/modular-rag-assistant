// app/page.tsx
import Link from "next/link";
import DashboardClient from "@/app/components/dashboard/DashboardClient";

export const metadata = {
    title: "RAG Clients",
};

export default function HomePage() {
    return (
        <main className="p-4 space-y-4">
            <header className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <h1 className="text-xl font-semibold">RAG Clients</h1>
                        <p className="text-sm text-gray-600">
                            Configure host apps, track connection status, and launch dock injection.
                        </p>
                    </div>

                    <Link
                        href="/client/new"
                        className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                    >
                        Configure New Client
                    </Link>
                </div>
            </header>

            <DashboardClient />
        </main>
    );
}
