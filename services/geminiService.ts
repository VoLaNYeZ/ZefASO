import { GoogleGenAI } from "@google/genai";
import { AsoEntry } from "../types";

// Initialize Gemini Client
const apiKey = process.env.API_KEY || ''; // In a real app, handle missing key gracefully
const ai = new GoogleGenAI({ apiKey });

export const analyzeASOTrends = async (
  entries: AsoEntry[],
  appName: string,
  geo: string,
  keyword: string
): Promise<string> => {
  if (!apiKey) {
    return "API Key is missing. Please configure your environment variables.";
  }

  // Summarize data to reduce token count
  const dataSummary = entries.map(e => 
    `Date: ${e.date}, Rank: ${e.ranking}, Installs: ${e.installs}, CPI: $${e.cpi}`
  ).join('\n');

  const prompt = `
    You are an expert ASO (App Store Optimization) Manager.
    Analyze the following performance data for App: "${appName}", GEO: "${geo}", Keyword: "${keyword}".
    
    Data:
    ${dataSummary}

    Please provide a concise analysis covering:
    1. The correlation between Ranking and Installs.
    2. Cost efficiency trends.
    3. Actionable recommendations to improve ROI and Ranking (e.g., increase bid, change keyword).
    
    Keep the tone professional and executive-summary style.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || "No analysis could be generated.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Failed to generate analysis. Please try again later.";
  }
};
