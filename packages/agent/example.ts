#!/usr/bin/env bun

import { config } from "dotenv";
config();

import { Agent, PermissionMode } from './src/agent.js';

async function testAgent() {
    const REPO_PATH = process.argv[2] || process.cwd();
    const TASK_ID = process.argv[3];

    if (!process.env.POSTHOG_API_KEY) {
        console.error("❌ POSTHOG_API_KEY required");
        process.exit(1);
    }

    if (!process.env.POSTHOG_PROJECT_ID) {
        console.error("❌ POSTHOG_PROJECT_ID required");
        process.exit(1);
    }

    if (!process.env.POSTHOG_API_URL) {
        console.error("❌ POSTHOG_API_URL required");
        process.exit(1);
    }

    console.log(`📁 Working in: ${REPO_PATH}`);

    const agent = new Agent({
        workingDirectory: REPO_PATH,
        posthogApiUrl: process.env.POSTHOG_API_URL || "http://localhost:8010",
        posthogApiKey: process.env.POSTHOG_API_KEY,
        posthogProjectId: process.env.POSTHOG_PROJECT_ID ? parseInt(process.env.POSTHOG_PROJECT_ID) : 1,
        onEvent: (event) => {
            if (event.type === 'token') {
                return;
            }
            console.log(`[event:${event.type}]`, event);
        },
        debug: true,
    });

    if (TASK_ID) {
        console.log(`🎯 Running task: ${TASK_ID}`);
        const posthogApi = agent.getPostHogClient();
        let poller: ReturnType<typeof setInterval> | undefined;
        try {
            // Fetch task details
            if (!posthogApi) {
                throw new Error('PostHog API client not initialized');
            }

            console.log('📝 Creating task run...');
            const taskRun = await posthogApi.createTaskRun(TASK_ID);
            console.log(`✅ Task run created: ${taskRun.id}`);



            // Set up progress polling
            console.log('🔄 Starting progress poller...');
            poller = setInterval(async () => {
                try {
                    const updatedRun = await posthogApi.getTaskRun(TASK_ID, taskRun.id);
                    console.log(`📊 Progress: ${updatedRun.status}`);
                } catch (err) {
                    console.warn('Failed to fetch task progress', err);
                }
            }, 5000);

            // Run task with plan mode
            console.log('🚀 Starting task execution...');
            await agent.runTask(TASK_ID, taskRun.id, {
                repositoryPath: REPO_PATH,
                permissionMode: PermissionMode.ACCEPT_EDITS,
                isCloudMode: false,
                autoProgress: true,
                queryOverrides: {
                    env: {
                        ...process.env,
                        POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
                        POSTHOG_API_HOST: process.env.POSTHOG_API_URL,
                        POSTHOG_AUTH_HEADER: `Bearer ${process.env.POSTHOG_API_KEY}`,
                        ANTHROPIC_API_KEY: process.env.POSTHOG_API_KEY,
                        ANTHROPIC_AUTH_TOKEN: process.env.POSTHOG_API_KEY,
                        ANTHROPIC_BASE_URL: `${process.env.POSTHOG_API_URL}/api/projects/${process.env.POSTHOG_PROJECT_ID}/llm_gateway`,
                    }
                }     
            });

            console.log("✅ Done!");
            console.log(`📁 Plan stored in: .posthog/${TASK_ID}/plan.md`);
        } finally {
            if (poller) {
                clearInterval(poller);
            }
        }
    } else {
        console.log("❌ Please provide a task ID");
    }
}

testAgent().catch(console.error);