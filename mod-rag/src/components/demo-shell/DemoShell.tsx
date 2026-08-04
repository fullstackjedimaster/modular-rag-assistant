"use client";

import type { ReactNode } from "react";

import styles from "./DemoShell.module.css";

interface DemoShellProps {
    eyebrow?: string;
    title: string;
    directions: string;
    children: ReactNode;
    status?: string;
}

export default function DemoShell({
    eyebrow = "Interactive Demo",
    title,
    directions,
    children,
    status,
}: DemoShellProps) {
    return (
        <main className={styles.shell}>
            <header className={styles.header}>
                <div className={styles.heading}>
                    <p className={styles.eyebrow}>{eyebrow}</p>
                    <h1>{title}</h1>
                    <p className={styles.directions}>{directions}</p>
                </div>

                {status ? (
                    <span className={styles.status}>{status}</span>
                ) : null}
            </header>

            <section className={styles.demoFrame}>
                {children}
            </section>
        </main>
    );
}
