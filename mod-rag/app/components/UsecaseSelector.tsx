"use client";
import { useUsecase } from "@/app/hooks/useUseCase";
import { useEffect, useMemo } from "react";

export default function UsecaseSelector() {
    const { allUsecases, selectedId, setSelectedId, loaded } = useUsecase();
    const entries = useMemo(() => Object.values(allUsecases), [allUsecases]);

    // Resolve the selected use case object
    const selectedUsecase = useMemo(() => allUsecases[selectedId], [allUsecases, selectedId]);

    // Notify portfolio whenever the selected use case becomes available/changes
    useEffect(() => {
        if (!loaded || !selectedUsecase) return;
        const projectKey = selectedUsecase.projectKey ?? selectedUsecase.id; // fallback = id
        if (projectKey) {
            window.parent?.postMessage(
                { type: "AI_SET_USECASE", usecase: projectKey, meta: { id: selectedUsecase.id, label: selectedUsecase.label } },
                "*"
            );
        }
    }, [loaded, selectedUsecase]);

    if (!loaded) return <div className="text-sm text-gray-500">Loading use cases…</div>;
    if (!entries.length) return <div className="text-sm text-red-600">No use cases found.</div>;

    return (
        <div className="mb-4">
            <label htmlFor="usecase-select" className="block text-sm font-medium mb-1">
                Select Use Case:
            </label>
            <select
                id="usecase-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="block w-full p-2 rounded border border-gray-300 bg-white text-black"
            >
                {entries.map((u) => (
                    <option key={u.id} value={u.id}>
                        {u.label || u.id}
                    </option>
                ))}
            </select>
        </div>
    );
}
