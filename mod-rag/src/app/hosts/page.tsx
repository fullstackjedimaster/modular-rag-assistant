"use client";

import Link from "next/link";
import DashboardHost from "@/src/components/dashboard/DashboardHost";
import { useAppMode } from "@/src/contexts/AppModeContext";

export default function HostsPage() {
    const { isDemo, isReadOnly } = useAppMode();

    return (
        <main className="min-h-screen bg-slate-50 p-4 text-gray-900">
            <div className="space-y-4">
                <header className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h1 className="text-xl font-semibold">RAG Hosts</h1>
                            <p className="text-sm text-gray-600">
                                {isDemo
                                    ? "View configured host apps and host details. Demo mode disables configuration edits and status polling."
                                    : "Configure host apps, track connection status, and manage dock-enabled demos."}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Link
                                href="/"
                                className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Back to Demo
                            </Link>

                            {!isReadOnly ? (
                                <Link
                                    href="/host/new"
                                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                    Configure New Host
                                </Link>
                            ) : null}
                        </div>
                    </div>
                </header>

                <DashboardHost />
            </div>
        </main>
    );
}