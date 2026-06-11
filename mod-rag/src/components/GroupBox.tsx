import React from "react"

interface GroupBoxProps {
    title: string
    children: React.ReactNode
}

export default function GroupBox({ title, children }: GroupBoxProps) {
    return (
            <fieldset className="fieldset-section">
                <legend>
                    {title}
                </legend>
                <div className="bg-white dark:bg-gray-900 rounded-xs shadow p-1 mb-1">
                    {children}
                </div>
            </fieldset>

    )
}
