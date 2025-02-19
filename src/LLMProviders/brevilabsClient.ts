import { BREVILABS_API_BASE_URL } from "@/constants";
import { getDecryptedKey } from "@/encryptionService";
import { logInfo } from "@/logger";
import { turnOffPlus, turnOnPlus } from "@/plusUtils";
import { getSettings } from "@/settings/model";
import { extractErrorDetail } from "@/utils";
import { Notice } from "obsidian";

export interface BrocaResponse {
  response: {
    tool_calls: Array<{
      tool: string;
      args: {
        [key: string]: any;
      };
    }>;
    salience_terms: string[];
  };
  elapsed_time_ms: number;
  detail?: string;
}

export interface RerankResponse {
  response: {
    object: string;
    data: Array<{
      relevance_score: number;
      index: number;
    }>;
    model: string;
    usage: {
      total_tokens: number;
    };
  };
  elapsed_time_ms: number;
}

export interface ToolCall {
  tool: any;
  args: any;
}

export interface Url4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface Pdf4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export interface WebSearchResponse {
  response: {
    choices: [
      {
        message: {
          content: string;
        };
      },
    ];
    citations: string[];
  };
  elapsed_time_ms: number;
}

export interface Youtube4llmResponse {
  response: {
    transcript: string;
  };
  elapsed_time_ms: number;
}

export class BrevilabsClient {
  private static instance: BrevilabsClient;
  private pluginVersion: string = "Unknown";

  static getInstance(): BrevilabsClient {
    if (!BrevilabsClient.instance) {
      BrevilabsClient.instance = new BrevilabsClient();
    }
    return BrevilabsClient.instance;
  }

  private checkLicenseKey() {
    if (!getSettings().plusLicenseKey) {
      new Notice(
        "Copilot Plus license key not found. Please enter your license key in the settings."
      );
      throw new Error("License key not initialized");
    }
  }

  setPluginVersion(pluginVersion: string) {
    this.pluginVersion = pluginVersion;
  }

  private async makeRequest<T>(
    endpoint: string,
    body: any,
    method = "POST",
    excludeAuthHeader = false
  ): Promise<T> {
    this.checkLicenseKey();

    const url = new URL(`${BREVILABS_API_BASE_URL}${endpoint}`);
    if (method === "GET") {
      // Add query parameters for GET requests
      Object.entries(body).forEach(([key, value]) => {
        url.searchParams.append(key, value as string);
      });
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(!excludeAuthHeader && {
          Authorization: `Bearer ${await getDecryptedKey(getSettings().plusLicenseKey)}`,
        }),
        "X-Client-Version": this.pluginVersion,
      },
      ...(method === "POST" && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    logInfo(`==== ${endpoint} request ====:`, data);

    return data;
  }

  /**
   * Validate the license key and update the isPlusUser setting.
   * @returns true if the license key is valid, false if the license key is invalid, and undefined if
   * unknown error.
   */
  async validateLicenseKey(): Promise<boolean | undefined> {
    try {
      logInfo("settings value", getSettings().plusLicenseKey);
      await this.makeRequest(
        "/license",
        {
          license_key: await getDecryptedKey(getSettings().plusLicenseKey),
        },
        "POST",
        true
      );
      turnOnPlus();
      return true;
    } catch (error) {
      if (extractErrorDetail(error).reason === "Invalid license key") {
        logInfo("validateLicenseKey: false");
        turnOffPlus();
        return false;
      }
      return;

      // Do nothing if the error is not about the invalid license key
    }
  }

  async broca(userMessage: string): Promise<BrocaResponse> {
    const brocaResponse = await this.makeRequest<BrocaResponse>("/broca", {
      message: userMessage,
    });

    return brocaResponse;
  }

  async rerank(query: string, documents: string[]): Promise<RerankResponse> {
    return this.makeRequest<RerankResponse>("/rerank", {
      query,
      documents,
      model: "rerank-2",
    });
  }

  async url4llm(url: string): Promise<Url4llmResponse> {
    return this.makeRequest<Url4llmResponse>("/url4llm", { url });
  }

  async pdf4llm(binaryContent: ArrayBuffer): Promise<Pdf4llmResponse> {
    // Convert ArrayBuffer to base64 string
    const base64Content = Buffer.from(binaryContent).toString("base64");

    return this.makeRequest<Pdf4llmResponse>("/pdf4llm", {
      pdf: base64Content,
    });
  }

  async webSearch(query: string): Promise<WebSearchResponse> {
    return this.makeRequest<WebSearchResponse>("/websearch", { query });
  }

  async youtube4llm(url: string): Promise<Youtube4llmResponse> {
    return this.makeRequest<Youtube4llmResponse>("/youtube4llm", { url });
  }
}
