/**
 * Bootstrap entry point - sets userData path before any service initialization.
 *
 * This MUST be the entry point for both dev and prod builds. It ensures the
 * userData path is set BEFORE any imports that might trigger electron-store
 * instantiation (which calls app.getPath('userData') in their constructors).
 *
 */
import path from "node:path";
import { app } from "electron";

const isDev = !app.isPackaged;

// Set different app names for separate single-instance locks
const appName = isDev ? "array-dev" : "Array";
app.setName(isDev ? "Twig (Development)" : "Twig");

const userDataPath = path.join(app.getPath("appData"), "@posthog", appName);
app.setPath("userData", userDataPath);

// Now dynamically import the rest of the application
// Dynamic import ensures the path is set BEFORE index.js is evaluated
// Static imports are hoisted and would run before our setPath() call
import("./index.js");
