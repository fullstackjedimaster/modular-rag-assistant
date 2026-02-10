// contexts/SelectedPanelContext.tsx
import React, { createContext, useState} from "react"

export const SelectedPanelContext = createContext<{
    selectedPanel: string | null
    setSelectedPanel: (panel: string) => void
}>({
    selectedPanel: null,
    setSelectedPanel: () => {}
})

export const SelectedPanelProvider = ({ children }: { children: React.ReactNode }) => {
    const [selectedPanel, setSelectedPanel] = useState<string | null>(null)
    return (
        <SelectedPanelContext.Provider value={{ selectedPanel, setSelectedPanel }}>
            {children}
        </SelectedPanelContext.Provider>
    )
}
