import React from "react";

interface GroupBoxProps {
    title: string;
    children: React.ReactNode;
    variant?: "compact" | "flash";
}

export default function GroupBox({ title, children, variant = "compact" }: GroupBoxProps) {
    return (
        <fieldset className={`fieldset-section fieldset-${variant}`}>
            <legend>{title}</legend>
            <div className="groupbox-body">
                {children}
            </div>
        </fieldset>
    );
}