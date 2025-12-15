
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from "@google/genai";

export interface AutomationSuggestion {
  area: string;
  tool: string;
  benefit: string;
  steps: string[];
}

export interface AutomationResponse {
  suggestions: AutomationSuggestion[];
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  public readonly isConfigured: boolean = false;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
      this.isConfigured = true;
    } else {
      console.warn("API_KEY environment variable not set. Gemini functionality will be disabled.");
    }
  }

  async getTaskAutomationSuggestions(taskDescription: string): Promise<AutomationResponse> {
    const prompt = `You are an expert automation consultant. Your goal is to help users identify repetitive tasks that can be automated to save time and reduce errors. Analyze the following user-described task and provide a list of concrete automation suggestions.

When recommending a tool, consider the task's nature and suggest the most appropriate option from the following categories, explaining briefly why it's a good fit:
- **No-Code/Low-Code Platforms (Zapier, IFTTT, Make/Integromat):** Best for connecting different web apps and services.
- **RPA (Robotic Process Automation) Tools (UiPath, Automation Anywhere):** Excellent for automating tasks within desktop applications or websites that lack APIs.
- **Web Browser Automation (Selenium, Playwright):** Suited for complex web scraping or data extraction.
- **Custom Scripting (Python, JavaScript/Node.js):** The most flexible option for unique, complex logic.
- **Built-in Application Features (e.g., Excel Macros, Gmail Filters):** Simple solutions within existing software.

Task description: "${taskDescription}"

For each suggestion, provide the following details in a clear, structured JSON format:
- area: The specific sub-task or component of the process that can be automated.
- tool: A recommended tool, script, or technology (e.g., "Python with Selenium library", "Zapier") and a brief justification.
- benefit: The primary benefit of automating this area (e.g., "Saves ~2 hours per week").
- steps: A bulleted list of high-level steps to implement the automation.
`;

    return this.generateSuggestions(prompt);
  }

  async getProjectAutomationSuggestions(projectSummary: string): Promise<AutomationResponse> {
    const prompt = `You are an expert DevOps and software automation consultant. Your goal is to help developers improve their monorepo workflows. Analyze the following summary of a local software project.

Based on this information, provide a list of concrete automation suggestions focusing on areas like CI/CD, dependency management, code quality, and local development experience.

Project Summary:
---
${projectSummary}
---

For each suggestion, provide the following details in a clear, structured JSON format:
- area: The specific process or workflow that can be automated (e.g., "Automated Testing on Pull Requests").
- tool: A recommended tool or technology (e.g., "GitHub Actions", "Husky with lint-staged"). Briefly justify your choice.
- benefit: The primary benefit of this automation (e.g., "Catches bugs early").
- steps: A bulleted list of high-level steps to implement the automation.
`;
    return this.generateSuggestions(prompt);
  }

  async getLearningAutomationSuggestions(learningSummary: string): Promise<AutomationResponse> {
    const prompt = `You are an expert in learning science and personal knowledge management (PKM). Your goal is to help users automate their learning process. Analyze the following summary of a local folder containing learning materials.

Based on the file structure and content, provide a list of concrete automation suggestions. Focus on areas like:
- **Knowledge Extraction & Summarization:** Automatically creating summaries, key takeaways, or outlines from text files.
- **Active Recall & Spaced Repetition:** Generating flashcards (e.g., for Anki) or quizzes from notes.
- **Connecting Ideas:** Suggesting ways to build a connected knowledge base (e.g., using Obsidian or Logseq) and automate the creation of links or indexes.
- **Study Planning:** Recommending a study schedule based on the number of files/modules.
- **Content Conversion:** Ideas for converting content from one format to another (e.g., text-to-speech for audio review).

Learning Materials Summary:
---
${learningSummary}
---

For each suggestion, provide the following details in a clear, structured JSON format:
- area: The specific learning task to automate (e.g., "Generate Flashcards from Notes").
- tool: A recommended tool, script, or platform (e.g., "Python script with NLTK", "Anki flashcard software", "Obsidian plugin"). Briefly justify your choice.
- benefit: The primary learning benefit (e.g., "Improves long-term retention", "Saves time on manual summarization").
- steps: A bulleted list of high-level steps to implement the automation.
`;
    return this.generateSuggestions(prompt);
  }

  private async generateSuggestions(prompt: string): Promise<AutomationResponse> {
    if (!this.isConfigured || !this.ai) {
      throw new Error("Gemini API key is not configured. Please set the API_KEY environment variable to use the application.");
    }
     try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    area: {
                      type: Type.STRING,
                      description: 'The specific sub-task, process or component of the process that can be automated.'
                    },
                    tool: {
                      type: Type.STRING,
                      description: 'A recommended tool, script, or technology to perform the automation, with a brief justification.'
                    },
                    benefit: {
                      type: Type.STRING,
                      description: 'The primary benefit of automating this area.'
                    },
                    steps: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.STRING
                      },
                      description: 'A list of high-level steps to implement the automation.'
                    },
                  },
                  required: ['area', 'tool', 'benefit', 'steps']
                }
              }
            }
          },
        },
      });

      const jsonString = response.text.trim();
      const parsedResponse = JSON.parse(jsonString);
      return parsedResponse as AutomationResponse;

    } catch (error) {
      console.error("Error calling Gemini API:", error);
      throw new Error("Failed to get automation suggestions. Please check your API key and try again.");
    }
  }
}