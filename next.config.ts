import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {};

// Wrap with the Workflow Development Kit's Next integration so the `'use workflow'`
// and `'use step'` directives are compiled into durable workflow/step entrypoints.
export default withWorkflow(nextConfig);
