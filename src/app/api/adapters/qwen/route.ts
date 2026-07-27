import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Enterprise-grade Qwen CLI Home-Directory Adapter
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // The Qwen adapter writes into ~/.qwen/ and records managed file ownership in ~/.qwen/ecc-install-state.json.
    const homeDir = os.homedir();
    const qwenDir = path.join(homeDir, ".qwen");

    if (!fs.existsSync(qwenDir)) {
      fs.mkdirSync(qwenDir, { recursive: true });
    }

    // 1. Write QWEN.md (Native Qwen instructions)
    const qwenMdPath = path.join(qwenDir, "QWEN.md");
    const qwenMdContent = `# Qwen CLI Configuration
This directory contains ECC's Qwen CLI install template.
## Runtime Location
The source \`.qwen/\` directory in this repository is copied into a user's home-level \`~/.qwen/\` install root when running:
\`\`\`bash
./install.sh --target qwen --profile minimal
\`\`\`
The managed install also writes \`~/.qwen/ecc-install-state.json\` so future ECC updates and uninstalls can distinguish ECC-owned files from user-owned Qwen configuration.
## Installed Surface
The Qwen target installs the same managed manifest modules used by other harness adapters:
- \`rules/\`
- \`agents/\`
- \`commands/\`
- \`skills/\`
- \`mcp-configs/\`
Hook runtime files are intentionally not selected for Qwen until the Qwen hook/event contract is verified.
`;
    fs.writeFileSync(qwenMdPath, qwenMdContent);

    // 2. Create required subdirectories
    const subdirs = ["rules", "agents", "commands", "skills", "mcp-configs"];
    subdirs.forEach(dir => {
      const dirPath = path.join(qwenDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    // 3. Write active workflow data dynamically from the request body
    if (body.workspace) {
      const commonRulesDir = path.join(qwenDir, "rules", "common");
      if (!fs.existsSync(commonRulesDir)) {
        fs.mkdirSync(commonRulesDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(commonRulesDir, "workspace-context.md"), 
        `# Dynamic Abide Workspace Rules\n\n\`\`\`json\n${JSON.stringify(body.workspace, null, 2)}\n\`\`\`\n`
      );
    }

    // 4. Write ecc-install-state.json registry file
    const installStatePath = path.join(qwenDir, "ecc-install-state.json");
    const installState = {
      target: { id: "qwen-home" },
      request: { modules: [], profile: "minimal" },
      resolution: { selectedModules: ["workflow-quality", "rules-core", "agents-core"] },
      operations: [
        { destinationPath: ".qwen/QWEN.md", strategy: "sync" },
        { destinationPath: ".qwen/rules/common/workspace-context.md", strategy: "sync" }
      ],
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(installStatePath, JSON.stringify(installState, null, 2));

    return NextResponse.json({
      status: "success",
      message: `Successfully synchronized capabilities to ${qwenDir}`,
      path: qwenDir
    });

  } catch (error: any) {
    console.error("[QWEN ADAPTER ERROR]", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to write Qwen config", details: error.message },
      { status: 500 }
    );
  }
}
