import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEBUG_LOG_PATH = path.join(os.homedir(), "oc-go-debug.log");

function debugLog(msg: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const line = data
    ? `[${timestamp}] ${msg} ${JSON.stringify(data)}\n`
    : `[${timestamp}] ${msg}\n`;
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch {
    // Ignore write errors
  }
}

/**
 * OpenCode Go MCP Client for making HTTP-based MCP tool calls
 */
export class OcGoMcpClient {
  private apiKey: string;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.apiKey = "";
  }

  /**
   * Initialize the client with API key from secrets
   */
  private async ensureApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      this.apiKey = (await this.secrets.get("opencode-go.apiKey")) ?? "";
    }
    return !!this.apiKey;
  }

  /**
   * Analyze an image using OpenCode Go Vision model (MiMo-V2-Omni)
   * This can be used for non-vision models to add image processing capabilities
   * @param imageData Base64-encoded image (data URL format)
   * @param prompt What to analyze in the image
   * @returns Image analysis result
   */
  async analyzeImage(imageData: string, prompt: string): Promise<string> {
    if (!(await this.ensureApiKey())) {
      throw new Error("OpenCode Go API key not found");
    }

    // Log image size for tracking
    const imageSizeBytes = Math.ceil((imageData.length * 3) / 4);
    debugLog("OCR-MIMO-CALL", {
      prompt: prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt,
      imageSizeKB: Math.round(imageSizeBytes / 1024),
    });

    // Call Vision model via chat completions endpoint
    const response = await fetch(
      "https://opencode.ai/zen/go/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "mimo-v2-omni",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageData } },
              ],
            },
          ],
          max_tokens: 16000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const result =
      data.choices?.[0]?.message?.content ?? "Failed to analyze image";
    return result;
  }
}
