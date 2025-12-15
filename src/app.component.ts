
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, AutomationSuggestion } from './services/gemini.service';
import { VisualizationComponent } from './visualization/visualization.component';

// Define the File System Access API types to avoid TypeScript errors
// as they are not yet in the default lib.
declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
  }
  interface FileSystemDirectoryHandle extends FileSystemHandle {
    values(): AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
  }
  interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>;
  }
}


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, VisualizationComponent]
})
export class AppComponent {
  private readonly geminiService = inject(GeminiService);
  public readonly isGeminiConfigured: boolean;

  taskDescription = signal('');
  suggestions = signal<AutomationSuggestion[] | null>(null);
  loadingState = signal<'idle' | 'analyzing_task' | 'scanning_project' | 'scanning_learning'>('idle');
  error = signal<string | null>(null);

  examplePrompts = signal([
    "Every morning, I have to check 5 different websites for updates, copy the key information into a spreadsheet, and then email a summary to my team.",
    "For my monthly report, I download CSV files from three different systems, combine them, filter for specific clients, and then create charts in a presentation.",
    "I manage social media posts. I have to manually post the same content to Twitter, Facebook, and LinkedIn every day and then check for comments."
  ]);

  constructor() {
    this.isGeminiConfigured = this.geminiService.isConfigured;
  }

  selectExample(prompt: string): void {
    this.taskDescription.set(prompt);
  }
  
  async analyzeTask(): Promise<void> {
    const taskText = this.taskDescription().trim();
    if (!taskText) {
      this.error.set("Please describe a task to analyze.");
      return;
    }
    
    this.loadingState.set('analyzing_task');
    this.suggestions.set(null);
    this.error.set(null);

    try {
      let fullTaskDescription = taskText;

      if (window.confirm("Do you want to select a local folder to provide more context for your task?")) {
        const keyFiles = new Set(['.csv', '.json', '.xml', '.txt', '.md']);
        const summary = await this.pickAndSummarizeDirectory(keyFiles, true); 
        if (summary) {
          fullTaskDescription += `\n\n--- CONTEXT FROM LOCAL FILES ---\n${summary}`;
        }
      }

      const response = await this.geminiService.getTaskAutomationSuggestions(fullTaskDescription);
      if (response && response.suggestions.length > 0) {
        this.suggestions.set(response.suggestions);
      } else {
        this.error.set("No automation suggestions could be generated for this task. Please try a different description.");
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      this.error.set(errorMessage);
    } finally {
      this.loadingState.set('idle');
    }
  }

  async scanLocalProject(): Promise<void> {
    this.loadingState.set('scanning_project');
    this.suggestions.set(null);
    this.error.set(null);
    try {
      const keyFiles = new Set([
        'package.json', 'pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json',
        'angular.json', 'vite.config.ts', 'webpack.config.js', '.gitlab-ci.yml',
        'docker-compose.yml', 'Dockerfile', 'Jenkinsfile', 'azure-pipelines.yml',
        'tsconfig.json', 'pyproject.toml', 'requirements.txt'
      ]);
      const summary = await this.pickAndSummarizeDirectory(keyFiles);
      if (summary === null) return; // User cancelled

      const response = await this.geminiService.getProjectAutomationSuggestions(summary);
      if (response && response.suggestions.length > 0) {
        this.suggestions.set(response.suggestions);
      } else {
        this.error.set("No automation suggestions could be generated for this project. It might not contain recognizable configuration files.");
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      this.error.set(errorMessage);
    } finally {
      this.loadingState.set('idle');
    }
  }

  async scanLearningFolder(): Promise<void> {
    this.loadingState.set('scanning_learning');
    this.suggestions.set(null);
    this.error.set(null);
    try {
      const keyFiles = new Set(['.md', '.txt', '.json', '.srt', '.vtt', '.pdf', '.epub']);
      const summary = await this.pickAndSummarizeDirectory(keyFiles, true);
      if (summary === null) return; // User cancelled

      const response = await this.geminiService.getLearningAutomationSuggestions(summary);
      if (response && response.suggestions.length > 0) {
        this.suggestions.set(response.suggestions);
      } else {
        this.error.set("No learning automation suggestions could be generated. Try a folder with more text-based content like .md or .txt files.");
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      this.error.set(errorMessage);
    } finally {
      this.loadingState.set('idle');
    }
  }

  private async pickAndSummarizeDirectory(keyFileSet: Set<string>, checkExtension = false): Promise<string | null> {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('Your browser does not support scanning local folders. Please use a modern browser like Chrome or Edge.');
    }

    try {
      const directoryHandle = await window.showDirectoryPicker();
      const summary = await this.generateDirectorySummary(directoryHandle, keyFileSet, checkExtension);

      if (!summary.trim()) {
        throw new Error("The selected directory appears to be empty or could not be read.");
      }
      return summary;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null; // User cancelled, not an error.
      }
      // Re-throw other errors to be caught by the caller.
      throw err;
    }
  }

  private async generateDirectorySummary(directoryHandle: FileSystemDirectoryHandle, keyFiles: Set<string>, checkExtension: boolean, maxDepth = 3): Promise<string> {
    let summary = `Directory Root: ${directoryHandle.name}\n\n`;
    const fileTree: string[] = [];
    const importantFiles: { path: string, content: string }[] = [];
    const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', 'target', 'build', '__pycache__']);
  
    async function traverse(handle: FileSystemDirectoryHandle | FileSystemFileHandle, path: string, depth: number) {
      if (depth > maxDepth) return;
      
      const indent = '  '.repeat(depth);
      fileTree.push(`${indent}${handle.kind === 'directory' ? '📁' : '📄'} ${handle.name}`);
  
      if (handle.kind === 'directory') {
        if (IGNORE_DIRS.has(handle.name)) return;
        for await (const entry of handle.values()) {
          await traverse(entry, `${path}/${entry.name}`, depth + 1);
        }
      } else if (handle.kind === 'file') {
        const isKeyFile = checkExtension
          ? Array.from(keyFiles).some(ext => handle.name.endsWith(ext))
          : keyFiles.has(handle.name);
        
        if (isKeyFile) {
           try {
            // For non-text files, just list them. For text files, read them.
            if (handle.name.endsWith('.pdf') || handle.name.endsWith('.epub')) {
                // Not reading content, but its presence is important.
            } else {
                const file = await handle.getFile();
                if (file.size < 100 * 1024) { // Limit file size to 100KB
                   const content = await file.text();
                   importantFiles.push({ path: `${path}/${handle.name}`, content });
                }
            }
          } catch (e) {
            console.warn(`Could not read file: ${path}/${handle.name}`, e);
          }
        }
      }
    }
  
    await traverse(directoryHandle, directoryHandle.name, 0);
  
    summary += "Directory Structure:\n" + fileTree.join('\n') + "\n\n";
  
    if (importantFiles.length > 0) {
      summary += "--- Key File Contents ---\n\n";
      for (const file of importantFiles) {
        summary += `### FILE: ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      }
    }
  
    return summary;
  }
}