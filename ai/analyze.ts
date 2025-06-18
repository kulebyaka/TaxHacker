"use server"

import { ActionState } from "@/lib/actions"
import config from "@/lib/config"
import OpenAI from "openai"
import { AnalyzeAttachment } from "./attachments"
import { updateFile } from "@/models/files"

export type AnalysisResult = {
  output: Record<string, string>
  tokensUsed: number
}

// Helper function to clean JSON data by removing null characters
function cleanJsonData(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    return data.replace(/\u0000/g, '');
  }
  
  if (Array.isArray(data)) {
    return data.map(item => cleanJsonData(item));
  }
  
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = cleanJsonData(data[key]);
      }
    }
    return result;
  }
  
  return data;
}

export async function analyzeTransaction(
  prompt: string,
  schema: Record<string, unknown>,
  attachments: AnalyzeAttachment[],
  apiKey: string,
  fileId: string,
  userId: string
): Promise<ActionState<AnalysisResult>> {
  const openai = new OpenAI({
    apiKey,
  })
  console.log("RUNNING AI ANALYSIS")
  console.log("PROMPT:", prompt)
  console.log("SCHEMA:", schema)

  try {
    const response = await openai.responses.create({
      model: config.ai.modelName,
      input: [
        {
          role: "user",
          content: prompt,
        },
        {
          role: "user",
          content: attachments.map((attachment) => ({
            type: "input_image",
            detail: "auto",
            image_url: `data:${attachment.contentType};base64,${attachment.base64}`,
          })),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "transaction",
          schema: schema,
          strict: true,
        },
      },
    })

    console.log("ChatGPT response:", response.output_text)
    console.log("ChatGPT tokens used:", response.usage)

    const result = JSON.parse(response.output_text)
    
    const cleanedResult = cleanJsonData(result)
    
    await updateFile(fileId, userId, { cachedParseResult: cleanedResult })

    return { success: true, data: { output: cleanedResult, tokensUsed: response.usage?.total_tokens || 0 } }
  } catch (error) {
    console.error("AI Analysis error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze invoice",
    }
  }
}
