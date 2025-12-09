export interface GroqInferenceResult {
  projectKey: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export class GroqService {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey.startsWith("gsk_")) {
      throw new Error("Invalid Groq API key. Ensure it starts with 'gsk_'.");
    }
    this.apiKey = apiKey;
  }

  async inferHackatimeProjectKey(params: {
    projectKeys: string[];
    existingProjectKey?: string;
    codeUrl?: string;
    demoUrl?: string;
    description?: string;
  }): Promise<GroqInferenceResult | null> {
    if (params.projectKeys.length === 0) {
      return null;
    }

    let prompt: string;

    if (params.existingProjectKey) {
      prompt = `You are helping match Hackatime project keys for a hackathon submission.

The submission already has a "Hackatime Project Keys" field set to: "${params.existingProjectKey}"

The user has the following Hackatime project keys:
${params.projectKeys.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Find the project key from the list that is most similar to or matches "${params.existingProjectKey}".
Consider partial matches, case differences, and similar naming patterns.

If you find a good match, respond with EXACTLY this JSON format (no markdown, no code blocks):
{"projectKey": "exact-key-from-list", "confidence": "high|medium|low", "reasoning": "brief explanation"}

If nothing is similar, respond with exactly: null`;
    } else {
      prompt = `You are helping infer the correct Hackatime project key for a hackathon submission.

Submission details:
- Code URL: ${params.codeUrl || "Not provided"}
- Demo URL: ${params.demoUrl || "Not provided"}
- Description: ${params.description || "Not provided"}

The user has the following Hackatime project keys:
${params.projectKeys.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Based on the submission details, determine which project key most likely corresponds to this submission.
Consider:
- GitHub repository names often match project names
- Project names might be abbreviated or use different casing
- The description might mention the project name

Respond with EXACTLY this JSON format (no markdown, no code blocks):
{"projectKey": "exact-key-from-list", "confidence": "high|medium|low", "reasoning": "brief explanation"}

If you cannot determine a match with reasonable confidence, respond with exactly: null`;
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-r1-distill-llama-70b",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content || content === "null") {
      return null;
    }

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.projectKey || !params.projectKeys.includes(parsed.projectKey)) {
        return null;
      }
      
      return {
        projectKey: parsed.projectKey,
        confidence: parsed.confidence || "low",
        reasoning: parsed.reasoning || "No reasoning provided"
      };
    } catch {
      console.error("Failed to parse Groq response:", content);
      return null;
    }
  }
}
