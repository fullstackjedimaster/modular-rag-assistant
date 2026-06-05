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
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 mb-4">
                    {children}
                </div>
            </fieldset>

    )
}
