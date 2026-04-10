import type { ToolDefinition } from '../types.js';
import { BashTool } from './BashTool.js';
import { FileReadTool } from './FileReadTool.js';
import { FileWriteTool } from './FileWriteTool.js';
import { FileEditTool } from './FileEditTool.js';
import { GlobTool } from './GlobTool.js';
import { GrepTool } from './GrepTool.js';

export function getAllTools(): ToolDefinition[] {
  return [BashTool, FileReadTool, FileWriteTool, FileEditTool, GlobTool, GrepTool];
}
