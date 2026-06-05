import Link from "next/link";
import DashboardClient from "@/src/components/dashboard/DashboardClient";

export const metadata = {
    title: "RAG Clients",
};

export default function ClientsPage() {
    return (
        <main className="min-h-screen bg-slate-50 p-4 text-gray-900">
            <div className="space-y-4">
                <header className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h1 className="text-xl font-semibold">RAG Clients</h1>
                            <p className="text-sm text-gray-600">
                                Configure host apps, track connection status, and manage dock-enabled demos.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Link
                                href="/mod-rag/public"
                                className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Back to Demo
                            </Link>

                            <Link
                                href="/client/new"
                                className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Configure New Client
                            </Link>
                        </div>
                    </div>
                </header>

                <DashboardClient />
            </div>
        </main>
    );
}