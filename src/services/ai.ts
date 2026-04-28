import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface TutorialStep {
  stepNumber: number;
  elementName: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  whatToLookAt: string;
  whatItRepresents: string;
  actionOrInsight: string;
}

export interface AnalysisResult {
  context: string;
  steps: TutorialStep[];
  improvements: string[];
}

export async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string,
  mode: "Beginner" | "Intermediate" | "Expert"
): Promise<AnalysisResult> {
  const prompt = `You are an expert UX/UI analyst, business intelligence consultant, and software educator.
I am providing you with a screenshot of an interface (e.g., a dashboard, ERP screen, software UI, or error screen).
Please analyze this screenshot and generate a step-by-step interactive tutorial.

Current Mode: ${mode}
Provide explanations suited for this mode:
- Beginner: Very simple, jargon-free explanations. Focus on basic navigation and what things are.
- Intermediate: Moderate detail. Mention standard terminology and basic workflows.
- Expert: Analytical and business-level explanations. Focus on data insights, deep troubleshooting, and advanced workflows.

For each key element or area in the UI:
1. Identify its name.
2. Provide a 2D bounding box for the element. Determine the box coordinates in the format [ymin, xmin, ymax, xmax] where values are integers between 0 and 1000 representing proportions of the image dimensions.
3. Describe where to look (whatToLookAt).
4. Describe what it represents (whatItRepresents).
5. Suggest an action or insight to take (actionOrInsight).

Also, identify any design issues, data readability problems, or missing business insights, and list them as 'improvements'.

Return the result as a JSON object matching the provided schema.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { data: imageBase64, mimeType } }
        ]
      }
    ],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          context: {
            type: Type.STRING,
            description: "A brief description of what kind of interface this is (e.g., Sales Dashboard, Server Error Page, CRM)."
          },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stepNumber: { type: Type.INTEGER },
                elementName: { type: Type.STRING },
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: "[ymin, xmin, ymax, xmax] coordinates normalized from 0 to 1000."
                },
                whatToLookAt: { type: Type.STRING },
                whatItRepresents: { type: Type.STRING },
                actionOrInsight: { type: Type.STRING }
              },
              required: ["stepNumber", "elementName", "box_2d", "whatToLookAt", "whatItRepresents", "actionOrInsight"]
            }
          },
          improvements: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["context", "steps", "improvements"]
      }
    }
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(response.text) as AnalysisResult;
}

export async function chatWithScreenshot(
  imageBase64: string,
  mimeType: string,
  history: { role: "user" | "model", text: string }[],
  newMessage: string
): Promise<string> {
  const chatContents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  // Append new user message with image if it's the first turn, else just text
  // Actually, sending the image in every turn is expensive but stateless. 
  const currentMessageParts: any[] = [{ text: newMessage }];
  if (history.length === 0) {
     currentMessageParts.push({ inlineData: { data: imageBase64, mimeType } });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      // If there is history, and we want to include the image, 
      // it's best to put the image in the first user message.
      ...(history.length > 0 ? [
         { role: "user", parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: history[0].text }] },
         ...chatContents.slice(1)
      ] : []),
      { role: "user", parts: currentMessageParts }
    ],
    config: {
      temperature: 0.7
    }
  });

  return response.text || "No response";
}
