export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Import the newly refactored scheduler entry point
    await import("./lib/scheduler/index");
  }
}
