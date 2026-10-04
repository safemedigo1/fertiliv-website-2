import { createApp } from "../../../../server/_core/createApp";
import { runExpress } from "../../../../server/_core/expressBridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const app = createApp();

async function handle(request: Request) {
  return runExpress(app, request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
