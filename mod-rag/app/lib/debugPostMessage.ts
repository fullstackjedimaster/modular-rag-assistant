export function debugPostMessage(
  target: Window,
  message: unknown,
  targetOrigin: string,
  label: string
): void {
  try {
    console.groupCollapsed(
      `%c[postMessage:SEND][${label}]`,
      "color:#9333ea;font-weight:bold;"
    );
    console.log("targetOrigin:", targetOrigin);
    console.log("message:", message);
    console.log("message.json:", JSON.stringify(message, null, 2));
    console.groupEnd();
  } catch {
    console.log(`[postMessage:SEND][${label}]`, message);
  }

  target.postMessage(message, targetOrigin);
}
