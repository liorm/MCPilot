/**
 * XML-style tool request parser
 */

import { logger } from "../logger/index.ts";

export interface XmlNode {
  tag: string;
  content: string | XmlNode[];
}

export interface ParsedToolRequest {
  toolName: string;
  serverName: string;
  arguments: Record<string, any>;
  raw: string;
}

export class XmlParser {
  /**
   * Parse XML-style tool requests from text
   */
  public parseToolRequests(text: string): ParsedToolRequest[] {
    const requests: ParsedToolRequest[] = [];
    // Pattern specifically matches use_mcp_tool tags
    const pattern = /(<use_mcp_tool>[\s\S]*?<\/use_mcp_tool>)/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [, fullMatch] = match;
      try {
        const request = this.parseToolRequest(fullMatch);
        requests.push(request);
      } catch (error) {
        if (error instanceof XmlParseError) {
          logger.warn(`Skipping invalid tool request: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    return requests;
  }

  /**
   * Parse single tool request
   */
  private parseToolRequest(text: string): ParsedToolRequest {
    const toolMatch = /<use_mcp_tool>([\s\S]*?)<\/use_mcp_tool>/g.exec(text);
    if (!toolMatch) {
      throw new XmlParseError("Invalid tool request format");
    }

    const [, content] = toolMatch;
    const params = this.parseParameters(content);

    // Validate required parameters
    if (!params.server_name) {
      throw new XmlParseError("Missing server_name in tool request");
    }
    if (!params.tool_name) {
      throw new XmlParseError("Missing tool_name in tool request");
    }
    if (!params.arguments) {
      throw new XmlParseError("Missing arguments in tool request");
    }

    // Parse arguments as JSON if it's a string
    let toolArguments: Record<string, any>;
    if (typeof params.arguments === "string") {
      try {
        toolArguments = JSON.parse(params.arguments);
      } catch (error) {
        throw new XmlParseError("Invalid JSON in tool arguments");
      }
    } else {
      toolArguments = params.arguments;
    }

    const request: ParsedToolRequest = {
      toolName: params.tool_name,
      serverName: params.server_name,
      arguments: toolArguments,
      raw: text,
    };

    this.validateToolRequest(request);
    return request;
  }

  /**
   * Parse parameters from tool content, supporting nested structures
   */
  private parseParameters(content: string): Record<string, any> {
    const parameters: Record<string, any> = {};
    const pattern = /<([^>]+)>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const [, paramName, paramValue] = match;

      // Try to parse nested parameters
      if (this.hasNestedTags(paramValue)) {
        try {
          parameters[paramName] = this.parseParameters(paramValue);
        } catch (error) {
          // If nested parsing fails, store as string
          parameters[paramName] = this.normalizeValue(paramValue);
        }
      } else {
        parameters[paramName] = this.normalizeValue(paramValue);
      }
    }

    return parameters;
  }

  /**
   * Normalize parameter value by inferring type
   */
  private normalizeValue(value: string): any {
    const trimmed = value.trim();

    // Handle empty values
    if (!trimmed) return "";

    // Handle boolean values
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;

    // Handle numeric values
    if (!isNaN(Number(trimmed)) && trimmed !== "") {
      return Number(trimmed);
    }

    // Handle JSON objects/arrays
    try {
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        return JSON.parse(trimmed);
      }
    } catch {
      // If JSON parsing fails, return as string
    }

    return trimmed;
  }

  /**
   * Check if content has nested XML tags
   */
  private hasNestedTags(content: string): boolean {
    const tagPattern = /<([^>]+)>([\s\S]*?)<\/\1>/g;
    return tagPattern.test(content.trim());
  }

  /**
   * Validate tool name format
   */
  private isValidToolName(name: string): boolean {
    // Tool names should be lowercase with underscores
    return /^[a-z][a-z0-9_]*$/.test(name);
  }

  /**
   * Validate tool request format
   */
  public validateToolRequest(request: ParsedToolRequest): void {
    if (!request.toolName) {
      throw new XmlParseError("Missing tool name");
    }

    if (!request.serverName) {
      throw new XmlParseError("Missing server_name in tool request");
    }

    if (!request.arguments || typeof request.arguments !== "object") {
      throw new XmlParseError("Invalid or missing arguments in tool request");
    }

    // Validate server name format (allowing hyphen for server names)
    if (!/^[a-z][a-z0-9-]*$/.test(request.serverName)) {
      throw new XmlParseError(
        `Invalid server name format: ${request.serverName}`,
      );
    }

    // Validate tool name format
    if (!this.isValidToolName(request.toolName)) {
      throw new XmlParseError(`Invalid tool name format: ${request.toolName}`);
    }
  }
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlParseError";
  }
}
